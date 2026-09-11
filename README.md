# @mxspl/nestjs-common

[![Test](https://github.com/mxspl/nestjs-gql/actions/workflows/test.yml/badge.svg)](https://github.com/mxspl/nestjs-gql/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/mxspl/nestjs-common/graph/badge.svg?token=K9SSY72YRD)](https://codecov.io/gh/mxspl/nestjs-common)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=mxspl_nestjs-common&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=mxspl_nestjs-common)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=mxspl_nestjs-common&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=mxspl_nestjs-common)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=mxspl_nestjs-common&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=mxspl_nestjs-common)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=mxspl_nestjs-common&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=mxspl_nestjs-common)

Reusable common helpers for NestJS services.

## Install

```bash
pnpm add @mxspl/nestjs-common
```

## What it provides

- JWT authentication helpers backed by a remote JWKS endpoint.
- Relay connection types for `PageInfo`, edges, and connections.
- Query-builder filter application helpers for TypeORM.
- Relay cursor pagination with stable `createdAt` + `id` ordering.
- Reusable string and boolean filter input classes.

## Usage

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
