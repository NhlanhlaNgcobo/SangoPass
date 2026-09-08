# SangoPass

A South African residential and student-accommodation SaaS for properties, people, visitor access and maintenance. Forest green, ivory and lime branding, an original doorway/check logo, and generated imagery reflecting South Africa's diverse communities. Asset sources and image prompts: [brand guide](docs/BRAND.md).

## Run locally

Use Node.js 24. On Windows PowerShell use npm.cmd if npm.ps1 is blocked.

~~~sh
npm ci
npm run dev
~~~

Open http://localhost:3000 and choose **Start your free trial**. Create your organisation, add a property and units, then invite residents or security. No cloud project is needed: records are saved to data/sangopass.sqlite (ignored by Git). Never commit customer databases or credentials.

- /register creates a real account and organisation with a 14-day Starter trial.
- /login signs in to the live /workspace using a server session.
- Managers manage properties, units, invitations, visitor movements, rent status, reports and billing.
- Managers enrol residents by email and vacant unit. Apartment residents receive a generated unit-linked username; student accommodation requires their student number, preserved exactly (including leading zeroes).
- The welcome email provides the username, property/unit and a one-use password-setup link. Tenant sign-in is at /tenant/login. The emailed login link pre-fills the property code so matching student numbers at different properties remain separate.
- Residents activate their account by setting their own password, then request and cancel guest visits and submit reports. Existing account holders confirm their existing password instead of having it overwritten.
- Security joins with an assigned property, scans QR passes, checks visitors in/out and submits reports.
- /pass/[token] is a private guest pass with a printable QR code, emailed to the resident and to the visitor when an address is given. Its purpose is to let the invited visitor confirm they are on the system before they travel. It omits the visitor phone number, all host account details, and all but the last four characters of the identity document.
- /demo is a full interactive demonstration: the real workspace running against a sample estate held in the visitor's browser. Pick a role, switch between them, and the data follows. Nothing is stored, nothing is sent, and no account is created. /dashboard now redirects there.

All visit times use Africa/Johannesburg (SAST). Camera scanning needs HTTPS or localhost. QR-image upload and reference search are also available. Rent status is a manually maintained register; this app does not collect residents' rent or automatically reset the reporting period.

## Guest visits

**Only a resident may request a guest visit.** Hosting a guest is a resident's right and a resident's responsibility; managers set the limits for each property, and security records arrivals. Neither books a guest.

Every request names the visitor's own identity document, because that is what security checks at the gate:

- An **apartment** requires a South African ID number or a passport number. The ID number's Luhn check digit and date-of-birth prefix are verified, so a transposed digit is caught at entry rather than at the gate.
- A **student residence** may also accept a student number, since most guests there are students. A guest who is not a student still gives an ID or a passport.

The number is normalised (spaces and hyphens removed, upper-cased) and stored whole for the gate, but only its last four characters ever leave the server: the resident's list, the pass page and every API response carry a masked value.

The resident chooses one of three visit types:

| Type | Window | Counts against |
| --- | --- | --- |
| Day visit | Arrival and departure on one date | active guest passes |
| Sleepover | One night; departure falls on the next date | active passes and the monthly night budget |
| Extended sleepover | Two or more consecutive nights | active passes and the monthly night budget |

A sleepover's check-in window runs from the arrival time on the first date to the departure time on the last, so a guest can be admitted on any night of the stay.

**Every request is confirmed with the resident's own password.** The session cookie proves who signed in; it does not prove who is holding the phone. A guest enters the building in the resident's name, so the request re-authenticates before anything is written. Attempts are throttled per account.

**The pass goes to both the resident and the visitor.** The resident always receives it: they are the reliable delivery address, and plenty of guests do not carry a smartphone. If the resident also gives the visitor's email address — optional — the visitor receives their own copy, so they can confirm they are on the system before travelling. Without email configured the pass is still created and the resident copies the link by hand.

**Only the guard or reception scans the QR code.** Check-in and check-out are recorded by a security or manager account at the property. A resident holds a copy of the pass so a guest with no phone still has something to present, and can cancel a pass they created, but never records the arrival themselves. The arrival window and the one-way status transitions apply to everyone equally.

