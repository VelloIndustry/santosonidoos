# Chamba Mentality / Santo Sonido OS

Express, static HTML, and PostgreSQL application for studio services, internal budget tracking, CRM, invoices, and WhatsApp workflows.

## Local setup

Use Node.js 22+ and a dedicated local PostgreSQL database. Install locked dependencies with `npm ci` when setting up a new checkout.

The server does not automatically load `.env`. Start from the repository directory:

```sh
node --env-file=.env server.js
```

Use the port set in `.env` (this computer is configured for 3001).

Required local configuration:

- `DATABASE_URL`: local development PostgreSQL connection string.
- `ADMIN_RYAN_EMAIL`, `ADMIN_RYAN_PASSWORD`: administrator login.
- `SESSION_SECRET`: random secret used to sign sessions.
- `PORT`, `BASE_URL`: local listening port and matching URL.
- `BUDGET_SECRET`: secret for trusted internal integrations.

Optional credentials enable WhatsApp (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BOT_NUMBER`), receipt extraction (`ANTHROPIC_API_KEY`), and email (`POLSIA_API_KEY`). Javier's login uses `ADMIN_JAVIER_EMAIL` and `ADMIN_JAVIER_PASSWORD`. Never commit `.env` or credentials.

## Validation

```sh
npm test
```

The authentication regression tests use a simulated revocation store and do not require database credentials. Integration validation should additionally check local login, protected pages, authenticated API reads, logout replay, and server restart behavior against PostgreSQL.

`GET /health` verifies that the HTTP server responds; it does **not** check database connectivity.

## Database migrations and deployment

Inspect pending migrations and verify the target database before running:

```sh
node --env-file=.env migrate.js
```

Existing migrations can change business records. `npm run build` also runs migrations; it is not a compile-only check. Deployment settings are in `render.yaml`; actual hosting account ownership and production configuration must be verified separately.

The session-revocation migration must be applied before releasing the logout fix. Signed sessions survive restarts, while logout stores a token hash in PostgreSQL so the old cookie is rejected by all instances. Database failures deny signed-session access. Sessions without a signing secret retain the existing process-local behavior.

## Codex project

Add the existing repository folder as a local Codex project, rather than creating another checkout. On Ryan's computer that folder is `/Users/ryan/code/santosonidoos`.
