import type { ConnectionOptions } from '@nats-io/transport-node';

export const JETSTREAM_TRANSPORT = Symbol('JETSTREAM_TRANSPORT');

export interface JetStreamFailure {
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
  /**
   * Lowercase kebab-case name of the consuming service. Durable consumers are
   * `<serviceName>_<subject-with-hyphens>` and failure records are published
   * to `<domain>.<entity>.failure.<serviceName>`.
   */
  serviceName: string;
  /**
   * Retention bound for the stream derived from the handler subjects
   * (`auth.otp.requested` → `AUTH_OTP`). The stream must already exist; its
   * subjects and retention are validated at startup.
   */
  stream: { maxAgeMs: number };
  subjectPrefix?: string;
  ackWaitMs: number;
  /** Maximum handler attempts; failure publication may retry beyond this. */
  maxDeliver: number;
  retryDelayMs: number;
  /** The derived failure stream (`AUTH_OTP_FAILURE`) must already exist. */
  deadLetter: {
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
