# Moussidalheire — Backend

API backend for the Moussidalheire village management platform (habitants,
familles, généalogie, actualités). Built on a clean, secure, layered
Express + TypeScript + Prisma/MySQL foundation.

**MODULE 01 — utilisateurs** (CRUD backend only) is implemented: see
"Module 01 — Utilisateurs" below. Every other business module (personnes,
familles, unions, résidences, actualités) and the rest of MODULE 01 itself
(login/JWT/refresh/OTP/RBAC — full authentication) are separate, dedicated
follow-up phases not yet built.

The frontend (`../moussidalheire-main`, Vite + React, dev port `5173`) is
untouched by this phase and not yet wired to this API.

## Prerequisites

- **Node.js** ≥ 20 (developed against v22)
- **npm** (comes with Node)
- **MySQL** ≥ 8, with a `villagedb` database already created, reachable via
  `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`

  > MySQL was **not installed/running** on the machine this backend was
  > scaffolded on (no local service, port 3306 closed). The app is designed to
  > tolerate that: it boots normally and `/api/v1/health` simply reports
  > `"database": "disconnected"` instead of crashing. Once a real MySQL
  > instance with `villagedb` is reachable, point the `DB_*` variables at it
  > (see below) and the same endpoint will report `"connected"`.
  >
  > Options to get a local MySQL instance: install it natively, or run it
  > in a container, e.g. `docker run --name moussidalheire-db -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=villagedb -p 3306:3306 -d mysql:8`.

## Installation

```bash
cd backend
npm install
```

## Configuration (`.env`)

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

| Variable         | Required | Description                                                                  |
| ---------------- | -------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`       | no       | `development` \| `test` \| `production` (default `development`)              |
| `PORT`           | no       | HTTP port (default `5000`)                                                   |
| `DB_HOST`        | **yes**  | MySQL host, e.g. `localhost`                                                 |
| `DB_PORT`        | **yes**  | MySQL port, e.g. `3306`                                                      |
| `DB_NAME`        | **yes**  | Database name — `villagedb`                                                  |
| `DB_USER`        | **yes**  | MySQL user                                                                   |
| `DB_PASSWORD`    | **yes**  | MySQL password (can be an empty string for a passwordless local user)        |
| `JWT_SECRET`     | **yes**  | Random string, **min 32 characters** — used only once real auth is built     |
| `JWT_EXPIRES_IN` | no       | e.g. `15m` (default `15m`)                                                   |
| `CORS_ORIGIN`    | no       | Allowed frontend origin (default `http://localhost:5173`, the Vite dev port) |
| `LOG_LEVEL`      | no       | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace` (default `info`)          |

All variables are validated with Zod at startup (`src/config/env.ts`). If a
required variable is missing or invalid, **the server refuses to start** and
prints exactly which variable(s) are wrong — it never falls back to an
invented secret.

`.env` is git-ignored. `.env.example` contains no real secrets.

## MySQL & Prisma

The Prisma schema (`prisma/schema.prisma`) declares one model so far:
`Utilisateur` (table `utilisateurs`, MODULE 01). Every other business model
(Personne, Famille, Union, Résidence, Actualité, ...) is a separate,
dedicated phase.

`DB_PASSWORD` may legitimately be an empty string (a passwordless local
MySQL user) — `prisma.config.ts` reads it directly from `process.env`
rather than through Prisma's own `env()` config helper, which otherwise
rejects any falsy value, empty string included.

```bash
# Generate the Prisma Client (does not require a live database)
npm run prisma:generate

# Apply migrations against the configured DB_* connection (requires a running MySQL)
npm run prisma:migrate

# Browse the database visually (requires a running MySQL)
npm run prisma:studio
```

No repository or service connects to MySQL on its own — every access goes
through the single Prisma client exported by `src/config/database.ts`.

## Development

```bash
npm run dev
```

Starts the API on `http://localhost:5000` (or `PORT`) with hot reload
(`tsx watch`). Try:

