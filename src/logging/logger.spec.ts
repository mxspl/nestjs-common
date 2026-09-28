import { setImmediate } from 'node:timers/promises';
import { JsonLogger, withCorrelation } from './index.js';

describe('JsonLogger', () => {
  let output: string[];

  beforeEach(() => {
    output = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const entries = (output: string[]) =>
    output.map((line) => JSON.parse(line) as Record<string, unknown>);

  it('writes one JSON line with a timestamp and optional context', () => {
    new JsonLogger().log('Service ready', 'Bootstrap');

    expect(output).toHaveLength(1);
    expect(output[0]).toMatch(/\n$/);
    expect(output[0].split('\n')).toHaveLength(2);
    expect(entries(output)).toEqual([
      {
        time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        level: 'log',
        message: 'Service ready',
        context: 'Bootstrap',
      },
    ]);
  });

  it('filters levels and supports changing the threshold', () => {
    const logger = new JsonLogger('warn');
    logger.debug('hidden');
    logger.verbose('hidden');
    logger.log('hidden');
    logger.warn('warning');
    logger.error('failure');
    logger.fatal('fatal failure');
    logger.setLevel('debug');
    logger.debug('diagnostic');
    logger.verbose('verbose diagnostic');
    logger.log('ready');

    expect(
      entries(output).map(({ level, message }) => [level, message]),
    ).toEqual([
      ['warn', 'warning'],
      ['error', 'failure'],
      ['error', 'fatal failure'],
      ['debug', 'diagnostic'],
      ['debug', 'verbose diagnostic'],
      ['log', 'ready'],
    ]);
  });

  it('uses log as the default threshold', () => {
    const logger = new JsonLogger();
    logger.debug('hidden');
    logger.log('ready');
    expect(entries(output).map(({ level }) => level)).toEqual(['log']);
  });

  it('does not serialize error objects, payloads, or non-string context', () => {
    const logger = new JsonLogger();
    logger.error(new Error('secret-token'));
    logger.log({ code: '123456' }, { destination: 'private@example.test' });

    expect(entries(output)).toEqual([
      {
        time: expect.any(String),
        level: 'error',
        message: 'Service operation failed',
      },
      {
        time: expect.any(String),
        level: 'log',
        message: 'Service operation failed',
      },
    ]);
  });

  it('isolates correlation IDs across concurrent async operations', async () => {
    const logger = new JsonLogger();
    const results = await Promise.all(
      ['request-a', 'request-b'].map((id) =>
        withCorrelation(id, async () => {
          await setImmediate();
          logger.log(id);
          return id;
        }),
      ),
    );
    logger.log('outside');

    expect(results).toEqual(['request-a', 'request-b']);
    expect(entries(output)).toEqual([
      expect.objectContaining({
        message: 'request-a',
        correlationId: 'request-a',
      }),
      expect.objectContaining({
        message: 'request-b',
        correlationId: 'request-b',
      }),
      { time: expect.any(String), level: 'log', message: 'outside' },
    ]);
  });

  it.each([
    undefined,
    '',
    'invalid id',
    'line\nbreak',
    'a'.repeat(129),
  ])('uses unknown for an invalid correlation ID: %s', (id) => {
    withCorrelation(id, () => new JsonLogger().log('ready'));
    expect(entries(output)[0].correlationId).toBe('unknown');
  });

  it('restores the outer correlation after a nested callback throws', () => {
    const logger = new JsonLogger();
    const result = withCorrelation('outer', () => {
      expect(() =>
        withCorrelation('inner', () => {
          logger.log('inside');
          throw new Error('failed');
        }),
      ).toThrow('failed');
      logger.log('restored');
      return 42;
    });

    expect(result).toBe(42);
    expect(entries(output).map(({ correlationId }) => correlationId)).toEqual([
      'inner',
      'outer',
    ]);
  });
});
