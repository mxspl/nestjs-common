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