```bash
curl http://localhost:5000/api/v1/health
```

## Production

```bash
npm run build
npm run start
```

`build` type-checks and compiles `src/` to `dist/` (see `tsconfig.build.json`);
`start` runs the compiled output — no `ts-node`/`tsx` in production.

## Tests

```bash
npm run test        # run once
npm run test:watch  # watch mode
```

Technical/infrastructure tests (`tests/`):

- `health.test.ts` — `GET /api/v1/health` returns the expected envelope
- `not-found.test.ts` — an unknown route returns a `404` in the standard error shape
- `validate.test.ts` — the reusable Zod `validate()` middleware (body & query)
- `error-handling.test.ts` — the centralized error middleware (`AppError`, unexpected errors, async handlers)

MODULE 01 — utilisateurs:

- `utilisateurs.service.test.ts` — business rules with the repository mocked (uniqueness
  conflicts, password hashing, the desactiver/reactiver lifecycle, never leaking `motDePasseHash`)
- `utilisateurs.routes.test.ts` — full HTTP integration against the real `villagedb`
  (CRUD, pagination/search, no PATCH route, no physical deletion, lifecycle transitions).
  Every fixture it creates uses a unique per-run `identifiant` prefix and is cleaned up via
  `prisma.utilisateur.deleteMany()` in the test file's own `afterAll` — test-harness hygiene
  only, never through `src/` or the API. If MySQL isn't reachable, these tests no-op pass
  instead of failing, the same tolerance `health.test.ts` already relies on.

## Quality checks

```bash
npm run typecheck     # tsc --noEmit, strict mode
npm run lint           # ESLint (flat config, typescript-eslint)
npm run lint:fix
npm run format          # Prettier --write
npm run format:check
```

## Project structure

```text
backend/
├── src/
│   ├── app.ts                  # builds the Express app (no listen()) — used by server.ts and tests
│   ├── server.ts                # starts the HTTP server, graceful shutdown
│   │
│   ├── config/
│   │   ├── env.ts               # Zod-validated environment variables (single source of truth)
│   │   └── database.ts          # the one Prisma client instance + DB health check
│   │
│   ├── routes/
│   │   ├── index.ts             # mounts every module router under /api/v1
│   │   ├── health.routes.ts
│   │   └── utilisateurs.routes.ts    # MODULE 01 — no PATCH, no DELETE (see below)
│   │
│   ├── controllers/             # req/res only — no business rules, no direct DB access
│   │   ├── health.controller.ts
│   │   └── utilisateurs.controller.ts
│   │
│   ├── services/                # business rules, orchestration — no req/res, no raw SQL
│   │   ├── health.service.ts
│   │   └── utilisateurs.service.ts   # uniqueness checks, hashing, desactiver/reactiver lifecycle
│   │
│   ├── repositories/             # the only layer allowed to talk to Prisma directly
│   │   └── utilisateurs.repository.ts
│   │
│   ├── models/                   # the model IS prisma/schema.prisma — these just
│   │   └── utilisateur.model.ts  # re-export its generated type from a conventional src/models/ path
│   │
│   ├── schemas/                 # Zod input-validation schemas, one subfolder per module
│   │   ├── common/pagination.schema.ts   # demonstrates the validation system
│   │   ├── utilisateurs/         # create/update/list/uuid-param schemas + shared primitives
│   │   ├── auth/                # (empty — future phase)
│   │   ├── people/               # (empty — future phase)
│   │   ├── families/            # (empty — future phase)
│   │   ├── unions/               # (empty — future phase)
│   │   └── events/               # (empty — future phase)
│   │
│   ├── middlewares/
│   │   ├── error.middleware.ts       # single place every error is formatted (AppError, Zod, Prisma, unknown)
│   │   ├── not-found.middleware.ts   # 404 for unmatched routes
│   │   └── validate.middleware.ts    # validate(schema, "body" | "params" | "query")
│   │
│   ├── utils/
│   │   ├── app-error.ts         # AppError + factory helpers (badRequest/unauthorized/forbidden/notFound/conflict/internal)
│   │   ├── logger.ts            # Pino structured logger, redacts secrets (incl. motDePasse/mot_de_passe_hash)
│   │   └── password.ts          # bcrypt hacherMotDePasse/verifierMotDePasse
│   │
│   └── types/
│       ├── api-response.ts      # ApiSuccess / ApiError response shapes
│       └── utilisateur.ts       # UtilisateurPublic (never carries motDePasseHash) + toUtilisateurPublic()
│
├── prisma/
│   └── schema.prisma            # `Utilisateur` (table `utilisateurs`) — MODULE 01
│
├── tests/                       # see "Tests" above
│
├── .env                         # local secrets (git-ignored)
├── .env.example
├── eslint.config.mjs
├── prettier.config.js
├── tsconfig.json                 # strict compiler options, used for typecheck (noEmit)
├── tsconfig.build.json          # extends tsconfig.json, emits src/ -> dist/
└── vitest.config.ts
```

