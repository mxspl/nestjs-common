import type { JsMsg } from '@nats-io/jetstream';
import { EMPTY, Subject, throwError } from 'rxjs';
import { ServerJetStream } from './jetstream.server.js';
import type { JetStreamOptions } from './jetstream.types.js';
import { JetStreamContext } from './jetstream-context.js';

const broker = vi.hoisted(() => ({
  publish: vi.fn(),
  connect: vi.fn(),
  streamInfo: vi.fn(),
  consumerAdd: vi.fn(),
  consumerGet: vi.fn(),
}));
vi.mock('@nats-io/jetstream', async (original) => ({
  ...(await original<typeof import('@nats-io/jetstream')>()),
  jetstream: () => ({
    publish: broker.publish,
    consumers: { get: broker.consumerGet },
  }),
  jetstreamManager: async () => ({
    streams: { info: broker.streamInfo },
    consumers: { add: broker.consumerAdd },
  }),
}));
vi.mock('@nats-io/transport-node', () => ({ connect: broker.connect }));

const options: JetStreamOptions = {
  connection: { servers: ['nats://broker:4222'] },
  serviceName: 'org-service',
  stream: { maxAgeMs: 604_800_000 },
  subjectPrefix: 'test.',
  ackWaitMs: 1000,
  maxDeliver: 3,
  retryDelayMs: 100,
  deadLetter: { maxAgeMs: 86_400_000 },
};
const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
function server(overrides: Partial<JetStreamOptions> = {}) {
  return new ServerJetStream({ ...options, ...overrides }, logger);
}

it('uses the configured transport identity', () => {
  const transportId = Symbol('PASSKEY_TRANSPORT');
  expect(server({ transportId }).transportId).toBe(transportId);
});
function message(
  deliveryCount = 1,
  id = 'event-123',
  data = '{"userId":"user-123"}',
) {
  return {
    subject: 'test.user.account.signed-up',
    string: () => data,
    headers: { get: () => id },
    info: {
      deliveryCount,
      streamSequence: 42,
      stream: 'TEST_USER_ACCOUNT',
      consumer: 'org-service_user-account-signed-up',
    },
    ack: vi.fn(),
    nak: vi.fn(),
    term: vi.fn(),
    working: vi.fn(),
  } as unknown as JsMsg & {
    ack: ReturnType<typeof vi.fn>;
    nak: ReturnType<typeof vi.fn>;
    term: ReturnType<typeof vi.fn>;
    working: ReturnType<typeof vi.fn>;
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  broker.publish.mockReset().mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

it('awaits Promise handlers and passes the decoded event and message context', async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const handler = vi.fn(() => pending);
  const msg = message();
  const operation = server().processMessage(msg, handler);
  expect(msg.ack).not.toHaveBeenCalled();
  expect(handler.mock.calls[0]).toEqual([
    { userId: 'user-123' },
    expect.any(JetStreamContext),
  ]);
  finish();
  await operation;
  expect(msg.ack).toHaveBeenCalledOnce();
});
it('awaits Observable completion, including empty Observables', async () => {
  const values = new Subject<void>();
  const msg = message();
  const operation = server().processMessage(msg, () => values);
  await Promise.resolve();
  values.next();
  expect(msg.ack).not.toHaveBeenCalled();
  values.complete();
  await operation;
  expect(msg.ack).toHaveBeenCalledOnce();
  const empty = message();
  await server().processMessage(empty, () => EMPTY);
  expect(empty.ack).toHaveBeenCalledOnce();
});
it('terminates invalid JSON without invoking the handler', async () => {
  const msg = message(1, 'event-123', 'invalid json');
  const handler = vi.fn();
  await server().processMessage(msg, handler);
  expect(handler).not.toHaveBeenCalled();
  expect(msg.term).toHaveBeenCalledWith('invalid');
});
it('retries unknown thrown and Observable errors without logging their contents', async () => {
  const transport = server();
  const thrown = message();
  await transport.processMessage(thrown, () => {
    throw new Error('private payload');
  });
  expect(thrown.nak).toHaveBeenCalledWith(100);
  const observable = message(2);
  await transport.processMessage(observable, () =>
    throwError(() => new Error('private payload')),
  );
  expect(observable.nak).toHaveBeenCalledWith(200);
  expect(observable.ack).not.toHaveBeenCalled();
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
    'private payload',
  );
});
it('uses the service error classifier for permanent failures', async () => {
  const msg = message();
  await server({
    classifyError: () => ({ reason: 'invalid_user', retryable: false }),
  }).processMessage(msg, () => {
    throw new Error();
  });
  expect(msg.term).toHaveBeenCalledWith('invalid_user');
  expect(msg.nak).not.toHaveBeenCalled();
});
it('caps exponential backoff at thirty seconds', async () => {
  const msg = message(10);
  await server({ maxDeliver: 20 }).processMessage(msg, () =>
    Promise.reject(new Error()),
  );
  expect(msg.nak).toHaveBeenCalledWith(30_000);
});
it('extends the ack window while handlers run and stops the heartbeat afterward', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const msg = message();
  const operation = server().processMessage(msg, () => pending);
  await vi.advanceTimersByTimeAsync(1000);
  expect(msg.working).toHaveBeenCalledTimes(3);
  finish();
  await operation;
  await vi.advanceTimersByTimeAsync(1000);
  expect(msg.working).toHaveBeenCalledTimes(3);
});
it('publishes metadata before terminating and never reruns exhausted handlers', async () => {
  const handler = vi.fn().mockRejectedValue(new Error());
  const metrics = {
    redelivered: { inc: vi.fn() },
    deadLettered: { inc: vi.fn() },
  };
  const transport = server({ metrics });
  const exhausted = message(3);
  broker.publish.mockRejectedValueOnce(new Error());
  await transport.processMessage(exhausted, handler);
  expect(exhausted.term).not.toHaveBeenCalled();
  expect(exhausted.nak).toHaveBeenCalledWith(100);
  const retry = message(4);
  await transport.processMessage(retry, handler);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(retry.term).toHaveBeenCalledWith('retry_exhausted');
  const [subject, data, publishOptions] = broker.publish.mock.calls[1];
  expect(subject).toBe('test.user.account.failure.org-service');
  expect(JSON.parse(data)).toEqual({
    sourceSubject: 'test.user.account.signed-up',
    sourceStream: 'TEST_USER_ACCOUNT',
    sourceSequence: 42,
    attempts: 4,
    reason: 'retry_exhausted',
    occurredAt: expect.any(String),
  });
  expect(publishOptions).toEqual({
    msgID: 'TEST_USER_ACCOUNT-org-service_user-account-signed-up-42',
  });
  expect(metrics.deadLettered.inc).toHaveBeenCalledOnce();
  expect(metrics.redelivered.inc).toHaveBeenCalledTimes(2);
});
it('allows service failure envelopes without passing raw event data', async () => {
  const createPayload = vi.fn(({ sourceSequence }) => ({
    sequence: sourceSequence,
  }));
  await server({
    deadLetter: { ...options.deadLetter, createPayload },
  }).processMessage(message(4), vi.fn());
  expect(createPayload.mock.calls[0][0]).not.toHaveProperty('userId');
  expect(JSON.parse(broker.publish.mock.calls[0][1])).toEqual({
    sequence: 42,
  });
});
it('keeps message IDs and payloads out of failure records', async () => {
  await server().processMessage(message(4, 'private@example.test'), vi.fn());
  const record = broker.publish.mock.calls[0][1];
  expect(record).not.toContain('private@example.test');
  expect(record).not.toContain('user-123');
});
it('exposes message metadata in the Nest context', () => {
  const context = new JetStreamContext(message(3));
  expect(context.msgId).toBe('event-123');
  expect(context.subject).toBe('test.user.account.signed-up');
  expect(context.deliveryCount).toBe(3);
  expect(context.redeliveryCount).toBe(2);
  expect(context.headers?.get('Nats-Msg-Id')).toBe('event-123');
});

