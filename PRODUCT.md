# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary customers, weighted equally:

- **Apartment managing agents and landlords** running residential blocks.
- **Student-accommodation operators** running residences where most residents and most guests are students.

Both are served by the same product. Inside each customer organisation there are four roles, each with its own job:

- **Managers** run the property: properties, units and how many people each holds, enrolment, visitor limits, maintenance, documents, requests, announcements, rent register, the property's books (**Money**), brand colours and billing.
- **Reception** is the front desk of one property: every manager screen for that building except **Money** and **Billing**, and it cannot create manager or reception accounts.
- **Residents** request and cancel guest visits, submit reports, give notice, and read the notice board. They usually use a phone.
- **Security** works the gate: scans QR passes, enters gate codes, checks visitors in and out, signs regular workers in and out. Usually on a phone or tablet at a gate, often in poor light and under time pressure.

A fifth audience: **the invited visitor**, who opens a private pass page (`/pass/[token]`) to confirm they are on the system before travelling. They may not have a smartphone at all.

## Product Purpose

SangoPass connects visitor access, residents and property operations for South African student residences, apartments and residential communities, so a property runs from one system instead of a gate app, a spreadsheet and a WhatsApp group.

Success: a manager can run a building end to end in SangoPass, a resident can get a guest in without phoning anyone, and a guard can verify a visitor in seconds with confidence.

## Positioning

All four of these are confirmed as real differentiators:

1. **Gate and operations in one.** Visitor access, residents, maintenance, rent register, documents, requests, announcements and money live in one workspace, not separate tools.
2. **Built for South Africa.** SA ID numbers are checked (Luhn and date-of-birth prefix), identity numbers are masked to the last four characters everywhere outside the server, every pass has a gate code for a guest with no smartphone, SMS via BulkSMS, Africa/Johannesburg time, rand pricing VAT-inclusive.
3. **Resident-owned guest passes.** Only a resident may request a guest visit, confirmed with their own password; managers set limits per property; security records arrivals. Neither manager nor security books a guest.
4. **Price and a free tier.** A 14-day Starter trial falls back to a **Free** tier (5 units, 10 residents, one sign-in) instead of a lockout. Paid tiers are Starter, Growth and Premium; the source of truth for names, prices and limits is `lib/shared/plans.ts`. Never restate prices from memory.

## Operating Context

- Managers and reception work at a desk, on desktop or tablet, through long sessions in the `/workspace`.
- Security works at a gate on a phone or tablet: camera scanning (needs HTTPS or localhost), QR-image upload, gate-code entry, and search by reference, visitor name or the last four characters of an identity number. Codes verify; they do not admit. The guard still checks status, arrival window and the document itself.
- Residents sign in at `/tenant/login` with a generated unit-linked username (apartments) or their student number exactly as issued, leading zeroes included (student residences).
- Guest visits are day visits, sleepovers or extended sleepovers, limited per unit per month by the manager.
- Rent status is a manually kept register. SangoPass does not collect rent.
- `/demo` runs the real workspace against a sample estate held in the visitor's browser: pick a role, switch roles, nothing stored or sent. The Vercel deployment publishes the demo build.

## Capabilities and Constraints

- Next.js 16 app (`next dev`), SQLite locally (`data/sangopass.sqlite`), Firebase configuration present for cloud.
- Responsive targets and checks are recorded in `docs/RESPONSIVE.md`: one column up to 640px, drawer navigation to 1023px, sidebar from 1024px, capped width from 1600px; 44px touch targets; 16px inputs on small screens; safe-area spacing.
- Privacy is a product feature, not a setting: the pass page omits the visitor phone number, all host account details, and all but the last four characters of the identity document.
- SMS is optional and untested against a live BulkSMS account. Without credentials the resident reads the gate code to their guest.

## Brand Commitments

- Name: **SangoPass**. Logo: an open doorway combined with a verification tick (`public/brand/sangopass-mark.svg`, `public/brand/sangopass-logo.svg`, `components/ui/Brand.tsx`).
- Existing brand guide: `docs/BRAND.md` (colours, type and imagery rules live there and in code, not here).
- South African English, rand amounts, local phone number examples, Africa/Johannesburg times.
- Imagery shows South Africa's diverse communities living ordinary community life, in locally recognisable buildings and indigenous planting. All imagery is generated and illustrative, never presented as customer photos or endorsements.
- Voice in the existing copy: plain, specific and reasoned. It explains why a rule exists ("a role that can mint managers is a manager") instead of asserting it.

## Evidence on Hand

- **No customers, pilots, testimonials, case studies, usage numbers or press exist yet.** Do not invent any, and do not imply them through logos, quotes, star ratings or "trusted by" rows.
- The live interactive demo at `/demo` is the main proof.
- 465 automated tests in `tests/` cover the product rules.
- Generated brand imagery in `public/brand/` (prompts in `docs/BRAND.md`); marketing image plan in `docs/marketing-images.json`.

## Product Principles

1. **Each role sees its own job.** Managers, reception, residents and security have different rights and different screens; never blur them for convenience.
2. **The gate must be fast and certain.** Anything security touches works on a phone, one-handed, in a hurry, and confirms rather than guesses.
3. **Show privacy, don't just claim it.** Masked identity numbers and minimal pass pages are visible proof of care for residents' and visitors' data.
4. **No smartphone is not an edge case.** Every guest flow has a path for someone without a phone or data.
5. **Earn trust with the real thing.** With no customers yet, the demo and the product's own precision carry the case; never fake social proof.

## Accessibility & Inclusion

- Mobile-first for residents and security, on modest Android phones and patchy data.
- Keyboard and screen-reader support for navigation (focus trapping, Escape, restoration) and 200% zoom are stated targets in `docs/RESPONSIVE.md`; visual acceptance checks there are still to run.
