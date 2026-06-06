# @mxspl/nestjs-gql

[![Test](https://github.com/mxspl/nestjs-gql/actions/workflows/test.yml/badge.svg)](https://github.com/mxspl/nestjs-gql/actions/workflows/test.yml)

Reusable GraphQL helpers for NestJS services.

## Install

```bash
pnpm add @mxspl/nestjs-gql
```

## What it provides

- Relay connection types for `PageInfo`, edges, and connections.
- Query-builder filter application helpers for TypeORM.
- Relay cursor pagination with stable `createdAt` + `id` ordering.
- Reusable string and boolean filter input classes.

## Example

```ts
import {
  RelayConnectionType,
  RelayEdgeType,
  RelayPageInfo,
  applyGraphqlFilters,
  buildRelayConnection,
  BooleanFilterOperatorsInput,
  StringFilterOperatorsInput,
} from '@mxspl/nestjs-gql';
```
