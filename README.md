# @mxspl/nestjs-common

[![Test](https://github.com/mxspl/nestjs-gql/actions/workflows/test.yml/badge.svg)](https://github.com/mxspl/nestjs-gql/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/mxspl/nestjs-common/graph/badge.svg?token=K9SSY72YRD)](https://codecov.io/gh/mxspl/nestjs-common)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=mxspl_nestjs-common&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=mxspl_nestjs-common)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=mxspl_nestjs-common&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=mxspl_nestjs-common)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=mxspl_nestjs-common&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=mxspl_nestjs-common)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=mxspl_nestjs-common&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=mxspl_nestjs-common)

Reusable common helpers for NestJS services.

## Install

To install from GitHub Packages, configure the scoped registry and authenticate
with a token that can read packages:

```ini
@mxspl:registry=https://npm.pkg.github.com
```

```bash
pnpm add @mxspl/nestjs-common
```

Push a `v<version>` tag matching the version in `package.json` to run tests and
publish that version to GitHub Packages. Publishing requires the repository's
GitHub Actions token to have package write access.

## What it provides

- Structured JSON logging with asynchronous correlation IDs.
- JWT authentication helpers backed by a remote JWKS endpoint.
- Relay connection types for `PageInfo`, edges, and connections.
- Query-builder filter application helpers for TypeORM.
- Relay cursor pagination with stable `createdAt` + `id` ordering.
- Reusable string and boolean filter input classes.

## Usage

### JSON logging

`JsonLogger` and `withCorrelation` are exported from the package root and from
`@mxspl/nestjs-common/logging`. Use the logging entry point in services that do
not use the authentication or GraphQL helpers; it avoids loading those modules.

Create the logger before bootstrapping Nest so startup logs use the same format:

```ts
import { JsonLogger, withCorrelation } from '@mxspl/nestjs-common/logging';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const logger = new JsonLogger(process.env.LOG_LEVEL ?? 'log');
const app = await NestFactory.create(AppModule, { logger });
await app.listen(process.env.PORT ?? 3000);

await withCorrelation('request-123', async () => {
  logger.log('Operation completed', 'Worker');
});
```

When injecting the logger into application providers, register that same instance
with `{ provide: JsonLogger, useValue: logger }` in the owning module (or use a
factory provider). Passing the logger to `NestFactory` configures Nest's logger;
it does not automatically register an injectable provider.

Output is newline-delimited JSON on stdout with `time`, `level`, `message`, an
optional string `context`, and `correlationId` when inside `withCorrelation`.
Supported thresholds are `debug`, `log` (default), `warn`, and `error`; `setLevel`
updates the threshold. `verbose` maps to `debug`, and `fatal` maps to `error`.
Correlation IDs accept 1–128 letters, digits, underscores, or hyphens; invalid or
missing IDs become `unknown`. Correlation state follows asynchronous work and is
isolated between concurrent callbacks. HTTP/message handlers must establish it
explicitly with `withCorrelation`.

Non-string messages, including error objects, become `Service operation failed`;
non-string context and error stack arguments are not serialized. String messages
and contexts are emitted as supplied, so use static messages and never include
credentials, OTPs, recipients, or raw payloads in them.

### JWT authentication

Set `JWKS_URI` to the endpoint that exposes your signing keys. `JwtStrategy`
requires this value and throws during application startup when it is missing.

```env
JWKS_URI=https://auth.example.com/api/auth/jwks
```

Register the strategy and guard in a module that imports `ConfigModule` and
`PassportModule`:

```ts
import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard, JwtStrategy } from '@mxspl/nestjs-common';
import { PassportModule } from '@nestjs/passport';

@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, JwtAuthGuard],
  exports: [PassportModule, JwtStrategy, JwtAuthGuard],
})
export class AuthModule {}
```

Use `JwtAuthGuard` as an application guard or on an individual resolver:

```ts
import { UseGuards } from '@nestjs/common';
import { Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '@mxspl/nestjs-common';

@Resolver()
@UseGuards(JwtAuthGuard)
export class ProtectedResolver {}
```

### GraphQL and TypeORM

Define a GraphQL filter input using the supplied operator classes. List every
filterable entity field in the service method's `fieldTypes` map; unknown fields
are rejected.

```ts
import {
  BooleanFilterOperatorsInput,
  StringFilterOperatorsInput,
} from '@mxspl/nestjs-common';
import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class TeamFilter {
  @Field(() => StringFilterOperatorsInput, { nullable: true })
  name?: StringFilterOperatorsInput;

  @Field(() => BooleanFilterOperatorsInput, { nullable: true })
  active?: BooleanFilterOperatorsInput;

  @Field(() => [TeamFilter], { nullable: true })
  and?: TeamFilter[];

  @Field(() => [TeamFilter], { nullable: true })
  or?: TeamFilter[];

  @Field(() => [TeamFilter], { nullable: true })
  not?: TeamFilter[];
}
```

Create concrete Relay GraphQL types for the entity:

```ts
import { RelayConnectionType, RelayEdgeType } from '@mxspl/nestjs-common';
import { ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TeamEdge extends RelayEdgeType(Team) {}

@ObjectType()
export class TeamConnection extends RelayConnectionType(TeamEdge) {}
```

Use `buildRelayConnection` in the service. Cursor pagination requires an entity
with `createdAt: Date` and `id: string` fields and applies ascending,
deterministic ordering to them.

```ts
import {
  applyGraphqlFilters,
  buildRelayConnection,
} from '@mxspl/nestjs-common';

async findConnection(
  first?: number,
  after?: string,
  filters?: TeamFilter,
): Promise<TeamConnection> {
  return buildRelayConnection<Team, TeamEdge>({
    repository: this.teamsRepository,
    alias: 'team',
    first,
    after,
    configureQuery: (queryBuilder) => {
      applyGraphqlFilters(queryBuilder, 'team', filters, {
        name: 'string',
        active: 'boolean',
      });
    },
    toEdge: (node, cursor) => ({ cursor, node }),
  });
}
```

The package expects compatible NestJS, GraphQL, TypeORM, Passport, and
`passport-custom` peer dependencies to be installed by the consuming service.
