# Repository Guidelines

## Project Structure & Module Organization
`cmd/notion2api` contains the executable entrypoint. Core backend logic lives in `internal/app`, including OpenAI-compatible handlers, account/session management, proxy policy, and SQLite persistence. The admin UI source is in `frontend/` (`app/`, `components/`, `lib/`), while the exported static admin bundle is generated to `static/admin` during build. Deployment samples live in `deploy/` (`caddy`, `nginx`, `systemd`), performance helpers in `scripts/perf`, and example runtime config in `config.example.json` and `config.docker.json`.

## Build, Test, and Development Commands
Use Go 1.25+.

- `go run ./cmd/notion2api --config ./config.example.json` starts the API and admin UI locally.
- `go build ./cmd/notion2api` builds the backend binary.
- `go test ./internal/app` runs the current backend test suite.
- `bun --cwd ./frontend run dev` starts the Next.js admin UI in dev mode.
- `bun --cwd ./frontend run typecheck` checks frontend TypeScript types.
- `bun --cwd ./frontend run build:static` rebuilds the admin UI and syncs output into `static/admin`.
- `docker compose up -d --build` starts the local container stack; use `docker-compose.prod.yml` for the production-oriented variant.

## Coding Style & Naming Conventions
Format Go code with `gofmt`; keep package names lowercase and files focused by responsibility, following the existing `internal/app` split. Prefer descriptive exported names and snake_case JSON tags. In the frontend, keep route files under `frontend/app`, reusable primitives under `frontend/components/ui`, and shared helpers in `frontend/lib`. Match the existing kebab-case component filenames such as `admin-console.tsx` and `theme-provider.tsx`.

## Testing Guidelines
Backend tests live beside implementation files as `*_test.go`, for example `internal/app/notion_client_protocol_test.go`. Add targeted tests for protocol handling, transport fallbacks, persistence changes, and fresh-thread/session behavior when those areas move. After frontend changes, run `bun --cwd ./frontend run typecheck` and `bun --cwd ./frontend run build:static` to catch app-router or export regressions.

## Commit & Pull Request Guidelines
Recent history favors scoped subjects like `feat(transport): ...`, `fix(browser): ...`, and `chore(ci,docker): ...`. Follow that pattern, keep the subject specific, and avoid vague messages like `update`. PRs should state the user-visible impact, list config or migration changes, and include `/admin` screenshots when UI behavior changes. Link related issues, and note the exact verification commands you ran.

## Security & Configuration Tips
Do not commit real `api_key`, `admin.password`, proxy credentials, or live SQLite data. Treat `config.example.json` and `config.docker.json` as templates only. If you change storage schema or session persistence, review `internal/app/sqlite_store.go` compatibility and document any migration impact in the PR.
