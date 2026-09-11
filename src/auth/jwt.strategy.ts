import { ConfigService } from '@nestjs/config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Strategy } from 'passport-custom';

export interface JwtRequest {
  headers?: {
    authorization?: unknown;
  };
}

/* c8 ignore start */
@Injectable()
/* c8 ignore stop */
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(configService: ConfigService) {
    super();
    const jwksUri = configService.getOrThrow<string>('JWKS_URI');
    this.jwks = createRemoteJWKSet(new URL(jwksUri));
  }

  async validate(request: JwtRequest) {
    const authHeader = request.headers?.authorization;
    if (
      !authHeader ||
      typeof authHeader !== 'string' ||
      !authHeader.toLowerCase().startsWith('bearer ')
    ) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.substring(7).trim();
    try {
      const { payload } = await jwtVerify(token, this.jwks);
      return payload;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      throw new UnauthorizedException(message);
    }
  }
}