**The property manager sets three limits per property**, from Properties → Visitor limits:

- **Sleepover nights per unit each month** (default 8). A stay is counted against the month it begins in, so one booking is never split across two budgets. Set 0 to disallow sleepovers.
- **Longest single sleepover** (default 3 nights).
- **Guest passes a unit may hold at once** (default 2). Upcoming and checked-in passes occupy a slot; checking out or cancelling frees it.

Limits are enforced per unit, not per person, and enforced on the server. The resident sees where their unit stands for the current month before filling in the form.

## Maintenance and complaints

Residents log maintenance issues, security concerns, noise and anything else from **Reports**, choosing how urgent it is: **Emergency**, **Urgent**, **Normal** or **Low**. Each level carries a plain description of what it means, so "emergency" keeps meaning emergency.

The property manager's **Maintenance** screen shows every report in the organisation, worked most-urgent-first and newest within a level, carrying the resident's name and unit so it is clear which door to knock on. An open emergency or urgent issue raises a banner at the top of the screen — amber for urgent, brick for an emergency — with a coloured stripe down each row so the queue reads while scrolling. Managers re-triage anything mis-rated: residents say how bad it feels, the manager decides what it is.

Ordering is by a stored numeric rank, not by string, so one query sorts identically on SQLite and Firestore.

Alongside it, **Maintenance contacts** is the manager's directory of in-house staff and outside contractors: name, trade, company, phone, email and a note. It is a phone list and nothing more — no contact is an account, none of them can sign in, and none of them grants any access.

## The demo

`/demo` runs the **real workspace component** against an in-browser sample
organisation - two properties, six residents, a week of arrivals, a maintenance
queue and a contacts directory. It is not a mock-up: `lib/demo/engine.ts`
imports the same validation, visitor limits, visit-window and urgency rules the
server runs, so the demo cannot promise behaviour the product does not have.
What is simulated is persistence and identity, nothing else.

A prospect can follow one guest end to end: sign in as the resident, request a
visit (confirming with the sample password `sangopass`), switch to Security and
check the guest in at the gate, then switch to the manager and watch the
maintenance queue and visitor limits. Role scoping is derived by the same rules
as the server, so switching roles demonstrates real isolation. **Reset data**
puts the world back.

Set `SANGOPASS_DEMO=true` for a showcase deployment: the boot guard then allows
ephemeral hosting (there is nothing to store), and the sign-in screens say
accounts are switched off and point at the demo.

## Backends

Storage and credentials sit behind one interface, selected by `SANGOPASS_BACKEND`.

| | `sqlite` (default) | `firebase` |
| --- | --- | --- |
| Data | Node 24 built-in SQLite, one file | Cloud Firestore |
| Credentials | salted scrypt on the user record | Firebase Authentication |
| Deployment | one server with a persistent disk | any host, including serverless |
| Horizontal scaling | no | yes |

Nothing above `lib/server/store/` and `lib/server/identity/` knows which is
active, and the application, API and UI are identical on both. With no setting,
Firebase is used when its credentials are present and SQLite otherwise.

Firestore has no joins and no unique indexes, so records carry the display
fields they need and every uniqueness rule is a document in `reservations`
whose id is the key. SQLite was rebuilt on the same shape in migration v3 and
uses the same mechanism, so the two backends cannot quietly diverge.

**Setup, emulator, data model, rules and indexes: [docs/FIREBASE.md](docs/FIREBASE.md).**

## Accounts and organisation isolation

Passwords use salted scrypt on the SQLite backend and Firebase Authentication on the Firebase backend; the Firebase uid and the SangoPass user id are the same string. Sessions are the application's own in both cases: a random token whose SHA-256 is stored server-side, in an HttpOnly, SameSite=Lax cookie, Secure whenever the request actually arrived over TLS (a terminating proxy's `X-Forwarded-Proto` counts). Mutation endpoints enforce the configured request origin, validate inputs and use bound parameters. Every workspace action verifies the authenticated organisation membership and role/property assignment before anything else. Invitation tokens expire after seven days and can be used once. Managers can revoke pending invitations or remove another member; removal frees the unit, cancels that member's upcoming passes, ends their username login and retains historical records.

