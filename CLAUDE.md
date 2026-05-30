# Santo Sonido OS

Music production studio + recording artist based in Medellín, Colombia. Site markets studio services (recording, mixing/mastering, video production) and the artist project to LATAM and international audiences.

## Stack

Express.js · Node.js · PostgreSQL (Neon) · Render · static HTML pages in `/public/`

## Directory Map

- `server.js` — entry point, Express app, route mounts (≤300 lines, wiring only)
- `migrate.js` — runs DB migrations on deploy
- `routes/` — Express routers, one file per endpoint group
- `db/` — Pool singleton (index.js) + named query functions per entity
- `migrations/` — timestamped .js migration files (DDL only here)
- `public/` — static HTML pages (index, studio, producer, artists, work, budget, crm, crm-join, santocrm, join, dashboard)
- `todos/` — agent task state files (do not edit manually)

## Database

- `contacts` — stores booking/contact form submissions (name, email, service, message, page)
- `budget_entries` — internal P&L entries (track, type, mode, amount_cop, amount_usd, date, description, payment_source, category, client_project, source, added_by_phone, receipt_image_url)
- `crm_clients` — client directory (name, email, phone, city, source, notes, stage, added_by_phone, added_by_role)
- `crm_deals` — pipeline deals per client (name, track, stage, value_cop, value_usd, notes)
- `crm_activity` — timestamped activity log (type, content, client/deal link)
- `santocrm_invite_codes` — valid invite codes with usage limits for SantoCRM beta
- `santocrm_users` — SantoCRM beta signups (name, whatsapp, role, invite_code, verified, session_token)
- `santocrm_otp` — short-lived 6-digit OTPs for WhatsApp verification
- `whatsapp_sellers` — freelancers whitelisted to use the CRM bot (name, phone, role, status, verification_code, leads_added, last_active_at)
- `whatsapp_bot_state` — tracks multi-step bot conversations per sender phone (state, payload JSONB)
- `users` — platform user accounts with subscription fields (synced by Polsia)
- `_migrations` — tracks applied migration files

## External Integrations

- **Polsia Email Proxy** — routes contact form submissions to santosonidostudio@gmail.com, sends auto-reply
- **Cloudflare R2** — hosts all image assets (pub-629428d185ca4960a0a73c850d32294b.r2.dev)
- **Plausible Analytics** — page view + event tracking on all 5 pages
- **WhatsApp Deep Link** — +57 314 882 4744, pre-filled Spanish greeting
- **WhatsApp Cloud API** — bot webhook at /api/whatsapp/webhook; env vars: WHATSAPP_VERIFY_TOKEN, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BOT_NUMBER

## Recent Changes

- 2026-05-22: Budget tracker expansion — Camera as 4th track (Retainer clients, Music videos, Visualizers, Photoshoots, Other deliverables); updated categories for all 4 tracks; Scenario Forecast switcher in Plan view (Conservative $39K / Mid $110K / Home Run $400K annual projections per track/category); routes/budget.js VALID_TRACKS updated
- 2026-05-19: WhatsApp CRM Bot — `/api/whatsapp/webhook` (GET verify + POST message handler), `/api/whatsapp/sellers/*` (register/verify/admin CRUD), `/crm/join` seller onboarding page (self-serve, dark/gold, WhatsApp OTP), `/crm` Sellers admin panel (Bot Sellers overlay with verify/revoke/add); routes/whatsapp.js, db/whatsapp.js, migrations/1747700000000_create_whatsapp_sellers.js; bot commands: /santo + image OCR receipt flow; budget integration: receipts appear in /budget tab
- 2026-05-19: SantoCRM landing page — `/santocrm` (dark/gold landing), `/join` (3-step invite code + signup + WhatsApp OTP), `/dashboard` (beta shell); routes/santocrm.js, db/santocrm.js, migrations/1747700000000_create_santocrm_tables.js; invite codes seeded (SS-BETA24, SS-RYAN01, SS-JAVIER1)
- 2026-05-19: Internal CRM at `/crm` — client directory (search/filter by stage), deal pipeline per client (stages: Contact→Qualifying→Proposal→Negotiating→Won/Lost), activity log (call/email/message/meeting/note), deal value in COP+USD, "Log in Budget" link on won deals; routes/crm.js, db/crm.js, migrations/1747612900000_create_crm_tables.js
- 2026-05-19: Internal budget tracker — `/budget` page with 3 tracks (Studio/Artist/Producer), income/expense entry, Actual vs Planned modes, monthly P&L summary, plan-vs-actual comparison; routes/budget.js, db/budget.js, migrations/1747612800000_create_budget_entries.js
- 2026-05-08: Added "Destination Studio" section to `/studio` — international artist pitch, Medellín travel hooks, Latin Grammy credential, one-trip service list, English-language CTAs; updated meta/SEO for international discovery
