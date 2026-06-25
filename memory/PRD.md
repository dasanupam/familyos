# Family Life OS — PRD

## Original problem statement
Personal Life Operating System for a household. Hand over any document/text and have
finance + health + life data flow into live dashboards. Multi-member, mobile-first,
INR, generic enough to accept any report or pdf and route to the right module.

## Personas
- **You (primary)** — single source of truth across finance, health, life.
- **Partner / family member** — owns their own data, visible in family view.
- **Future members** — brother (care fund), parents, children.

## Architecture
- React (CRA + craco, `@/` alias) + Tailwind + Shadcn + Recharts
- FastAPI + Motor (MongoDB) + JWT email/password auth
- Claude Sonnet 4.5 via Emergent Universal LLM key (`anthropic/claude-sonnet-4-5-20250929`)
- Emergent Object Storage for files
- PDF text extracted with `pdfplumber` before Claude parsing
- Generic "GenericEntry" collection lets new modules (fitness, travel) be added with zero schema change

## Implemented (v1, 2026-02)
- Auth: register, login, /me, JWT 30-day, bcrypt hash
- Family members CRUD + per-member color tagging
- Universal Inbox: text + file (PDF/TXT/CSV/MD); Claude routes to module
- Finance: transactions, investments, loans CRUD; monthly summary; net worth; category breakdown; 12-month trend chart
- Goals: full CRUD with progress bars
- FIRE tracker: compound projection of years-to-FIRE, target date, progress %
- Health: vitals, lab results (with trend charts per test), prescriptions
- Documents: storage upload, list, secure download via signed query param
- Dashboard overview: net worth, income/spend, FIRE, goals, latest labs/meds, recent inbox
- Family switcher in header (whole-family / per-member)
- Outfit + Manrope fonts, organic earthy palette (no purple/violet), grain texture, INR

## Iteration 2 — 2026-02 (Iteration B)
- Travel module, Career module, inline edit, CSV export, document→records linking
- Net worth time series, investment XIRR/CAGR
- Image OCR via Gemini 2.5 Flash multimodal
- DiffConfirmView in UniversalInbox (dry_run + /inbox/apply)

## Iteration C — 2026-02
- Career inline edit (events, roles, skills)
- Investment CAGR with purchase_date
- Finance investments: Return % column
- Documents linked records verified

## Iteration D — 2026-06 (current)
- **Priority 1 (Goals)**: Goals domain field + urgency indicator (overdue/at-risk)
- **Priority 2 (Overview/FamilyOverview)**: Extended stat cards, household values
- **Priority 5 (Household/Alerts)**: Extended alert rules (insurance expiry, vaccine due, etc.)
- **Priority 11 (Encryption)**: App-level AES-128 Fernet encryption via crypto_service.py for sensitive text fields
- **Priority 12 (Encrypt Migrations)**: migrate_encrypt.py one-time migration script
- **Priority 4 (Health UI)**: 4-stat summary header, Vitals per-kind sparklines, Labs ALL charts (≥2pts) + flagged toggle, Appointments Upcoming/Past split, Active Meds subtitle with last prescription date
- **Priority 3 (Finance UI)**: Per-tab 3-card summary bars (changes per active tab), Insurance expiry ≤30 days → red row highlight, Subscriptions monthly total in summary
- **Priority 7 (Budget vs Actuals)**: New Finance tab with month picker, grouped bar chart (Budget amber vs Actual green/red), progress bar table per category, full CRUD via /api/finance/budget
- **Priority 10.1 (Global Search)**: Cmd+K command palette, searches transactions/labs/goals/appointments/investments, backend /api/search endpoint, keyboard navigation
- **Priority 10.2 (Dark mode)**: Moon/Sun toggle in header, dark CSS variables, localStorage persistence (flos_dark)
- **Priority 10.4 (Mobile bottom nav)**: Fixed 5-item bottom nav bar on mobile, floating search button
- **Bug fix**: formatINRCompact added to @/lib/api and re-exported from @/lib/utils (was missing)

## Key DB Schema
- Goals: `domain` (String), `urgency` computed from target_date
- Budgets: `month` (YYYY-MM), `category`, `budgeted_amount`, `actual_amount` (computed)
- Encrypted Collections: merchant, name, test, doctor fields via AES-128 Fernet

## Backlog (remaining open items)
- Auto-snapshot net-worth on schedule (cron/background)
- Weekly digest email (Resend integration)
- PWA install + push notifications
- Shared household notifications ("Amal's HbA1c is above 6.5%")
- True per-lot XIRR (currently CAGR approximation)
- P2: image OCR improvements
- P3: Priority 9 (Free tier migration) — EXPLICITLY EXCLUDED by user
- P3: Priority 10.3 (litellm dependency change) — EXPLICITLY EXCLUDED by user

## Test credentials
See /app/memory/test_credentials.md
- Admin: anupam@familyos.app / Test@1234
- Demo: demo@familyos.app / Demo@2026
