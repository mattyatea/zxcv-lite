# AGENTS.md

This repo is a Nuxt 4 + Cloudflare Workers app with a Vue frontend in `app/`
and a server API in `server/` (Hono + oRPC + Prisma/D1). Use pnpm.

## Project layout
- `app/`: Nuxt app (pages, layouts, components, composables, assets).
- `server/`: API routes, oRPC contracts/procedures, services, repositories.
- `prisma/`: Prisma schema and migrations; Cloudflare D1 targets.
- `migrations/`: Wrangler D1 migrations.
- `public/`: static assets.
- `scripts/`: utilities and one-off scripts.

## Cursor/Copilot rules
- No `.cursor/rules`, `.cursorrules`, or `.github/copilot-instructions.md` found.

## Setup
- Install deps: `pnpm install`
- Postinstall runs `nuxt prepare` (generates `.nuxt` typings).

## Dev/build commands
- Dev server: `pnpm dev` (Nuxt on port 5144, runs cf-typegen).
- Dev + migrate local D1: `pnpm dev:migrate`
- Build: `pnpm build`
- Build (staging env): `pnpm build:staging`
- Generate static: `pnpm generate`
- Preview build with Wrangler: `pnpm preview`
- Preview (staging): `pnpm preview:staging`
- Deploy: `pnpm deploy`
- Deploy (staging): `pnpm deploy:staging`

## Database and typegen
- Generate Prisma client: `pnpm prisma:generate`
- Typegen (Wrangler + Prisma): `pnpm typegen`
- D1 migrate local: `pnpm migrate:local`
- D1 migrate local (staging): `pnpm migrate:local:staging`
- D1 migrate remote staging: `pnpm migrate:staging`
- D1 migrate remote prod: `pnpm migrate:prod`

## Lint/format/typecheck
- Lint (Biome): `pnpm lint`
- Lint + fix: `pnpm lint:fix`
- Format (Biome): `pnpm format`
- Format check: `pnpm format:check`
- Biome check: `pnpm check`
- Biome check + fix: `pnpm check:fix`
- Typecheck: `pnpm typecheck` (vue-tsc + tsc)

## Tests
- All unit/integration: `pnpm test` (vitest run)
- Watch: `pnpm test:watch`
- Coverage: `pnpm test:coverage`
- Unit suite: `pnpm test:unit`
- Integration suite: `pnpm test:integration`
- Vue component tests: `pnpm test:vue`
- Vue tests watch: `pnpm test:vue:watch`
- E2E (Playwright): `pnpm test:e2e`
- E2E UI: `pnpm test:e2e:ui`
- E2E debug: `pnpm test:e2e:debug`

## Run a single test
- Vitest by file: `pnpm vitest run path/to/test-file.test.ts`
- Vitest by name: `pnpm vitest run -t "test name"`
- Vitest + project: `pnpm vitest run tests/unit -- -t "name"`
- Vue tests with config: `pnpm vitest run --config vitest.config.vue.mts -t "name"`
- Playwright by file: `pnpm playwright test tests/e2e/foo.spec.ts`
- Playwright by title: `pnpm playwright test --grep "test name"`

## Code style guidelines

### General
- Language: TypeScript everywhere; Vue SFCs use `<script setup>`.
- Formatting: Biome is the source of truth; run `pnpm format` if unsure.
- Indentation: follow existing files (tabs in TS/JS, 2 spaces in Vue templates).
- Line width: keep lines readable; use wrapping in chained calls or arrays.
- Comments: keep minimal; add only when logic is non-obvious.

### Imports
- Order imports: external deps first, then internal modules, then relative paths.
- Use type-only imports (`import type { Foo } from "..."`) for types.
- Prefer path aliases: `~/` and `@/` map to `app/`, `~/server/` maps to `server/`.
- Group related imports; one blank line between groups.

### Naming
- Files: PascalCase for classes/services (e.g. `RuleService.ts`).
- Components: PascalCase filenames and component names.
- Variables/functions: camelCase; constants in UPPER_SNAKE_CASE only for true constants.
- API output: camelCase internally; some responses include `snake_case` for legacy fields.

### Types and data shaping
- Keep strict typing (tsconfig strict is on); avoid `any` unless required by Prisma.
- Use explicit return types for shared utilities and service methods.
- Prefer `type` aliases for unions and shared shapes; `interface` for object contracts.
- Parse/serialize JSON fields explicitly (e.g. `tags` stored as JSON strings).

### Vue/Nuxt patterns
- Use `useHead`, `useI18n`, and Nuxt composables directly in `<script setup>`.
- Keep page components in `app/pages` and shared UI in `app/components`.
- Use Tailwind classes for styling; prefer design tokens from config when available.
- Use `Common*` components for shared form and layout primitives.

### Server/API patterns
- Services live in `server/services`; repositories in `server/repositories`.
- oRPC procedures live in `server/orpc/procedures` and map to contracts.
- Use `ORPCError` for user-facing errors; set appropriate codes.
- For Prisma/DB errors, prefer helpers in `server/utils/httpErrorHandler.ts`.
- Log via `createLogger(env)` in services/procedures for structured logs.

### Error handling
- Validate inputs early, throw `ORPCError("BAD_REQUEST", { message })`.
- Use `NOT_FOUND`, `FORBIDDEN`, `UNAUTHORIZED`, `CONFLICT` as appropriate.
- Catch and wrap DB errors with `handleDatabaseError` or helpers.
- Avoid leaking sensitive details in production; verbose logs only in dev/test.

### Testing conventions
- Vitest for unit/integration and Vue component tests.
- Playwright for E2E; use `--grep` for focused runs.
- Keep test data setup explicit; avoid hidden global state.

### Misc
- Cloudflare Workers environment is assumed; use bindings from `server/types`.
- Prisma client is used against D1; some `any` usage is tolerated for runtime.
- Do not edit `.output/` or `.nuxt/` artifacts; they are generated.