Rate limits are scoped per account, per property and per caller address, with global buckets kept only as a backstop far above any single tenant's traffic. One organisation's sign-in traffic cannot lock another organisation out.

The v3 migration rebuilds a v1 or v2 database on the current shape. It preserves existing passwords, unit assignments, login codes, usernames and email sign-in, and backfills the denormalised fields from the old joins. The v5 migration adds report urgency with the numeric rank the manager queue sorts on, the maintenance contacts directory, and the optional visitor email address; existing reports become "normal", which is exactly what they were. The v4 migration adds visit types, sleepover windows, visitor identity documents and the per-property limits: existing passes become day visits ending on the date they started, their guest slot is released if they are already closed, and their host's unit is derived from the membership. No identity number is invented for a pass taken before the upgrade — it reads as "not recorded". Existing student records without a stored student number still need re-enrolment with the student number; it cannot be inferred.

One account can belong to multiple organisations through invitations; switch between them in the workspace menu. Public signup creates a manager only, never a platform administrator. The platform administration screens under /dashboard remain explicitly labelled demo screens; there is no public route to cross-organisation production access.

Password recovery supports Resend when RESEND_API_KEY, EMAIL_FROM and APP_URL are configured. Reset links expire after 30 minutes, are single use, and revoke previous sessions and provider refresh tokens. Enrolment welcome emails are automatically submitted to Resend when configured. The manager sees not-configured, failed or sent-to-provider status and can resend a pending invitation. Resending rotates the setup token, invalidates its previous link and retains the username. Provider acceptance does not guarantee inbox delivery; no delivery webhook is configured. Without credentials, enrolments are saved visibly as unsent.

Every mutation writes an audit row, and managers can read their own organisation's trail at `GET /api/activity?org=<id>`. Rows older than `AUDIT_RETENTION_DAYS` are pruned by maintenance.

## Pricing and PayFast

Starter: R499/month, 25 units, 1 manager. Growth: R1,299/month, 150 units, 5 managers. Premium: R2,499/month, 300 units, 10 managers. Portfolio remains a custom commercial offering, outside self-service checkout. Prices and limits have a single definition in `lib/server/plans.ts`; enforcement at creation time and at checkout read the same table.

Copy .env.example to .env and set your own PayFast merchant credentials. PAYFAST_MODE defaults to sandbox. Checkout also requires APP_URL to be a publicly reachable HTTPS origin so PayFast can deliver its notification to /api/billing/notify. The app uses one-off monthly payments with manual renewal, not automatic recurring subscriptions. The amount shown is the checkout total; no extra tax is added by the application.

Prices and limits are enforced on the server. A redirect from checkout never activates a plan. Notifications verify the signature, merchant, amount, payment reference, PayFast referrer domain and a server-to-server confirmation. Payments are idempotent, and anything the merchant can legitimately resend — including a duplicate reference — is acknowledged with 200 rather than retried into an error loop. Sandbox payments are labelled separately and never activate live paid entitlements. Only verified live payments extend paid access. When access expires, existing records and gate/report operations remain available; creation of properties, units, invitations and new visitor passes requires renewal.

`npm run maintenance` emails managers whose paid month or trial ends within `RENEWAL_REMINDER_DAYS`. Schedule it daily; without it, manual renewal lapses silently.

