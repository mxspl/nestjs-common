import type { ConnectionOptions } from '@nats-io/transport-node';

export const JETSTREAM_TRANSPORT = Symbol('JETSTREAM_TRANSPORT');

export interface JetStreamFailure {
  messageId?: string;
  sourceSubject: string;
  sourceStream: string;
  sourceSequence: number;
  attempts: number;
  reason: 'retry_exhausted';
  occurredAt: string;
}

export interface JetStreamOptions {
  transportId?: symbol;
  connection: Pick<ConnectionOptions, 'servers' | 'user' | 'pass' | 'token'>;
  stream: { name: string; maxAgeMs: number };
  durable: string;
  /** Create missing streams. Existing subjects and retention are validated. */
  manageStreams: boolean;
  subjectPrefix?: string;
  ackWaitMs: number;
  /** Maximum handler attempts; failure publication may retry beyond this. */
  maxDeliver: number;
  retryDelayMs: number;
  deadLetter: {
    stream: string;
    subject: string;
    maxAgeMs: number;
    /** Receives metadata only. Do not include sensitive data in failure records. */
    createPayload?: (failure: JetStreamFailure) => unknown;
  };
  /** Unknown errors are retryable by default. Use safe, static reason codes. */
  classifyError?: (error: unknown) => { reason: string; retryable: boolean };
  metrics?: {
    redelivered: { inc(): void };
    deadLettered: { inc(): void };
  };
}
