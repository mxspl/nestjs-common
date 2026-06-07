# @mxspl/nestjs-common

[![Test](https://github.com/mxspl/nestjs-gql/actions/workflows/test.yml/badge.svg)](https://github.com/mxspl/nestjs-gql/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/mxspl/nestjs-common/graph/badge.svg?token=K9SSY72YRD)](https://codecov.io/gh/mxspl/nestjs-common)

Reusable common helpers for NestJS services.

## Install

```bash
pnpm add @mxspl/nestjs-common
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
} from '@mxspl/nestjs-common';
```
