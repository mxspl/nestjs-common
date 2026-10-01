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

- Durable NATS JetStream event transport with configurable retry and failure policies.
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

### NATS JetStream events

Import from `@mxspl/nestjs-common/jetstream`. This separate entry point keeps
NATS and Nest microservices out of the root and logging import graphs. Install
its optional peers in services that use the transport:

```sh
pnpm add @nestjs/microservices@^12.1.1 @nats-io/jetstream@^3.4.0 @nats-io/transport-node@^3.4.0 rxjs@^7.8.2
```

Nest microservices 12.1.1 or later in the 12.x series is required for event
handler errors to propagate back to the transport. Register handlers on Nest
controllers with `@EventPattern('your.subject')`, and register those controllers
in the application's module graph. Payloads are decoded as JSON; validate their
schema in the handler. `@Ctx() context: JetStreamContext` exposes the message ID,
subject, headers, delivery count, and redelivery count.

```ts
import { ServerJetStream } from '@mxspl/nestjs-common/jetstream';

// Illustrative configuration for a future signup consumer, not an existing
// event contract. Define the shared schema and publish it from auth first.
const transport = new ServerJetStream({
  connection: { servers: ['nats://nats:4222'] },
  stream: { name: 'USER_EVENTS', maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
  durable: 'org-default-team',
  ackWaitMs: 60_000,
  maxDeliver: 5,
  retryDelayMs: 1000,
  deadLetter: {
    stream: 'ORG_EVENT_FAILURES',
    subject: 'org.events.failed',
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
});
app.connectMicroservice({ strategy: transport });
await app.init();
await app.startAllMicroservices();
```

Pass a logger as the optional second constructor argument. For dependency
injection, register a factory provider for `ServerJetStream` and pass
`app.get(ServerJetStream)` to `connectMicroservice`. `healthy()` probes the
connection and consumption loops; enable Nest shutdown hooks to stop pulling,
finish in-flight handlers, and drain the connection on shutdown.

Each handler pattern gets a durable pull consumer, with one in-flight message
per pattern and explicit acknowledgements. A single pattern uses `durable`
verbatim; multiple patterns append a stable hash of each pattern. Keep this
handler set stable: moving between one and multiple patterns changes durable
names and can replay retained events. Replicas share the durable name; separate
services need distinct durable names to each receive events. Handler patterns
must be string subjects; configured streams must list those exact subjects
(including `subjectPrefix`, when used). Wildcard coverage in existing stream
configuration is not inferred. The transport never creates or updates streams:
provision both the event stream and the failure stream before startup. It
inspects them and creates/updates only its durable consumers. A missing stream,
missing subject, or retention that is not positive or exceeds the configured
`maxAgeMs` fails startup. Brokers need stream inspection, consumer management,
consumption, acknowledgement, and failure publication permissions.

The transport acknowledges only after a Promise or Observable handler completes.
It extends the acknowledgement window while the handler runs. Unknown handler
errors retry with exponential backoff capped at thirty seconds. A service can
supply `classifyError(error)` returning `{ reason, retryable }`; permanent errors
terminate immediately. Use static reason codes, since termination reasons are
sent to the broker. Invalid JSON terminates before the handler runs.

After `maxDeliver` handler attempts, a failure record is published before the
source message is terminated. Publication failures retry without invoking the
handler again. Broker redelivery is therefore unlimited, bounded by stream
retention. Default failure records contain only `messageId`, source subject,
stream/sequence, attempts, `retry_exhausted`, and a timestamp. IDs outside the
safe correlation-ID format are omitted. `deadLetter.createPayload` can adapt
this metadata to a service's existing failure contract. Optional `metrics`
accepts `redelivered` and `deadLettered` counters exposing `inc()`, without a
Prometheus dependency. Transport logs never include payloads or error contents.

Delivery is at least once. For signup-driven default teams, enforce idempotency
in persistent storage using the user's stable ID and a database uniqueness
constraint/transaction. Auth's signup publication and org's team creation are
separate future work; this transport neither publishes signup events nor creates
teams. A GraphQL-only global authentication guard must also be scoped correctly
before registering message handlers in a hybrid org application.

#### Release and consumer migration

Release `@mxspl/nestjs-common` 0.3.0 before deploying the notification-service
migration or adding this transport to org-service. Then run
`pnpm add --save-exact @mxspl/nestjs-common@0.3.0` in each adopting service and
commit its registry-generated lockfile. Do not replace registry dependencies
with sibling paths. Existing logging, authentication, and GraphQL consumers can
remain on their current version. Notification-service keeps OTP-specific
retention, failure classification, failure envelopes, and metrics in its own
transport options factory.

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
