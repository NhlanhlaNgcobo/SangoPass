# Deploying SangoPass`vercel.json` in the repository root already sets `SANGOPASS_DEMO=true` for
both build and runtime, so there is nothing to configure in the dashboard.

That is the whole configuration.
Three shapes. They differ in the backend, not the code.

| | **A. Demo only** | **B. Vercel + Firebase** | **C. One server + SQLite** |
| --- | --- | --- | --- |
| Host | Vercel | Vercel | any VM with a disk |
| Data | none — in the browser | Cloud Firestore | one SQLite file |
| Credentials | none | Firebase Authentication | salted scrypt |
| Real customers | **no** | yes | yes |
| Backups | n/a | Google Cloud scheduled | `npm run backup` |
| Cost floor | free | free tier to start | one small VM |
| Setup | one environment variable | a Firebase project | a VM and a proxy |

**SQLite on Vercel, Netlify, Lambda or Cloud Run will not work and the server
refuses to start there** — each invocation gets its own throwaway filesystem,
so the database would vanish between requests. Option A is the exception: it
stores nothing at all, so there is nothing to lose.

Run this before every deploy. It reads the environment exactly the way the
server will, prints no secrets, and exits non-zero if anything is unsafe:

```sh
npm run preflight
```

---

## Option A — Vercel, demo only (no backend)

The fastest way to put a shareable link in front of a prospect. The marketing
site and the interactive demo are statically rendered, and the demo runs in the
visitor's browser, so there is no database, no Firebase project and no
credentials to manage.

Push the branch and let Vercel build it, or deploy directly:

```sh
npx vercel
```

`vercel.json` in the repository root already sets `SANGOPASS_DEMO=true` for
both the build and the runtime, so there is nothing to configure in the
dashboard.

That is the whole configuration. `APP_URL` is optional here — without it the
server falls back to the request origin. The boot guard permits ephemeral
hosting because nothing is stored, and the sign-in screens render a notice
saying accounts are switched off on a showcase deployment, pointing at `/demo`.

Every visitor gets their own private sample estate in their own browser
session. Nothing they type reaches a server, and no two visitors can see each
other's changes. **Reset data** in the demo bar starts the world over.

Send the prospect `https://your-deployment.vercel.app/demo`.

Preview deployments are protected by default. To hand the link to someone
without a Vercel account: **Settings -> Deployment Protection -> Vercel
Authentication -> Disabled**.

**This mode is for demonstrations only** — real customers need Option B or C.
Delete `vercel.json` before going live; `npm run preflight` warns while it is
in place.

---

## Option B — Vercel + Firebase

### 1. Firebase

Follow [FIREBASE.md](FIREBASE.md) to create the project, enable Firestore in
Native mode and Email/Password sign-in, generate a service account, and deploy
the rules and indexes:

```sh
firebase deploy --only firestore:rules,firestore:indexes
```

Wait for the index builds to finish. Queries fail with a console link until
they do.

### 2. Environment variables

In the Vercel project, **Settings → Environment Variables**, for Production
(and Preview if you use it):

| Variable | Value |
| --- | --- |
| `SANGOPASS_BACKEND` | `firebase` |
| `APP_URL` | your public HTTPS origin, no trailing slash |
| `FIREBASE_PROJECT_ID` | from the service-account JSON |
| `FIREBASE_CLIENT_EMAIL` | from the service-account JSON |
| `FIREBASE_PRIVATE_KEY` | the whole key on one line, keeping the literal `\n` |
| `FIREBASE_API_KEY` | Project settings → General → Web API Key |
| `RESEND_API_KEY` | for enrolment, guest-pass and recovery email |
| `EMAIL_FROM` | e.g. `SangoPass <welcome@yourdomain.co.za>` |
| `PAYFAST_MODE` | `sandbox` until your merchant account is tested |
| `PAYFAST_MERCHANT_ID` / `_KEY` / `_PASSPHRASE` | from PayFast |

`APP_URL` must match the domain users actually visit. It sets the accepted
request origin for every mutation, the session cookie's Secure flag, and every
absolute link in email and payment callbacks. Get it wrong and sign-in works
but nothing can be saved.

### 3. Deploy

```sh
npx vercel --prod
```

Then verify:

```sh
curl -s https://your-domain.example/api/health
# {"ok":true,"backend":"firebase"}
```

### 4. Scheduled maintenance

