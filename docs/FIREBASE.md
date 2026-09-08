# Running SangoPass on Firebase

SangoPass has two interchangeable backends behind one interface:

| | `sqlite` (default) | `firebase` |
| --- | --- | --- |
| Data | Node 24 built-in SQLite, one file | Cloud Firestore |
| Credentials | salted scrypt on the user record | Firebase Authentication |
| Deployment | one server with a persistent disk | any host, including serverless |
| Horizontal scaling | no | yes |

Nothing about the application, the API or the user interface changes between
them. `SANGOPASS_BACKEND` selects one; with no setting, Firebase is used when
its credentials are present and SQLite otherwise.

The code lives in `lib/server/store/` (data) and `lib/server/identity/`
(credentials). Everything above those two folders is backend-neutral.

---

## What Firebase owns, and what SangoPass keeps

**Firebase Authentication owns the credential**: creating accounts, hashing and
verifying passwords, rotating them, and deleting them. The account's Firebase
uid is the same string as its SangoPass user id, so the two never drift.

**SangoPass keeps its own sessions**, in the `sessions` collection, exactly as
it does on SQLite. The cookie stays an opaque 64-hex token whose SHA-256 is
stored server-side. This is deliberate:

- one code path for both backends, so sessions cannot behave differently in
  production than they do in the test suite;
- revocation is immediate — deleting the row ends the session, where a Firebase
  ID token stays valid until it expires;
- no token verification round trip on every request.

Password verification is the one credential operation the Admin SDK does not
expose, so it goes through the Identity Toolkit REST endpoint
(`accounts:signInWithPassword`) using the project's Web API key. Every other
credential operation is Admin-side.

---

## Setup

### 1. Create the project

1. <https://console.firebase.google.com> → **Add project**.
2. **Build → Firestore Database → Create database**, in **Native mode**.
   Choose a region close to your users; `europe-west1` or `europe-west4` are the
   usual choices for South African traffic until `africa-south1` is available
   for your project.
3. **Build → Authentication → Get started → Email/Password → Enable**.
   Leave "Email link (passwordless sign-in)" off; SangoPass sends its own
   branded invitation and recovery emails through Resend.

### 2. Create a service account

**Project settings → Service accounts → Generate new private key**. This
downloads a JSON file. From it you need three values:

| JSON field | Environment variable |
| --- | --- |
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` |

Paste the private key as a single line, keeping the literal `\n` sequences
exactly as they appear in the JSON. The application converts them back.

Then **Project settings → General → Web API Key** → `FIREBASE_API_KEY`.

> The service-account key grants full administrative access to the project.
> Keep it out of Git (`.env` is already ignored), store it in your host's
> secret manager, and rotate it if it is ever exposed.

### 3. Configure the environment

```sh
SANGOPASS_BACKEND=firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
FIREBASE_API_KEY=AIza...
APP_URL=https://your-domain.example
```

On Google Cloud Run or Cloud Functions you can omit the client email and
private key and let `GOOGLE_APPLICATION_CREDENTIALS` / the attached service
account supply them.

### 4. Deploy the rules and indexes

```sh
npm install -g firebase-tools
firebase login
firebase use --add            # select the project you created
firebase deploy --only firestore:rules,firestore:indexes
```

`firestore.rules` denies every direct client read and write. That is correct,
not a placeholder: SangoPass reaches Firestore only through the Admin SDK on
its own server, and Admin credentials bypass rules. Every request has to pass
the organisation membership check in `lib/server/workspace.ts` first. If you
later add a client that talks to Firestore directly, add a narrow `match` block
for that one collection rather than relaxing the default deny.

`firestore.indexes.json` contains every composite index the application's
queries need. Index builds take a few minutes on a new project; queries fail
with a console link until they finish.

### 5. Verify

```sh
npm run build
npm start
npm run admin -- tenants     # prints "Backend: firebase" and an empty list
```

Register an organisation at `/register`, then check the Firebase console:
Authentication shows the new user, Firestore shows `users`, `organisations` and
`memberships` documents sharing one id.

---

## Local development without a Firebase account

The emulator suite runs offline against a fake project id — no account, no
billing, no network:

```sh
npm install -g firebase-tools
firebase emulators:start --only auth,firestore --project demo-sangopass
```

Then in `.env`:

```sh
SANGOPASS_BACKEND=firebase
FIREBASE_PROJECT_ID=demo-sangopass
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

