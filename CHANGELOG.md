# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.2.1](https://github.com/mxspl/nestjs-common/compare/v0.1.2...v0.2.1) (2026-09-11)


### Features

* widen peerDependencies and migrate tests to Vitest ([3e4f051](https://github.com/mxspl/nestjs-common/commit/3e4f05178b830494de6e282e0c75fd64e8f541f0))

### [0.2.0](https://github.com/mxspl/nestjs-common/compare/v0.1.2...v0.2.0) (2026-09-11)

### Features

* support NestJS v12 / GraphQL v14 / TypeORM v1 consumers alongside existing v11 stack (widened peerDependencies, upgraded devDependencies)

### Bug Fixes

* `applyGraphqlFilters` no longer allows filter keys inherited from `Object.prototype` (e.g. `toString`, `constructor`) to bypass the field allowlist

### [0.1.2](https://github.com/mxspl/nestjs-common/compare/v0.1.1...v0.1.2) (2026-06-07)

### 0.1.1 (2026-06-07)


### Features

* Initialize NestJS GraphQL helpers library ([a8e38d2](https://github.com/mxspl/nestjs-common/commit/a8e38d251899451b5a91024d5b716177711c327a))


### Bug Fixes

* restore generic graphql filter typing ([#1](https://github.com/mxspl/nestjs-common/issues/1)) ([1e27f85](https://github.com/mxspl/nestjs-common/commit/1e27f852b1d7f71b4217e75ef1fd81d0adceb863))
