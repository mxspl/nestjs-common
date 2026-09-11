import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { JwtStrategy } from './jwt.strategy.js';

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof jose>();
  return {
    ...actual,
    jwtVerify: vi.fn(),
  };
});

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configService: ConfigService;

  beforeEach(() => {
    configService = new ConfigService();
    vi.spyOn(configService, 'getOrThrow').mockReturnValue(
      'http://auth-service:3000/api/auth/jwks',
    );
    strategy = new JwtStrategy(configService);
  });

  it('should throw when JWKS URI configuration is missing', () => {
    vi.spyOn(configService, 'getOrThrow').mockImplementation(() => {
      throw new Error('Configuration key "JWKS_URI" does not exist');
    });

    expect(() => new JwtStrategy(configService)).toThrow(
      'Configuration key "JWKS_URI" does not exist',
    );
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should throw UnauthorizedException if authorization header is missing', async () => {
    await expect(strategy.validate({ headers: {} })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should reject requests without headers', async () => {
    await expect(strategy.validate({})).rejects.toThrow(UnauthorizedException);
  });

  it.each([undefined, 42, 'Basic token', 'Bearer'])(
    'should reject invalid authorization header %s',
    async (authorization) => {
      await expect(
        strategy.validate({ headers: { authorization } }),
      ).rejects.toThrow('Missing or invalid Authorization header');
    },
  );

  it('should validate and return the payload for a valid token', async () => {
    const mockPayload = { sub: '123', email: 'giaduy@gmail.com' };
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'EdDSA' },
    });

    const result = await strategy.validate({
      headers: { authorization: 'Bearer test.token.here' },
    });

    expect(result).toEqual(mockPayload);
  });

  it('should throw UnauthorizedException when token verification fails', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
      new Error('signature verification failed'),
    );

    await expect(
      strategy.validate({
        headers: { authorization: 'Bearer invalid.token' },
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should handle non-Error token verification failures', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValueOnce('verification failed');

    await expect(
      strategy.validate({
        headers: { authorization: 'Bearer invalid.token' },
      }),
    ).rejects.toThrow('Invalid token');
  });
});