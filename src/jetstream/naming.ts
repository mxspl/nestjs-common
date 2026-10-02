const token = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FAILURE_TOKEN = 'failure';

function subjectTokens(subject: string) {
  const tokens = subject.split('.');
  if (tokens.length < 3 || !tokens.every((value) => token.test(value)))
    throw new Error(
      'JetStream subjects need at least three lowercase tokens: <domain>.<entity>.<event>',
    );
  return tokens;
}

function eventTokens(subject: string) {
  const tokens = subjectTokens(subject);
  if (tokens.at(-1) === FAILURE_TOKEN)
    throw new Error(
      'The event token "failure" is reserved for failure records',
    );
  return tokens;
}

function assertServiceName(serviceName: string) {
  if (!token.test(serviceName))
    throw new Error('JetStream service names must be lowercase kebab-case');
}

/**
 * Stream that stores a subject: every token except the last, upper snake case.
 * `auth.otp.requested` → `AUTH_OTP`; a subject prefix becomes part of the name.
 */
export function streamNameFor(subject: string) {
  return subjectTokens(subject)
    .slice(0, -1)
    .join('_')
    .replaceAll('-', '_')
    .toUpperCase();
}

/**
 * Subject for a consumer's failure records about an event subject.
 * `auth.otp.requested` → `auth.otp.failure.notification-service`, stored in
 * `AUTH_OTP_FAILURE`. The original subject is recorded in the payload.
 */
export function failureSubjectFor(subject: string, serviceName: string) {
  assertServiceName(serviceName);
  return [
    ...eventTokens(subject).slice(0, -1),
    FAILURE_TOKEN,
    serviceName,
  ].join('.');
}

/**
 * Durable consumer name: service name, then the subject with dots as hyphens.
 * `notification-service` + `auth.otp.requested` →
 * `notification-service_auth-otp-requested`.
 */
export function durableNameFor(serviceName: string, subject: string) {
  assertServiceName(serviceName);
  return `${serviceName}_${eventTokens(subject).join('-')}`;
}

/** NATS subject matching: `*` matches one token, a final `>` one or more. */
export function subjectMatches(filter: string, subject: string) {
  const filterTokens = filter.split('.');
  const tokens = subject.split('.');
  for (const [index, value] of filterTokens.entries()) {
    if (value === '>')
      return index === filterTokens.length - 1 && tokens.length > index;
    if (index >= tokens.length || (value !== '*' && value !== tokens[index]))
      return false;
  }
  return filterTokens.length === tokens.length;
}
