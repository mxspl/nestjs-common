import type { JsMsg } from '@nats-io/jetstream';
import { EMPTY, Subject, throwError } from 'rxjs';
import { ServerJetStream } from './jetstream.server.js';
import type { JetStreamOptions } from './jetstream.types.js';
import { JetStreamContext } from './jetstream-context.js';

const broker = vi.hoisted(() => ({
  publish: vi.fn(),
  connect: vi.fn(),
  streamInfo: vi.fn(),
  streamAdd: vi.fn(),
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
    streams: { info: broker.streamInfo, add: broker.streamAdd },
    consumers: { add: broker.consumerAdd },
  }),
}));
vi.mock('@nats-io/transport-node', () => ({ connect: broker.connect }));

const options: JetStreamOptions = {
  connection: { servers: ['nats://broker:4222'] },
  stream: { name: 'USERS', maxAgeMs: 604_800_000 },
  durable: 'org-default-team',
  manageStreams: false,
  subjectPrefix: 'test.',
  ackWaitMs: 1000,
  maxDeliver: 3,
  retryDelayMs: 100,
  deadLetter: {
    stream: 'FAILURES',
    subject: 'users.failed',
    maxAgeMs: 86_400_000,
  },
};
const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
function server(overrides: Partial<JetStreamOptions> = {}) {
  return new ServerJetStream({ ...options, ...overrides }, logger);
}
function message(
  deliveryCount = 1,
  id = 'event-123',
  data = '{"userId":"user-123"}',
) {
  return {
    subject: 'test.users.signed-up',
    string: () => data,
    headers: { get: () => id },
    info: { deliveryCount, streamSequence: 42 },
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
  expect(subject).toBe('test.users.failed');
  expect(JSON.parse(data)).toEqual({
    messageId: 'event-123',
    sourceSubject: 'test.users.signed-up',
    sourceStream: 'USERS',
    sourceSequence: 42,
    attempts: 4,
    reason: 'retry_exhausted',
    occurredAt: expect.any(String),
  });
  expect(publishOptions).toEqual({ msgID: 'USERS-org-default-team-42' });
  expect(metrics.deadLettered.inc).toHaveBeenCalledOnce();
  expect(metrics.redelivered.inc).toHaveBeenCalledTimes(2);
});
it('allows service failure envelopes without passing raw event data', async () => {
  const createPayload = vi.fn(({ messageId }) => ({ requestId: messageId }));
  await server({
    deadLetter: { ...options.deadLetter, createPayload },
  }).processMessage(message(4), vi.fn());
  expect(createPayload.mock.calls[0][0]).not.toHaveProperty('userId');
  expect(JSON.parse(broker.publish.mock.calls[0][1])).toEqual({
    requestId: 'event-123',
  });
});
it('does not copy unsafe message IDs into failure records', async () => {
  await server().processMessage(message(4, 'private@example.test'), vi.fn());
  expect(JSON.parse(broker.publish.mock.calls[0][1])).not.toHaveProperty(
    'messageId',
  );
});
it('exposes message metadata in the Nest context', () => {
  const context = new JetStreamContext(message(3));
  expect(context.msgId).toBe('event-123');
  expect(context.subject).toBe('test.users.signed-up');
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
        name === 'USERS'
          ? ['test.users.signed-up', 'test.users.deleted']
          : ['test.users.failed'],
      max_age:
        (name === 'USERS'
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
  transport.addHandler('users.signed-up', vi.fn(), true);
  expect(await transport.healthy()).toBe(false);
  expect(await listen(transport)).toBeUndefined();
  expect(broker.consumerAdd).toHaveBeenCalledWith(
    'USERS',
    expect.objectContaining({
      durable_name: 'org-default-team',
      filter_subject: 'test.users.signed-up',
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
it('creates separate stable durables for multiple handler subjects', async () => {
  setupBroker();
  const transport = server();
  transport.addHandler('users.signed-up', vi.fn(), true);
  transport.addHandler('users.deleted', vi.fn(), true);
  expect(await listen(transport)).toBeUndefined();
  const names = broker.consumerAdd.mock.calls.map(
    ([, config]) => config.durable_name,
  );
  expect(new Set(names).size).toBe(2);
  expect(
    names.every((name) => /^org-default-team-[0-9a-f]{10}$/.test(name)),
  ).toBe(true);
  await transport.close();
});
it('fails startup and drains the connection for incompatible existing stream retention', async () => {
  const { connection } = setupBroker();
  broker.streamInfo.mockResolvedValue({
    config: { subjects: ['test.users.signed-up'], max_age: 0 },
  });
  const transport = server();
  transport.addHandler('users.signed-up', vi.fn(), true);
  expect(await listen(transport)).toBeInstanceOf(Error);
  expect(broker.consumerAdd).not.toHaveBeenCalled();
  expect(connection.drain).toHaveBeenCalledOnce();
  expect(await transport.healthy()).toBe(false);
});
it('rejects startup without any event handlers', async () => {
  expect(await listen(server())).toBeInstanceOf(Error);
  expect(broker.connect).not.toHaveBeenCalled();
});
