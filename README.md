# SangoPass

A South African residential property SaaS interface for visitor access, residents, rent and maintenance. Rebranded from GatePass with a forest, ivory and lime identity and original imagery representing South Africa's diverse communities.

## Run locally

Use Node.js 24 and npm.

~~~sh
npm ci
npm run dev
~~~

Open http://localhost:3000. On Windows PowerShell, use npm.cmd if npm.ps1 is blocked by your execution policy.

## Current application

This repository is an interactive, browser-persisted demo. It does not yet include production authentication, server-side organisation isolation, a shared database, notification delivery or payment processing. Role selection is a preview control, not an authentication boundary. Demo visitors are shared across the roles in one browser; they are not synced to another device. Do not use real resident information in this demo.

- Public homepage and pricing at /pricing.
- Resident: invite a visitor, view/download a branded QR pass, copy visit details, cancel an invitation and submit a request.
- Security: scan with a camera or upload a QR image, verify the pass token, manually search, check in during the scheduled SAST window and check out.
- Manager: review visitors, assign a resident to an existing vacant unit, track occupancy, save rent/frequency updates, resolve reports and change demo plans.
- Platform admin: browse organisations, properties, plans and platform activity.
- Camera scanning requires HTTPS or localhost and user camera permission. Image upload and manual search are available as alternatives. QR decoding uses jsQR: https://github.com/cozmo/jsQR.
- Legacy GatePass storage keys and QR payloads remain supported so the rebrand does not discard existing demo records.

## Pricing

The existing pricing strategy is retained: Starter R499/month (25 units, 1 manager), Growth R1,299/month (150 units, 5 managers), Premium R2,499/month (300 units, 10 managers), and custom Portfolio pricing. Prices are indicative; tax treatment and commercial terms must be agreed before enabling checkout. Demo plan changes never collect payment.

## Verification

~~~sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
~~~

Integration tests cover a resident invitation through rendered QR encoding/decoding, security check-in/out and manager visibility, tampered tokens, legacy passes, invalid state transitions, South African dates, saved plans, rent, resident assignments and report resolution. They run against in-memory browser storage; they are not browser automation or production tenant-isolation tests. GitHub Actions runs lint, tests and build.

Browser QA still needs to be performed on desktop/mobile with a connected browser: landing/pricing navigation; all four roles; modal focus/Escape; downloaded pass and uploaded QR; permission denied/camera cleanup; resident assignment; rent/plan persistence; report updates. No connected browser was available during this build.

## Live SaaS work remaining

Connect the chosen authentication/database provider and payment merchant account before a production launch. The initial code comments proposed Supabase, but no project configuration or credentials are present in this repository. Production requires authenticated memberships and property assignments, enforced organisation-level data access, persisted records shared between devices, a payment checkout and verified webhook integration, and real delivery of notifications. These are separate from the completed brand and demo workflows.

Brand files, asset paths and exact image prompts are documented in [docs/BRAND.md](docs/BRAND.md). PNG source images are retained beside WebP delivery assets in public/brand.