function listen(transport: ServerJetStream) {
  return new Promise<unknown>((resolve) => transport.listen(resolve));
}
function setupBroker() {
  const connection = {
    status: async function* () {},
    closed: () => new Promise<void>(() => {}),
    isClosed: () => false,
    flush: vi.fn().mockResolvedValue(undefined),
    drain: vi.fn().mockResolvedValue(undefined),
  };
  broker.connect.mockResolvedValue(connection);
  broker.streamInfo.mockImplementation(async (name: string) => ({
    config: {
      subjects:
        name === 'TEST_USER_ACCOUNT'
          ? ['test.user.account.*']
          : ['test.user.account.failure.*'],
      max_age:
        (name === 'TEST_USER_ACCOUNT'
          ? options.stream.maxAgeMs
          : options.deadLetter.maxAgeMs) * 1_000_000,
    },
  }));
  const consumers: { close: ReturnType<typeof vi.fn> }[] = [];
  broker.consumerGet.mockImplementation(async () => ({
    consume: async () => {
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const messages = {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            await pending;
            return { done: true, value: undefined };
          },
        }),
        close: vi.fn(async () => {
          finish();
        }),
      };
      consumers.push(messages);
      return messages;
    },
  }));
  return { connection, consumers };
}
it('uses service retention, filtered durable consumers, readiness and graceful close', async () => {
  const { connection, consumers } = setupBroker();
  const transport = server();
  transport.addHandler('user.account.signed-up', vi.fn(), true);
  expect(await transport.healthy()).toBe(false);
  expect(await listen(transport)).toBeUndefined();
  expect(broker.streamInfo).toHaveBeenCalledWith('TEST_USER_ACCOUNT');
  expect(broker.streamInfo).toHaveBeenCalledWith('TEST_USER_ACCOUNT_FAILURE');
  expect(broker.consumerAdd).toHaveBeenCalledWith(
    'TEST_USER_ACCOUNT',
    expect.objectContaining({
      durable_name: 'org-service_user-account-signed-up',
      filter_subject: 'test.user.account.signed-up',
      ack_wait: 1_000_000_000,
      max_deliver: -1,
    }),
  );
  expect(await transport.healthy()).toBe(true);
  await transport.close();
  expect(consumers[0].close).toHaveBeenCalledOnce();
  expect(connection.drain).toHaveBeenCalledOnce();
  expect(await transport.healthy()).toBe(false);
});
it('names one durable per handler subject after the service', async () => {
  setupBroker();
  const transport = server();
  transport.addHandler('user.account.signed-up', vi.fn(), true);
  transport.addHandler('user.account.deleted', vi.fn(), true);
  expect(await listen(transport)).toBeUndefined();
  expect(
    broker.consumerAdd.mock.calls.map(([, config]) => config.durable_name),
  ).toEqual([
    'org-service_user-account-signed-up',
    'org-service_user-account-deleted',
  ]);
  expect(broker.consumerGet).toHaveBeenCalledWith(
    'TEST_USER_ACCOUNT',
    'org-service_user-account-deleted',
  );
  await transport.close();
});
it('accepts streams that list exact subjects', async () => {
  setupBroker();
  broker.streamInfo.mockImplementation(async (name: string) => ({
    config: {
      subjects:
        name === 'TEST_USER_ACCOUNT'
          ? ['test.user.account.signed-up']
          : ['test.user.account.failure.org-service'],
      max_age: 86_400_000_000_000,
    },
  }));
  const transport = server();
  transport.addHandler('user.account.signed-up', vi.fn(), true);
  expect(await listen(transport)).toBeUndefined();
  await transport.close();
});
it('fails startup when the stream does not cover a handler subject', async () => {
  const { connection } = setupBroker();
  broker.streamInfo.mockResolvedValue({
    config: { subjects: ['test.user.account.signed-up'], max_age: 1 },
  });
  const transport = server();
  transport.addHandler('user.account.signed-up', vi.fn(), true);
  transport.addHandler('user.account.deleted', vi.fn(), true);
  expect(await listen(transport)).toBeInstanceOf(Error);
  expect(broker.consumerAdd).not.toHaveBeenCalled();
  expect(connection.drain).toHaveBeenCalledOnce();
});
it('rejects handlers from different streams before connecting', async () => {
  setupBroker();
  const transport = server();
  transport.addHandler('user.account.signed-up', vi.fn(), true);
  transport.addHandler('auth.otp.requested', vi.fn(), true);
  expect(await listen(transport)).toBeInstanceOf(Error);
  expect(broker.connect).not.toHaveBeenCalled();
});
it.each([
  'users.signed-up',
  'user.account.failure',
])('rejects the unconventional subject %s before connecting', async (subject) => {
  setupBroker();
  const transport = server();
  transport.addHandler(subject, vi.fn(), true);
  expect(await listen(transport)).toBeInstanceOf(Error);
  expect(broker.connect).not.toHaveBeenCalled();
});
it('fails startup and drains the connection for incompatible existing stream retention', async () => {
  const { connection } = setupBroker();
  broker.streamInfo.mockResolvedValue({
    config: { subjects: ['test.user.account.signed-up'], max_age: 0 },
  });
  const transport = server();
  transport.addHandler('user.account.signed-up', vi.fn(), true);
  expect(await listen(transport)).toBeInstanceOf(Error);
  expect(broker.consumerAdd).not.toHaveBeenCalled();
  expect(connection.drain).toHaveBeenCalledOnce();
  expect(await transport.healthy()).toBe(false);
});
it('fails startup without creating streams when a stream is missing', async () => {
  const { connection } = setupBroker();
  broker.streamInfo.mockRejectedValue(new Error('stream not found'));
  const transport = server();
  transport.addHandler('user.account.signed-up', vi.fn(), true);
  expect(await listen(transport)).toBeInstanceOf(Error);
  expect(broker.streamInfo).toHaveBeenCalledWith('TEST_USER_ACCOUNT');
  expect(broker.consumerAdd).not.toHaveBeenCalled();
  expect(connection.drain).toHaveBeenCalledOnce();
});
it('fails startup when the failure stream is missing', async () => {
  const { connection } = setupBroker();
  const streams = broker.streamInfo.getMockImplementation();
  broker.streamInfo.mockImplementation(async (name: string) => {
    if (name === 'TEST_USER_ACCOUNT_FAILURE')
      throw new Error('stream not found');
    return streams?.(name);
  });
  const transport = server();
  transport.addHandler('user.account.signed-up', vi.fn(), true);
  expect(await listen(transport)).toBeInstanceOf(Error);
  expect(broker.consumerAdd).not.toHaveBeenCalled();
  expect(connection.drain).toHaveBeenCalledOnce();
});
it('rejects startup without any event handlers', async () => {
  expect(await listen(server())).toBeInstanceOf(Error);
  expect(broker.connect).not.toHaveBeenCalled();
});