## Architecture

Request flow, once business modules exist:

```text
routes -> controllers -> services -> repositories -> Prisma -> MySQL
```

- **routes** wire an HTTP verb + path to a controller (plus `validate(schema)`) — no logic.
- **controllers** read `req`, call a service, shape the HTTP response — no business rules, no Prisma.
- **services** hold business rules and orchestration — no `req`/`res`, no raw SQL.
- **repositories** are the only layer that imports the Prisma client — no business rules.
- **schemas** (Zod) validate everything entering the app at the edge, before a controller runs.

## Module 01 — Utilisateurs

CRUD backend for the `utilisateurs` table (compte d'authentification —
identifiant + mot de passe hashé), deliberately separate from the future
`personnes` module (recensement villageois): a `personneId` column exists on
`utilisateurs`, nullable and indexed but with no FK/Prisma relation yet, ready
for `personnes` to be wired in later without touching this table again.

| Method | Route                                 | Rôle                                                                       |
| ------ | ------------------------------------- | -------------------------------------------------------------------------- |
| POST   | `/api/v1/utilisateurs`                | Créer un utilisateur (mot de passe hashé, jamais retourné)                 |
| GET    | `/api/v1/utilisateurs`                | Lister (pagination, `recherche`, `actif`, `inclureSupprimes`)              |
| GET    | `/api/v1/utilisateurs/:id`            | Obtenir par `uuid` (identifiant public)                                    |
| PUT    | `/api/v1/utilisateurs/:id`            | Modification complète — **aucune route PATCH**                             |
| POST   | `/api/v1/utilisateurs/:id/desactiver` | Suppression logique (`actif=false`, `supprime=true`, `supprimeLe=now()`)   |
| POST   | `/api/v1/utilisateurs/:id/reactiver`  | Restaure la même ligne (`actif=true`, `supprime=false`, `supprimeLe=null`) |

Full parameter/body/response documentation: `GET /api-docs` (Swagger UI) once
the server is running.

**No physical deletion, ever**: there is no `DELETE` route, and no code path
in `src/` calls `prisma.utilisateur.delete()`/`.deleteMany()`. `desactiver`/
`reactiver` are the only lifecycle transitions; the row, its `uuid`, and its
history stay in the table permanently.

## What's deliberately **not** included yet

- No other business models (Personne, Famille, Union, Résidence, Actualité, ...)
- No other business routes (`/personnes`, `/familles`, `/unions`, `/actualites`, ...)
- No authentication flows (login/refresh/OTP/reset password), no RBAC — only the
  infrastructure (`bcrypt`, `jsonwebtoken`, `JWT_SECRET`/`JWT_EXPIRES_IN`) is in place;
  this is the next phase of MODULE 01, on top of the `utilisateurs` CRUD above
- No frontend integration

These are each a dedicated, separate phase on top of this foundation.
