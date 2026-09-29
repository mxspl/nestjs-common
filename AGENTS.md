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
- Maintain current module style: native ESM build output, decorators for GraphQL types, and TypeORM query-builder integration.
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
- Extend or add focused Vitest tests for behavior changes.
- Prefer behavior-focused mocks for TypeORM query builders and repositories instead of asserting internal implementation details.
- Preserve the current coverage exclusions for spec files, barrel files, `.d.ts`, `.types.ts`, and `.input.ts` files.
- Test globals (`describe`, `it`, `expect`, `vi`, etc.) are enabled via `vitest.config.ts`; no explicit imports needed.

## Commands

- Install dependencies: `pnpm install`
- Build: `pnpm run build`
- Lint and format: `pnpm run lint`
- Test: `pnpm run test`
- Coverage: `pnpm run test:cov`
- Publish/release: `pnpm run release`

## Versioning and publishing

- Do not manually bump the package version while editing this library, including
  `package.json`, lockfiles, or release metadata. Do not assume the next version
  in documentation or consumer dependency pins.
- Use `pnpm run release` from this repository to publish. The configured release
  tool owns version selection, changelog updates, the release commit, and tag;
  the script pushes to GitHub, where the publication workflow runs.
- Run the required checks and commit the intended source changes before release.
  Preserve unrelated work; the release script does not automatically include
  arbitrary uncommitted changes.
- Do not bypass the script with direct `npm publish`, `pnpm publish`, manual tags,
  or separate version-bump commands. Verify publication and use the actual
  released version when upgrading consumers and regenerating their lockfiles.

## Agent Expectations

- Start from the closest owning file or test.
- Validate with the narrowest useful command first, then widen only if needed.
- Update documentation only when behavior, API surface, or release flow changes.
- Leave unrelated workspace changes untouched.
