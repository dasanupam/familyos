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

## Backlog / Not yet built (P1/P2)
- P1: image OCR for lab/prescription photos (Gemini multimodal fallback or Tesseract)
- P1: edit existing transactions/investments/labs in-line
- P1: link documents to specific entries created from them
- P1: export to CSV
- P2: extension modules UI (fitness, travel) using GenericEntry collection
- P2: shared household notifications (e.g. "Priya logged BP 145/95 — outside range")
- P2: monthly auto-summary email
- P2: net worth time series + investment XIRR
- P3: encryption-at-rest for sensitive health data
- P3: PWA install + push notifications

## Test credentials
demo@familyos.app / Demo@2026  (seeded; see /app/memory/test_credentials.md)

## Iteration 2 — 2026-02 (this session)
Added end-to-end:
- **Travel module**: trips CRUD, per-trip spend summary, budget progress bars, AI-routed from "Booked Goa trip…" / hotel emails.
- **Career module**: timeline (promotions/raises/certs/achievements), roles & salary progression chart, skills with 1-5 levels. AI auto-creates promotion events from offer/appointment letter text.
- **AI parser** now handles a 5-category schema: finance, health, travel, career, generic. PDFs → Claude Sonnet 4.5. Images → **Gemini 2.5 Flash via Emergent Universal Key** (no extra subscription needed).
- **Inline edit** for transactions, investments, loans, labs, vitals, prescriptions, trips, career-events via a single PATCH `/api/{kind}/{id}` endpoint.
- **CSV export** for transactions/investments/loans/labs/vitals/prescriptions/trips/career-events/goals via `/api/export/{kind}.csv?auth=…`.
- **Document → records linking**: every record created from a file upload stores `origin_document_id`. `/api/documents/{id}/records` returns linked rows.
- **Net-worth time series**: `POST /api/finance/snapshot` saves a daily snapshot; `GET /api/finance/net-worth-series` lists them.
- **Investment returns**: `GET /api/finance/investments/xirr` returns per-holding + overall absolute return %.

## Backlog (remaining open items)
- True XIRR with per-lot cashflows → now using CAGR when purchase_date set (upgraded 2026-02)
- Auto-snapshot net-worth on a schedule
- Weekly digest email (Resend)
- Image OCR for lab photos (Gemini multimodal)
- PWA install + push notifications
- Shared household notifications
- Part 5: Plan Upload → Auto-update with diff/confirm modal and update_log

## Iteration C — 2026-02 (this session)
- **Career inline edit**: Edit buttons (pencil) on timeline events, role cards, and skills. PATCH via `/api/career-events`, `/api/career-roles`, `/api/career-skills`.
- **PATCH_COLLECTIONS**: Added `career-roles` and `career-skills` to backend generic PATCH handler.
- **CSV_KINDS**: Added `career_roles` and `career_skills` to backend export.
- **Investment CAGR**: Added `purchase_date` field to `InvestmentIn` model. `/finance/investments/xirr` now returns `cagr` (annualized) when `purchase_date` is set.
- **Finance investments table**: Added "Return %" computed column (green/red based on gain/loss).
- **Finance investments form**: Added `purchase_date` date picker field.
- **Documents linked records**: Already implemented via `LinkedRecords` component — verified working.
- **Net worth time-series chart**: Already wired in Overview.jsx — auto-snapshots on each load, Recharts LineChart renders when >= 2 snapshots exist.