Vercel Cron cannot run `npm run maintenance` directly. Either run it from any
machine with the same environment (it talks to the same Firestore project):

```sh
npm run maintenance
```

…on a daily cron, or add a protected route that calls the same functions and
point Vercel Cron at it. Without it, nothing sweeps expired sessions or sends
renewal reminders, and manual monthly billing lapses silently.

---

## Option C — One server with a persistent disk

Any VM with Docker. Node 24 if you run it directly.

```sh
cp .env.example .env      # set APP_URL to your public HTTPS origin
npm run preflight
docker compose up --build -d
```

Compose binds port 3000 on loopback and keeps the database in the
`sangopass-data` volume. Put a reverse proxy in front of it:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;   # required: sets the cookie Secure flag
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  # required: per-IP rate limits
}
```

Both forwarded headers matter. `X-Forwarded-Proto` is how the app knows the
browser arrived over TLS; `X-Forwarded-For` is the per-caller rate-limit
bucket, and without it every caller shares one bucket.

Daily cron:

```cron
0 3 * * *  cd /srv/sangopass && npm run maintenance >> /var/log/sangopass-maintenance.log 2>&1
0 4 * * *  cd /srv/sangopass && npm run backup      >> /var/log/sangopass-backup.log 2>&1
```

Copy backups off the host and test a restore. To restore: stop the app, replace
the database from a verified backup, preserve file permissions, start. Never
copy a live WAL-mode file without the backup API.

---

## Go-live checklist

**Before the first real customer**

- [ ] `npm run preflight` exits 0 against production credentials
- [ ] `curl https://…/api/health` returns `{"ok":true}`
- [ ] A registration, an enrolment and a guest visit work end to end on the
      real domain, including the password confirmation on the guest request
- [ ] A guard or manager account can scan a pass and check a guest in; a
      resident cannot
- [ ] A resident can log an issue at each urgency, and an urgent one raises the
      amber banner on the manager's Maintenance screen
- [ ] The enrolment and guest-pass emails arrive, and their links open on the
      production domain
- [ ] A password reset arrives and revokes the old session
- [ ] Camera scanning works on a real phone (needs HTTPS)
- [ ] Firestore rules and indexes deployed; index builds finished
- [ ] Maintenance is scheduled and has run once
- [ ] Backups are scheduled and one restore has been tested
- [ ] `npm run admin -- tenants` works from wherever support will run it

**Before taking money**

- [ ] PayFast merchant account approved, sandbox transaction completed
- [ ] `notify_url` reachable from the public internet — PayFast must reach
      `https://…/api/billing/notify`
- [ ] A sandbox payment records an invoice and does **not** grant paid access
- [ ] Switch `PAYFAST_MODE=live`, take one real payment, confirm it extends
      `paidUntil`
- [ ] Renewal reminders confirmed by moving a test organisation's `paidUntil`
      to within seven days and running maintenance

**Known gaps, decided not blocking**

- The demo at `/demo` is not a product surface a customer signs into; it is a
  showcase. Removing it from a customer deployment is a one-line route delete.
- No owner/manager split and no two-factor authentication: every manager can
  invite, remove and start a checkout.
- Registration does not verify the email address.
- The operator console is the `npm run admin` CLI, not a screen.
- `/dashboard/*` and `/demo` remain browser-only sample data. They grant no
  live access, but they describe a platform-admin capability that does not
  exist. Consider removing them before a public launch.

---

## Rolling back

Vercel keeps previous deployments: promote the last good one from the
dashboard. Firestore data is not rolled back with it, and schema migrations
are forward-only — a rollback across a migration needs a restored backup.

For the Docker path, redeploy the previous image tag and restore the database
from the backup taken before the upgrade.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Server exits at boot with a config error | `npm run preflight` prints the same list with fixes |
| Sign-in works, nothing saves | `APP_URL` does not match the browser's origin; the mutation origin check rejects it |
| Session lost on every request | Cookie missing `Secure` behind TLS — set `X-Forwarded-Proto`, or `APP_URL` to `https://` |
| "Too many attempts" for everyone | `X-Forwarded-For` is not set, so all callers share one bucket |
| Firestore query fails with a console link | A composite index is still building; open the link and wait |
| PayFast never confirms | `notify_url` is not publicly reachable, or `APP_URL` is not HTTPS |
| Guest pass email never arrives | `RESEND_API_KEY` / `EMAIL_FROM` unset, or the sender domain is not verified |
