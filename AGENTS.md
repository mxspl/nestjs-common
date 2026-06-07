# AGENTS.md

## Scope
These instructions apply to the whole repository.

## Repository Purpose
- This package provides reusable NestJS helpers for GraphQL and TypeORM-heavy services.
- Public APIs are exposed from [src/index.ts](src/index.ts) through barrel exports in [src/graphql/index.ts](src/graphql/index.ts).
- Current feature areas are Relay connection types, GraphQL filter inputs, TypeORM filter application, and Relay cursor pagination.

## Working Rules
- Keep changes small and localized. Do not refactor unrelated areas while fixing a focused issue.
- Preserve strict TypeScript typing. Avoid `any`; prefer `unknown`, explicit types, and narrow casts only when necessary.
- Maintain current module style: CommonJS build output, decorators for GraphQL types, and TypeORM query-builder integration.
- Keep public exports aligned. If you add a public feature, update the relevant barrel export files.
- Do not edit generated or derived output in `dist/` or `coverage/`.

## Source Layout
- `src/graphql/filters/`: GraphQL filter operator input types and the query-builder filter engine.
- `src/graphql/pagination/`: Relay cursor pagination helpers.
- `src/graphql/relay-connection.types.ts`: generic Relay GraphQL types.
- `src/index.ts` and nested `index.ts` files are the public export surface.

## Coding Conventions
- Follow the existing Biome style: spaces for indentation, single quotes, semicolons.
- Prefer straightforward functions and explicit helper extraction over clever abstractions.
- Keep runtime validation behavior intact. This package throws `BadRequestException` for invalid filter input and relies on stable cursor semantics in pagination.
- When changing filter operators, keep the engine and the corresponding GraphQL input classes in sync.
- When changing pagination behavior, preserve stable ordering assumptions based on `createdAt` and `id`.

## Tests
- Put tests next to the implementation as `*.spec.ts` files under `src/`.
- Extend or add focused Jest tests for behavior changes.
- Prefer behavior-focused mocks for TypeORM query builders and repositories instead of asserting internal implementation details.
- Preserve the current coverage exclusions for spec files, barrel files, `.d.ts`, `.types.ts`, and `.input.ts` files.

## Commands
- Install dependencies: `pnpm install`
- Build: `pnpm run build`
- Lint and format: `pnpm run lint`
- Test: `pnpm run test`
- Coverage: `pnpm run test:cov`
- Prepublish check: `pnpm run prepublish`

## Release Notes
- `pnpm run prepublish` runs clean, lint, and build. Use it as the final validation for release-related changes.
- Publishing uses `npm publish --access public` through the `publish` script.
- If dependency requirements change, keep `peerDependencies` and relevant docs aligned.

## Agent Expectations
- Start from the closest owning file or test.
- Validate with the narrowest useful command first, then widen only if needed.
- Update documentation only when behavior, API surface, or release flow changes.
- Leave unrelated workspace changes untouched.
