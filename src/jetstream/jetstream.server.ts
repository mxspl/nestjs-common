import { createHash } from 'node:crypto';
import {
  AckPolicy,
  type ConsumerMessages,
  DeliverPolicy,
  type JsMsg,
  jetstream,
  jetstreamManager,
} from '@nats-io/jetstream';
import { connect, type NatsConnection } from '@nats-io/transport-node';
import { type CustomTransportStrategy, Server } from '@nestjs/microservices';
import { isObservable, lastValueFrom } from 'rxjs';
import { JsonLogger, withCorrelation } from '../logging/index.js';
import {
  JETSTREAM_TRANSPORT,
  type JetStreamOptions,
} from './jetstream.types.js';
import { JetStreamContext } from './jetstream-context.js';

type Handler = NonNullable<ReturnType<Server['getHandlerByPattern']>>;

export class ServerJetStream extends Server implements CustomTransportStrategy {
  override readonly propagatesEventHandlerErrors = true;
  private connection?: NatsConnection;
  private connected = false;
  private failed = false;
  private closing = false;
  private readonly consumers: ConsumerMessages[] = [];
  private readonly loops: Promise<void>[] = [];

  constructor(
    private readonly options: JetStreamOptions,
    private readonly log: Pick<
      JsonLogger,
      'log' | 'warn' | 'error'
    > = new JsonLogger(),
  ) {
    super();
    this.transportId = options.transportId ?? JETSTREAM_TRANSPORT;
  }
  override on() {
    throw new Error('Use the transport health check for connection status.');
  }
  override unwrap<T>(): T {
    return this.connection as T;
  }
  async healthy() {
    if (
      !this.connected ||
      this.failed ||
      this.closing ||
      !this.consumers.length ||
      !this.connection ||
      this.connection.isClosed()
    )
      return false;
    try {
      await this.connection.flush();
      return true;
    } catch {
      return false;
    }
  }
  override listen(callback: (...args: unknown[]) => void) {
    void this.start().then(
      () => callback(),
      async () => {
        await this.close();
        callback(
          new Error(
            'JetStream consumer startup failed. Check broker access and stream configuration.',
          ),
        );
      },
    );
  }
  private async start() {
    const patterns = [...this.messageHandlers.keys()];
    if (!patterns.length)
      throw new Error('No JetStream event handlers registered');
    this.connection = await connect({
      ...this.options.connection,
      timeout: 2000,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 1000,
      pingInterval: 10_000,
      maxPingOut: 2,
    });
    this.connected = true;
    const nc = this.connection;
    void (async () => {
      for await (const status of nc.status()) {
        if (status.type === 'disconnect') this.connected = false;
        if (status.type === 'reconnect') this.connected = true;
      }
    })().catch(() => {
      this.connected = false;
    });
    void nc.closed().then(() => {
      this.connected = false;
    });
    const manager = await jetstreamManager(nc, { timeout: 2000 });
    const subjects = patterns.map(
      (pattern) => (this.options.subjectPrefix ?? '') + pattern,
    );
    // Streams are provisioned by infrastructure; only inspect them here.
    const info = await manager.streams.info(this.options.stream.name);
    if (
      !subjects.every((subject) => info.config.subjects?.includes(subject)) ||
      info.config.max_age <= 0 ||
      info.config.max_age > this.options.stream.maxAgeMs * 1_000_000
    )
      throw new Error(
        'Stream must cover handler subjects within the configured retention',
      );
    const failureInfo = await manager.streams.info(
      this.options.deadLetter.stream,
    );
    if (
      !failureInfo.config.subjects?.includes(
        (this.options.subjectPrefix ?? '') + this.options.deadLetter.subject,
      ) ||
      failureInfo.config.max_age <= 0 ||
      failureInfo.config.max_age > this.options.deadLetter.maxAgeMs * 1_000_000
    )
      throw new Error(
        'Failure stream must cover its subject within the configured retention',
      );
    for (const [pattern, handler] of this.messageHandlers) {
      const durable =
        patterns.length === 1
          ? this.options.durable
          : `${this.options.durable}-${createHash('sha256').update(pattern).digest('hex').slice(0, 10)}`;
      await manager.consumers.add(this.options.stream.name, {
        durable_name: durable,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        filter_subject: (this.options.subjectPrefix ?? '') + pattern,
        ack_wait: this.options.ackWaitMs * 1_000_000,
        max_ack_pending: 1,
        // Bound handler attempts, but allow failure publication to retry
        // if the broker is temporarily unavailable at the exhaustion boundary.
        max_deliver: -1,
      });
      const consumer = await jetstream(nc).consumers.get(
        this.options.stream.name,
        durable,
      );
      const messages = await consumer.consume({ max_messages: 1 });
      this.consumers.push(messages);
      this.loops.push(this.consume(messages, handler));
    }
    this.log.log('JetStream consumer ready');
  }
  private async consume(messages: ConsumerMessages, handler: Handler) {
    try {
      for await (const message of messages) {
        await withCorrelation(message.headers?.get('Nats-Msg-Id'), () =>
          this.processMessage(message, handler),
        );
      }
      if (!this.closing)
        throw new Error('JetStream consumer stopped unexpectedly');
    } catch {
      if (!this.closing) {
        this.failed = true;
        this.log.error('JetStream consumer stopped; readiness is down');
      }
    }
  }
  async processMessage(message: JsMsg, handler: Handler) {
    if (message.info.deliveryCount > 1) this.options.metrics?.redelivered.inc();
    if (message.info.deliveryCount > this.options.maxDeliver) {
      await this.deadLetter(message);
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(message.string());
    } catch {
      message.term('invalid');
      return;
    }
    const keepAlive = setInterval(
      () => message.working(),
      Math.max(100, Math.floor(this.options.ackWaitMs / 3)),
    );
    keepAlive.unref();
    try {
      const result: unknown = await handler(
        payload,
        new JetStreamContext(message),
      );
      if (isObservable(result))
        await lastValueFrom(result, { defaultValue: undefined });
      message.ack();
    } catch (error) {
      const failure = this.options.classifyError?.(error) ?? {
        reason: 'handler_failure',
        retryable: true,
      };
      if (!failure.retryable) {
        message.term(failure.reason);
        this.log.warn('JetStream message discarded');
      } else if (message.info.deliveryCount >= this.options.maxDeliver)
        await this.deadLetter(message);
      else {
        message.nak(
          Math.min(
            30_000,
            this.options.retryDelayMs * 2 ** (message.info.deliveryCount - 1),
          ),
        );
        this.log.warn('JetStream handler will be retried');
      }
    } finally {
      clearInterval(keepAlive);
    }
  }
  private async deadLetter(message: JsMsg) {
    try {
      const id = message.headers?.get('Nats-Msg-Id');
      const failure = {
        messageId: id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : undefined,
        sourceSubject: message.subject,
        sourceStream: this.options.stream.name,
        sourceSequence: message.info.streamSequence,
        attempts: message.info.deliveryCount,
        reason: 'retry_exhausted' as const,
        occurredAt: new Date().toISOString(),
      };
      const payload =
        this.options.deadLetter.createPayload?.(failure) ?? failure;
      // Consumption starts only after a connection has been established.
      // biome-ignore lint/style/noNonNullAssertion: connection lives until consumption stops
      await jetstream(this.connection!, { timeout: 2000 }).publish(
        (this.options.subjectPrefix ?? '') + this.options.deadLetter.subject,
        JSON.stringify(payload),
        {
          msgID: `${this.options.stream.name}-${this.options.durable}-${message.info.streamSequence}`,
        },
      );
      message.term('retry_exhausted');
      this.options.metrics?.deadLettered.inc();
      this.log.error('JetStream handler exhausted; failure recorded');
    } catch {
      message.nak(this.options.retryDelayMs);
      this.log.error('Could not record JetStream failure; retrying');
    }
  }
  override async close() {
    this.closing = true;
    for (const consumer of this.consumers) await consumer.close();
    await Promise.allSettled(this.loops);
    if (this.connection && !this.connection.isClosed())
      await this.connection.drain();
    this.connected = false;
  }
}
