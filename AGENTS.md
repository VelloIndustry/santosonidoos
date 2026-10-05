# Project workflow

- Ryan wants completed code changes committed and pushed to GitHub after relevant checks pass. Do not commit credentials, local environment files, or unrelated changes.
- Use a feature branch for changes that are not yet ready for production. A push to GitHub is not evidence of a successful production deployment.
- Run `npm test` for authentication changes. For database or session changes, also validate against a local database; never use production for smoke-test mutations.
- `npm run build` runs database migrations. Inspect pending migrations and the target database before running it.
- Keep database schema changes in `migrations/`, database queries in `db/`, and routes in `routes/`.
- Render access is available through Ryan's Vello Industry Chrome profile. Verified project: https://dashboard.render.com/project/prj-d8di111o3t8c73ej6p9g ; web service: srv-d8dhq8jbc2fs73el5pp0 ; PostgreSQL: dpg-d8dhpcurnols739cgni0-a.
