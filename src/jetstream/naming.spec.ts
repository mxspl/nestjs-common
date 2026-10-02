import {
  durableNameFor,
  failureSubjectFor,
  streamNameFor,
  subjectMatches,
} from './naming.js';

describe('streamNameFor', () => {
  it.each([
    ['auth.otp.requested', 'AUTH_OTP'],
    ['auth.passkey.removed', 'AUTH_PASSKEY'],
    ['user.account.signed-up', 'USER_ACCOUNT'],
    ['auth.otp.failure.notification-service', 'AUTH_OTP_FAILURE'],
    ['test.e2e-1.auth.otp.requested', 'TEST_E2E_1_AUTH_OTP'],
  ])('derives %s → %s', (subject, stream) => {
    expect(streamNameFor(subject)).toBe(stream);
  });
  it.each([
    'auth.otp',
    'Auth.otp.requested',
    'auth..requested',
    'auth.otp.*',
    'auth.otp.>',
    'auth.otp_code.requested',
  ])('rejects %s', (subject) => {
    expect(() => streamNameFor(subject)).toThrow();
  });
});

describe('failureSubjectFor', () => {
  it('records failures beside the source entity, per service', () => {
    const subject = failureSubjectFor(
      'auth.otp.requested',
      'notification-service',
    );
    expect(subject).toBe('auth.otp.failure.notification-service');
    expect(streamNameFor(subject)).toBe('AUTH_OTP_FAILURE');
  });
  it('shares one failure subject between events of a stream', () => {
    expect(failureSubjectFor('auth.passkey.added', 'svc')).toBe(
      failureSubjectFor('auth.passkey.removed', 'svc'),
    );
  });
  it('keeps subject prefixes', () => {
    expect(failureSubjectFor('test.x.auth.otp.requested', 'svc')).toBe(
      'test.x.auth.otp.failure.svc',
    );
  });
  it('rejects the reserved failure event and invalid service names', () => {
    expect(() => failureSubjectFor('auth.otp.failure', 'svc')).toThrow();
    expect(() => failureSubjectFor('auth.otp.requested', 'Svc')).toThrow();
    expect(() => failureSubjectFor('auth.otp.requested', 'a_b')).toThrow();
  });
});

describe('durableNameFor', () => {
  it('joins the service name and subject', () => {
    expect(durableNameFor('notification-service', 'auth.otp.requested')).toBe(
      'notification-service_auth-otp-requested',
    );
    expect(durableNameFor('org-service', 'user.account.signed-up')).toBe(
      'org-service_user-account-signed-up',
    );
  });
  it('rejects invalid input', () => {
    expect(() => durableNameFor('svc', 'auth.otp.failure')).toThrow();
    expect(() => durableNameFor('svc.name', 'auth.otp.requested')).toThrow();
  });
});

describe('subjectMatches', () => {
  it.each([
    ['auth.otp.requested', 'auth.otp.requested', true],
    ['auth.otp.*', 'auth.otp.requested', true],
    ['auth.*.requested', 'auth.otp.requested', true],
    ['auth.>', 'auth.otp.requested', true],
    ['auth.otp.*', 'auth.otp.failure.svc', false],
    ['auth.otp.failure.*', 'auth.otp.failure.svc', true],
    ['auth.otp.>', 'auth.otp', false],
    ['auth.otp.requested', 'auth.otp', false],
    ['auth.otp', 'auth.otp.requested', false],
    ['auth.>.x', 'auth.otp.x', false],
  ])('%s matches %s: %s', (filter, subject, expected) => {
    expect(subjectMatches(filter, subject)).toBe(expected);
  });
});
