# AGENTS.md

Nuxt 4 + Nitro + Drizzle (Neon Postgres) on Vercel. Details: README, DEPLOYMENT.md, `specs/`, `.specify/memory/constitution.md`.

- **YAGNI:** build only what the task needs. No options, abstractions or features "for later".
- Changing behavior means adding a test. Never disable tests.
- Max. 300 lines per file, no layer folders or repository pattern.
- The server validates everything: `requireRole`, `assertCsrf`, Zod schemas from `server/lib/contracts/`; money in cents.
- Schema changes only in `server/db/schema*.ts`, then `pnpm db:generate`; never write migrations by hand.
- UI text goes through i18n. `en.json` is the master and default locale; keep `de.json` in sync.
- Before opening a PR: `pnpm lint && pnpm lint:layers && pnpm typecheck && pnpm test`
- Docs, PRs, code and comments are all written in English.
