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
- Residents join with a private email-bound invitation, create/cancel guest passes and submit reports.
- Security joins with an assigned property, scans QR passes, checks visitors in/out and submits reports.
- /pass/[token] is a private, shareable guest pass with a printable QR code. It omits the visitor phone number and host account details.
- /demo and /dashboard/* are the separate browser-only sample-data experiences, including the platform-admin preview. Demo role selection never grants live access.

All visit times use Africa/Johannesburg (SAST). Camera scanning needs HTTPS or localhost. QR-image upload and reference search are also available. Rent status is a manually maintained register; this app does not collect residents' rent or automatically reset the reporting period.

## Accounts and organisation isolation

Passwords use salted scrypt. Random session tokens are hashed in SQLite; cookies are HttpOnly and SameSite=Lax (Secure on configured HTTPS deployments). Mutation endpoints enforce the configured request origin, validate inputs and use bound SQL parameters. Every workspace action verifies the authenticated organisation membership and role/property assignment. Invitation tokens expire after seven days and can be used once. Managers can revoke pending invitations or remove another member. Removal cancels that member's upcoming passes and retains historical records.

One account can belong to multiple organisations through invitations; switch between them in the workspace menu. Public signup creates a manager only, never a platform administrator. The platform administration screens remain explicitly labelled demo screens; there is no public route to cross-organisation production access.

Password recovery supports Resend when RESEND_API_KEY, EMAIL_FROM and APP_URL are configured. Reset links expire after 30 minutes, are single use and revoke previous sessions. Team invitations are copied and shared directly by the manager; they are not automatically emailed.

## Pricing and PayFast

Starter: R499/month, 25 units, 1 manager. Growth: R1,299/month, 150 units, 5 managers. Premium: R2,499/month, 300 units, 10 managers. Portfolio remains a custom commercial offering, outside self-service checkout.

Copy .env.example to .env and set your own PayFast merchant credentials. PAYFAST_MODE defaults to sandbox. Checkout also requires APP_URL to be a publicly reachable HTTPS origin so PayFast can deliver its notification to /api/billing/notify. The app uses one-off monthly payments with manual renewal, not automatic recurring subscriptions. The amount shown is the checkout total; no extra tax is added by the application.

Prices and limits are enforced on the server. A redirect from checkout never activates a plan. Notifications verify the signature, merchant, amount, payment reference, PayFast referrer domain and a server-to-server confirmation. Payments are idempotent. Sandbox payments are labelled separately and never activate live paid entitlements. Only verified live payments extend paid access. When access expires, existing records and gate/report operations remain available; creation of properties, units, invitations and new visitor passes requires renewal.

The integration follows [PayFast custom integration](https://developers.payfast.co.za/) and its [official notification implementation](https://github.com/Payfast/payfast-php-sdk/blob/master/lib/PaymentIntegrations/Notification.php). No merchant credentials are supplied, no live payment has been executed, and public callback delivery still needs a merchant sandbox acceptance test before launch.

## Deployment

This version runs as **one Node.js application instance with a persistent disk**, using Node 24's built-in SQLite. Do not put the database on ephemeral/serverless storage or run independent replicas with separate files. A shared database adapter is required before horizontal scaling.

~~~sh
npm run build
npm start
~~~

For Docker, copy .env.example to .env, set APP_URL to your public HTTPS origin, then run:

~~~sh
docker compose up --build -d
~~~

The provided image runs as the node user. Compose binds port 3000 on loopback and persists the database in the sangopass-data volume. Put an HTTPS reverse proxy in front of it, preserve the public Host header, and proxy to port 3000. APP_URL is used for origin checks and absolute payment/recovery links. Docker must have network access at build time to obtain the bundled Google fonts.

Back up with npm run backup on a host installation. This uses SQLite's consistent backup API and writes to data/backups. Store encrypted backup copies off the application host and test restoration. For restoration stop the app and replace the database from a verified backup; preserve restrictive file permissions. Do not copy only a live WAL-mode database file without using a consistent backup.

## Verification

~~~sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:http
~~~

The automated suite covers real database tenant isolation, role denial, invitation replay prevention, SAST visit windows, password reset/session revocation, signed and idempotent payment callbacks with mocked PayFast confirmation, plus the original demo's QR encode/decode and workflows. The HTTP smoke test starts an isolated production server, exercises account creation, invitations, resident passes, cross-tenant/CSRF denial and SSR, then restarts the server to verify database and session persistence. It uses generated test accounts and a temporary database, never the application database.

A connected browser was unavailable during implementation. Desktop/mobile visual review, physical-camera scanning and actual PayFast/Resend delivery remain external acceptance checks. Docker configuration is provided; the image has not been run in this environment.