Credentials are not needed in this mode. The emulator requires a Java runtime.

The automated test suite runs against SQLite and needs none of this.

---

## Data model

Firestore has no joins, so records carry the display fields they need. Both
backends store the same shape; the SQLite schema was rebuilt to match in
migration v3.

| Collection | Document id | Notes |
| --- | --- | --- |
| `users` | Firebase uid | `password` is empty on this backend |
| `organisations` | uuid | plan, trial and paid horizon |
| `memberships` | `<userId>__<orgId>` | carries `orgName`, `memberName`, `userEmail`, `usernameKey` |
| `properties` | uuid | `loginCode` is the tenant sign-in code; also holds the three visitor limits |
| `units` | uuid | carries `orgId`, `residentId`, `residentName` |
| `invitations` | uuid | `hash` is the SHA-256 of the setup token |
| `visitors` | uuid | carries `propertyName`, `hostName`, `unitLabel`; `unitId` and `active` drive the per-unit limits, `visitType`/`endDate`/`nights` the visit window, `idType`/`idNumber` the visitor's document, `visitorEmail` their own copy of the pass |
| `reports` | uuid | carries `authorName` and `unitLabel`; `urgencyRank` is the numeric sort key the manager queue orders on |
| `invoices` | uuid | PayFast reference in `paymentId` |
| `contractors` | uuid | the maintenance contacts directory |
| `audit` | uuid | one row per mutation |
| `sessions` | SHA-256 of the cookie token | |
| `resetTokens` | SHA-256 of the reset token | |
| `rateLimits` | hashed bucket key | swept by `npm run maintenance` |
| `reservations` | the uniqueness key itself | see below |

### Uniqueness

Firestore has no unique indexes, so every uniqueness rule is a document in
`reservations` whose id **is** the key, created inside the same transaction as
the record it protects. A second claim fails with `ALREADY_EXISTS`, which the
store surfaces as a 409. SQLite uses the identical mechanism so the two cannot
diverge.

```
userEmail:<email>
property:<orgId>:<lowercased name>
loginCode:<code>
unit:<propertyId>:<lowercased label>
unitResident:<unitId>
username:<propertyId>:<lowercased username>
visitorRef:<reference>       visitorToken:<token>
paymentId:<payfast reference>
```

### Transactions

Firestore requires every read in a transaction to happen before the first
write. The SQLite backend enforces the same rule and throws if it is broken, so
a transaction that works in tests works in production.

---

## Operations

```sh
npm run admin -- tenants                       # every organisation and its state
npm run admin -- export <orgId> dump.json      # full tenant export
npm run admin -- extend <orgId> 30             # move the trial or paid horizon
npm run admin -- suspend <orgId> --confirm     # end access and all sessions
npm run admin -- delete <orgId> --confirm      # erase a tenant (export first)
npm run admin -- invoices <orgId>
npm run admin -- invoice-paid <id> <ref> --confirm
```

The admin tool talks to whichever backend the environment selects, so with
Firebase credentials it runs from an operator workstation.

Schedule maintenance daily — it sweeps elapsed sessions, reset tokens and
rate-limit windows, prunes the audit trail past `AUDIT_RETENTION_DAYS`, and
emails managers whose paid month or trial ends within `RENEWAL_REMINDER_DAYS`:

```sh
npm run maintenance
```

Firestore backups are configured in the Google Cloud console (Firestore →
Backups) or with `gcloud firestore backups schedules create`. `npm run backup`
is for the SQLite backend only.

---

## Migrating existing SQLite data

There is no automated copy yet. The shapes are identical after migration v3, so
the path is: run the app once on SQLite to apply v3, `npm run admin -- export`
each organisation, then write those documents into Firestore with the
`reservations` entries listed above. Passwords cannot be carried across —
scrypt digests are not importable into Firebase Authentication in this format —
so residents and managers need a password reset, which the recovery flow
handles.

If you have no production data yet, start on Firebase and skip this entirely.