The integration follows [PayFast custom integration](https://developers.payfast.co.za/) and its [official notification implementation](https://github.com/Payfast/payfast-php-sdk/blob/master/lib/PaymentIntegrations/Notification.php). No merchant credentials are supplied, no live payment has been executed, and public callback delivery still needs a merchant sandbox acceptance test before launch.

## Operations

The operator console is a CLI. It runs against whichever backend the
environment selects, so with Firebase credentials it works from an operator
workstation rather than on the application host.

~~~sh
npm run admin -- tenants                       # every organisation and its state
npm run admin -- export <orgId> dump.json      # full tenant export
npm run admin -- extend <orgId> 30             # move the trial or paid horizon
npm run admin -- suspend <orgId> --confirm     # end access and all sessions
npm run admin -- delete <orgId> --confirm      # erase a tenant (export first)
npm run admin -- invoices <orgId>
npm run admin -- invoice-paid <id> <ref> --confirm
~~~

Managers can export their own organisation at `GET /api/tenancy/export?org=<id>`. Deletion erases every record scoped to the organisation, releases its uniqueness keys, and removes any account that belonged to no other organisation, including its credential in the identity backend.

Schedule maintenance daily. It sweeps elapsed sessions, reset tokens and rate-limit windows, prunes the audit trail, and sends renewal reminders:

~~~sh
npm run maintenance
~~~

## Deployment

**Full guide, both supported shapes, and the go-live checklist: [docs/DEPLOY.md](docs/DEPLOY.md).**

Run this before every deploy. It reads the environment the way the server will, prints no secrets, and exits non-zero if anything is unsafe or missing:

~~~sh
npm run preflight
~~~

`GET /api/health` is a readiness probe: it confirms the storage backend answers and reveals nothing else.

The server refuses to start on a configuration that is silently unsafe: a production `APP_URL` that is not HTTPS (loopback excepted), or the SQLite backend on a platform with ephemeral per-invocation storage such as Vercel, Netlify, Lambda or Cloud Run. Use `SANGOPASS_BACKEND=firebase` on those platforms.

On the SQLite backend, run **one Node.js application instance with a persistent disk**. Do not put the database on ephemeral storage or run independent replicas with separate files.

~~~sh
npm run build
npm start
~~~

For Docker, copy .env.example to .env, set APP_URL to your public HTTPS origin, then run:

~~~sh
docker compose up --build -d
~~~

The provided image runs as the node user. Compose binds port 3000 on loopback and persists the database in the sangopass-data volume. Put an HTTPS reverse proxy in front of it, preserve the public Host header and `X-Forwarded-Proto`, and proxy to port 3000. APP_URL is used for origin checks and absolute payment/recovery links. Docker must have network access at build time to obtain the bundled Google fonts.

Responses carry `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a camera-only `Permissions-Policy` and `Cross-Origin-Opener-Policy`. The policy relaxes `script-src` and `connect-src` in development only, for hot reload.

Back up SQLite with `npm run backup` on a host installation. This uses SQLite's consistent backup API and writes to data/backups. Store encrypted backup copies off the application host and test restoration. For restoration stop the app and replace the database from a verified backup; preserve restrictive file permissions. Do not copy only a live WAL-mode database file without using a consistent backup. On Firebase, configure scheduled backups in the Google Cloud console.

## Verification

~~~sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:http
~~~

The automated suite covers real tenant isolation on the live backend, role denial, invitation replay prevention, SAST visit windows, password reset/session revocation, signed and idempotent payment callbacks with mocked PayFast confirmation, audit-trail scoping, tenant export and erasure, per-tenant rate-limit scoping, the store contract shared by both backends (uniqueness reservations, read-before-write transactions, rollback, query translation), refusal to boot on unsafe deployments, every schema migration from v1 through v4, and the guest-visit rules: SA ID checksum validation, passport and student-number acceptance per property type, identity masking, residents-only booking, day/sleepover/extended windows, each of the three manager-set limits including the release of nights and slots on cancellation, the pass reaching both the resident and the visitor, check-in being refused to a resident and accepted from reception, password re-authentication on every guest request, report urgency ordering and manager re-triage, and the contacts directory including its organisation scoping. Plus the original demo's QR encode/decode and workflows. The HTTP smoke test starts an isolated production server, exercises account creation, invitations, a resident-only guest request with identity capture, the visitor-facing pass page and its masking, a resident signing their own guest in and out, the health probe, cross-tenant/CSRF denial and SSR, then restarts the server to verify database and session persistence. It uses generated test accounts and a temporary database, never the application database.

`NEXT_DIST_DIR` builds into an alternate directory, so a verification build can run while another server is serving `.next`.

A connected browser was unavailable during implementation. Desktop/mobile visual review, physical-camera scanning and actual PayFast/Resend delivery remain external acceptance checks. The Firebase backend is implemented and typechecked but has not been executed against a real project or emulator in this environment. Docker configuration is provided; the image has not been run here.
