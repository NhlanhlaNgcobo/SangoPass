# SangoPass

A South African residential and student-accommodation SaaS for properties, people, visitor access and maintenance. Forest green, ivory and lime branding, an original doorway/check logo, and generated imagery reflecting South Africa's diverse communities. Asset sources and image prompts: [brand guide](docs/BRAND.md).

## Run locally

Use Node.js 24. On Windows PowerShell use npm.cmd if npm.ps1 is blocked.

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and choose **Start your free trial**. Create your organisation, add a property and units, then invite residents or security. No cloud project is needed: records are saved to data/sangopass.sqlite (ignored by Git). Never commit customer databases or credentials.

- /register creates a real account and organisation with a 14-day Starter trial.
- /login signs in to the live /workspace using a server session.
- Managers manage properties, units, invitations, visitor movements, rent status, maintenance, maintenance contacts, tenant **Documents**, resident **Requests**, bulk resident **import**, **Regular passes** for the people who work there, **Announcements** to their buildings, the property's own books under **Money**, brand colours and billing.
- **Reception** is the front desk of one property: every manager screen for that building — properties, people, visitor passes, maintenance, contacts, documents, requests, announcements and brand — and never **Money** or **Billing**. It cannot create or remove manager and reception accounts either, because a role that can mint managers is a manager. A reception account uses one of the plan's sign-ins, for the same reason: it does nearly everything a manager does, so a free one would make the seat limit a formality.
- Managers enrol residents by email and vacant unit. Apartment residents receive a generated unit-linked username; student accommodation requires their student number, preserved exactly (including leading zeroes).
- The welcome email provides the username, property/unit and a one-use password-setup link. Tenant sign-in is at /tenant/login. The emailed login link pre-fills the property code so matching student numbers at different properties remain separate.
- Residents activate their account by setting their own password, then request and cancel guest visits, submit reports, and give notice that they are moving out or want a different unit or property. Their **Notice board** carries whatever the office has announced to them. Existing account holders confirm their existing password instead of having it overwritten.
- Security joins with an assigned property, scans QR passes, checks visitors in/out, signs the property’s regular workers in and out, submits reports, and reads the announcements written for the gate.
- /pass/[token] is a private guest pass with a printable QR code and a gate code for a guest with no smartphone, emailed to the resident and to the visitor when an address is given, and texted to the visitor when SMS is configured. Its purpose is to let the invited visitor confirm they are on the system before they travel. It omits the visitor phone number, all host account details, and all but the last four characters of the identity document.
- /demo is a full interactive demonstration: the real workspace running against a sample estate held in the visitor's browser. Pick a role, switch between them, and the data follows. Nothing is stored, nothing is sent, and no account is created. /dashboard now redirects there.

All visit times use Africa/Johannesburg (SAST). Camera scanning needs HTTPS or localhost. QR-image upload, gate-code entry, and search by reference, visitor name or identity number are also available. Rent status is a manually maintained register: this app does not collect residents' rent. The paid flag is now tied to the month it was set in, so it does not carry over into the next one, and marking a unit paid records the receipt in **Money**.

## Guest visits

**Only a resident may request a guest visit.** Hosting a guest is a resident's right and a resident's responsibility; managers set the limits for each property, and security records arrivals. Neither books a guest.

Every request names the visitor's own identity document, because that is what security checks at the gate:

- An **apartment** requires a South African ID number or a passport number. The ID number's Luhn check digit and date-of-birth prefix are verified, so a transposed digit is caught at entry rather than at the gate.
- A **student residence** may also accept a student number, since most guests there are students. A guest who is not a student still gives an ID or a passport.

The number is normalised (spaces and hyphens removed, upper-cased) and stored whole for the gate, but only its last four characters ever leave the server: the resident's list, the pass page and every API response carry a masked value.

**Managers and security can search by the identity number.** At the gate the card in the visitor's hand is often the only thing that is certainly right — the name was spelt differently on the request, and nobody can find the reference. Typing the number into the visitor search box finds the pass, in the same box already used for names, references and gate codes. Because the full number never reaches the browser, the match is made on the last four characters the mask leaves readable: the whole number off the card and those four digits alone both find the same pass, and typing fewer than four matches nothing rather than flooding the register. Four characters narrow a register rather than settle it, so the search returns a list and the name, host and unit beside each row are what pick the person — security still checks the document itself before admitting anyone.

The resident chooses one of three visit types:

| Type               | Window                                      | Counts against                             |
| ------------------ | ------------------------------------------- | ------------------------------------------ |
| Day visit          | Arrival and departure on one date           | active guest passes                        |
| Sleepover          | One night; departure falls on the next date | active passes and the monthly night budget |
| Extended sleepover | Two or more consecutive nights              | active passes and the monthly night budget |

A sleepover's check-in window runs from the arrival time on the first date to the departure time on the last, so a guest can be admitted on any night of the stay.

**Every request is confirmed with the resident's own password.** The session cookie proves who signed in; it does not prove who is holding the phone. A guest enters the building in the resident's name, so the request re-authenticates before anything is written. Attempts are throttled per account.

**The pass goes to both the resident and the visitor.** The resident always receives it: they are the reliable delivery address, and plenty of guests do not carry a smartphone. If the resident also gives the visitor's email address — optional — the visitor receives their own copy, so they can confirm they are on the system before travelling. Without email configured the pass is still created and the resident copies the link by hand.

**Every pass carries a gate code for a guest with no smartphone.** Alongside the QR, each pass gets its own eight-character code — `4XKD-9PWH` — texted to the visitor's phone, printed on the pass, and shown to the resident so they can read it out if the message never arrived. Security types it into **Gate code** beside the scanner, or into the search box; the workspace confirms which pass it belongs to. Typing is forgiving: case, spaces and the hyphen do not matter, and because the alphabet contains no I, L, O or U, an `O` read as a zero or an `I` read as a one lands on the character that was actually issued.

The gate code is deliberately **not** the pass reference. The reference is printed in every register listing and is what managers and security already search by, so a visitor reciting it would prove nothing. The code goes only to the people holding the pass.

Codes verify; they do not admit. Security confirms the code, then still reads the status, the arrival window and the identity document before checking anyone in — the same as after a scan. Passes created before this feature have no code and are unaffected: their QR and reference work as they always did.

**Text messages are optional.** Without `BULKSMS_TOKEN_ID` and `BULKSMS_TOKEN_SECRET` the pass and its code are still created, and the resident is told to read the code to their guest. The provider is [BulkSMS](https://www.bulksms.com/); everything provider-specific is one function in `lib/server/sms.ts`, so swapping to SMSPortal, Clickatell or an aggregator is that function and a set of environment variables. Numbers are normalised to E.164 against South Africa, so `082 441 9087`, `+27 82 441 9087` and `0027824419087` are one number, and a number that cannot be texted says so rather than failing quietly. No SMS credentials were available during implementation: the request follows BulkSMS's published JSON API and has not been exercised against a live account.

**Only the guard or reception scans the QR code.** Check-in and check-out are recorded by a security or manager account at the property. A resident holds a copy of the pass so a guest with no phone still has something to present, and can cancel a pass they created, but never records the arrival themselves. The arrival window and the one-way status transitions apply to everyone equally.

**The property manager sets three limits per property**, from Properties → Visitor limits:

- **Sleepover nights per unit each month** (default 8). A stay is counted against the month it begins in, so one booking is never split across two budgets. Set 0 to disallow sleepovers.
- **Longest single sleepover** (default 3 nights).
- **Guest passes a unit may hold at once** (default 2). Upcoming and checked-in passes occupy a slot; checking out or cancelling frees it.

Limits are enforced per unit, not per person, and enforced on the server. The resident sees where their unit stands for the current month before filling in the form.

## Editing and archiving

Properties and units can be corrected after they are created, and taken out of use when they are no longer real — but never deleted, because both are named in the books, the visitor register and the audit trail, and all three have to keep reading correctly.

**Edit** on a property changes its name, address and type. Its login code does not move, because residents sign in with it, and its visitor limits are left as the manager set them. Changing the type changes what future residents are enrolled with and which identity documents their guests may present; residents already enrolled keep the usernames they have.

**Edit** on a unit changes its label and its rent. Rent changes every year, and until this existed the only route was to create a second unit and abandon the first — which left the abandoned one showing as vacant income the property was failing to earn, forever. Rent already received keeps the amount it was received at, so past months do not move. A rename follows through to any pass not yet used, so a guard is sent to the door that exists now; closed passes keep the label the unit had at the time.

**Archive** takes a unit or a whole property out of use. An archived unit stops being offered when enrolling a resident, stops counting as vacancy, and stops using up a unit on your plan — a manager who has closed a wing should not be paying for it. An archived property stops appearing anywhere a manager picks one, and its empty units are archived with it, so nobody has to file away twenty units by hand.

Two things are refused rather than done quietly: **a unit somebody lives in cannot be archived**, and **a property with residents still in it cannot be archived**. Those are tenancy questions, and they are answered in People by removing the resident first. Everything archived can be restored, and restoring a property brings its units back with it.

Archived records stay in the read model so a visitor row or a report can still name the building it happened at; the interface hides them everywhere a manager chooses something, and the units register has a **Show archived** toggle.

## Maintenance and complaints

Residents log maintenance issues, security concerns, noise and anything else from **Reports**, choosing how urgent it is: **Emergency**, **Urgent**, **Normal** or **Low**. Each level carries a plain description of what it means, so "emergency" keeps meaning emergency.

The property manager's **Maintenance** screen shows every report in the organisation, worked most-urgent-first and newest within a level, carrying the resident's name and unit so it is clear which door to knock on. An open emergency or urgent issue raises a banner at the top of the screen — amber for urgent, brick for an emergency — with a coloured stripe down each row so the queue reads while scrolling. Managers re-triage anything mis-rated: residents say how bad it feels, the manager decides what it is.

Ordering is by a stored numeric rank, not by string, so one query sorts identically on SQLite and Firestore.

**Maintenance contacts** is its own screen in the manager's sidebar: a directory of in-house staff and outside contractors with name, trade, company, phone, email and a note, searchable by any of them. Phone numbers and email addresses are tappable, because the next thing a manager does after finding the plumber is call the plumber. It is a phone list and nothing more — no contact is an account, none of them can sign in, and none of them grants any access.

## Your company on your dashboards

**Brand** carries three things, all saved for the whole organisation at once: the company **name**, its **logo**, and its two **colours**. Everyone in the organisation sees them — residents, security and the reception desk get the same name, logo and colours as the manager who chose them, without setting anything themselves.

The name is denormalised onto every membership so the account switcher needs no join, so renaming rewrites those copies too; otherwise a rename would be invisible to everyone except the person who made it. The logo replaces the SangoPass mark at the top of every dashboard in the organisation, and is accepted as PNG, JPEG or WebP under 2 MB — SVG is refused here for the same reason it is refused for documents, and PDF because this one has to be something a browser will draw. Its URL carries the upload time, so replacing a logo is visible immediately rather than whenever each member's cache happens to expire, and the old file is deleted once the record points at the new one.

Colours are checked against WCAG AA before they can be saved: a pair that would leave text hard to read is refused with the reason, rather than allowed and regretted.

## Documents and occupancy history

**Every stay is written down once and closed rather than deleted.** A membership says who is in A-101 today and is removed the day they leave, which is the right shape for access control and the wrong one for a filing cabinet: a lease outlives the tenancy it covers, and a deposit argument starts months after the keys came back. So a **tenancy** record opens when a resident takes a unit and closes when they go, keeping the name, unit, property, email, username and both dates. That is what makes the register able to answer "who was in A-101 before this one", which nothing in the product could do before.

**Documents** is a folder per tenancy — current and past — holding the signed lease, inspections, notices and proof of payment, alongside the guest passes that resident generated while they lived there. The passes are not stored files: a pass is data and its QR is drawn from the token, so they appear in the folder without anything having been uploaded. Search takes a resident's name, their surname, or a unit, and returns every occupant of it, previous and current. A folder outlives the account: removing a resident closes their stay and leaves their papers exactly where they were.

Files themselves never go in the record store, which holds scalars and caps a document far below the size of a scanned lease. They go through a storage port (`lib/server/documents`) with two implementations, chosen by the backend: a directory beside the SQLite database for a server with a persistent disk, and Firebase Storage for a serverless deployment. Uploads accept PDF, JPEG, PNG and WebP up to 15 MB. **SVG is refused on purpose** — it is an image everywhere else and a script here, and it would run in the origin serving it against a manager's own session.

The bucket and the disk are both closed to the outside world. `storage.rules` is a total denial for the same reason `firestore.rules` is, no signed URL is ever issued, and the only way to a file is `/api/documents/[id]`, which checks organisation membership first and then streams the bytes with `nosniff`, a sandbox CSP and `no-store`. Managers see their organisation's documents, reception sees its own building's, a resident sees their own, and security sees none — nothing at the gate is answered by a lease.

## Resident notices

**A resident tells the office what is about to change, before it changes.** Moving out, wanting a different unit, or a different property. It lands in **Requests**, where a manager or reception acknowledges, approves, declines or completes it and can leave a note the resident sees.

Deliberately not a maintenance report. A report says something is broken and someone should come and fix it; a notice says nothing is broken and a decision is needed. Filed in one queue, the notice that needs a month's warning would sit under the taps that need a plumber.

Only the resident whose life is changing may raise one — "your tenant gave notice" is exactly the claim a register should not let anyone make on someone's behalf — and only they may withdraw it, while it is still unanswered. Once the office has answered, it stays answered: the record should say whether a resident withdrew or an office declined, because those are not the same thing.

## Regular passes: the people who work here

**A guest pass answers "may this person come on Saturday". A regular pass answers "may this person come every weekday until March"** — the cleaner, the gardening contractor, the roofer on a four-week job, a resident's domestic worker. Through the guest register, every one of them would have to be booked afresh each week, with a new gate code every time, burning the unit's two guest slots to do it.

**Issued by the office only.** A resident hosts guests; who works on the property is the office's decision, and a standing key to the gate is not something a tenancy should be able to mint. A resident who wants one for their domestic worker asks the office, and the office issues it against their unit. Reception issues for the building it sits in.

Each pass names **who they are here for** — property staff, an outside contractor, or a household worker — and that choice decides the shape: staff and contractors work across the building and carry no unit, a household worker works at one door and carries it. Then the week they may come (seven toggles, Monday first), the hours they may arrive, and a start and end date.

**The end date is required and capped at a year.** A standing authorisation with no end is a key nobody ever takes back. Where a pass stands — in force, starts later, expired, revoked — is worked out from those dates on every read rather than stored, for the reason an announcement's expiry is: a stored flag is right the day it is written and wrong the morning after.

**The gate records every arrival and departure**, not just the fact of the pass. One row per arrival — in at 07:04, out at 17:12, and who recorded each — which is what lets the register answer _who is on site right now_ and _was the cleaner here on the day the flat was emptied_. Without it a regular pass is a laminated card the system knows nothing about. **On site now** is the first thing the screen shows, and somebody still signed in from an earlier day is called out, so the register stops quietly saying they never went home.

Check-in is refused, with the reason, when: the pass is revoked, has not started, has expired, today is not one of its days, or the clock is outside its hours. Check-out is never refused on those grounds — people stay late and people forget, and a guard who cannot close yesterday's arrival would have to leave the register wrong. Somebody revoked while they are still inside can always be signed out.

**One scanner, one gate-code box, either kind of pass.** Regular passes claim their reference, token and gate code in the same uniqueness namespaces guest passes use, so no code can ever belong to two passes and the guard never has to know which list to look in. Scanning a worker's QR or typing their code takes the guard straight to Regular passes with the person named. `/pass/[token]` serves a worker's own printable pass — the QR, the gate code, the days, the hours, and all but the last four characters of the identity document.

**Who sees them.** The office sees its own; security sees its gate's, because a guard admitting the same cleaner every morning is exactly who this is for; a resident sees only the household worker cleared for their own door, and none of the gate register — a neighbour's movements are not a neighbour's reading.

## Enrolling a building at once

**Upload the roll the office already keeps.** People → _Enrol a whole building_ takes a CSV of up to 100 residents, each with an email address and the unit they are moving into, and sends every welcome email in one pass. Enrolling a 150-unit Growth customer was 150 separate dialogs before this, which is the point at which a manager stops setting the product up.

**Only Email and Unit are required**, matched case-insensitively and in any order. A student residence also needs _Student number_. The columns an office keeps for itself — names, phone numbers, lease dates — are ignored rather than refused, because making a manager strip their own spreadsheet before they can use it is a reason not to use it. A misspelt heading is still caught, since the columns that are required have to be found.

**Download a blank roll** and it arrives with that property's vacant units already listed, so the labels match what the register calls them. Values beginning `=`, `+`, `-` or `@` are prefixed on the way out, the same rule the money spreadsheet applies, so a unit label cannot execute as a formula when the file is opened.

**The whole file is checked before any of it is written**, and refused as a whole if any line fails — with every problem named by its line number as the spreadsheet shows it, not just the first. That is the only shape that makes the obvious second attempt safe: a manager who does not know which forty of their hundred rows landed has to reconcile by hand, and re-uploading the corrected file would double-enrol everyone who worked the first time. Checked per row: the address is real, not repeated in the file, and not already in the organisation; the unit exists at that property, is not archived, is not lived in, has no pending invitation, and is not claimed twice in the same file; and at a student residence the number is valid, unique in the file, and not already enrolled — leading zeroes preserved exactly.

The three lists every row is checked against are read **once**, not per row, so a hundred residents costs three queries rather than three hundred. Welcome emails go out five at a time after the invitations are committed: sequentially, a hundred round trips is long enough for a manager to conclude it has hung and press the button again; all at once is how a sender earns a rate limit. Delivery never fails the enrolment, and the count that reached an inbox is reported separately from the count enrolled, because the ones that did not land are retried from **Pending invitations**.

Importing is enrolment, so it waits for renewal exactly as adding one resident by hand does. A file is not a way around the trial gate.

## Announcements

**The office tells the building something, and everyone has it.** A water outage, the AGM date, a gate that has failed. It is written once in **Announcements** and lands on the dashboards of everyone it is addressed to, under **Notice board** on their side.

The opposite direction to a resident notice, and its own screen for that reason. A notice is one resident's business, addressed to the office, and it ends in a decision about them. An announcement is the office's business, addressed to everybody, and nobody answers it — the water is off on Tuesday whether or not you reply. In one queue, the decision somebody is waiting on would sit under a fortnight of reminders about the AGM.

**Three things are chosen when it is written**, and the first two decide who ever sees it:

- **Which building**, or the whole organisation. Reception announces to the block it sits in and nowhere else — an estate it does not work at is not its to address, and the whole company is a manager's to speak for.
- **Who it is for**: residents, security, or everyone. "The gate motor is being replaced on Thursday, admit the contractor" is an instruction to a guard and noise to everybody else; "the water is off on Tuesday" is for the whole building. Without being able to say which, a manager writes only the ones that are safe to send to everybody.
- **How loudly**: routine, important or urgent. Three rather than ten, so that a manager choosing among them chooses consistently and "urgent" keeps meaning urgent. An urgent announcement still showing raises a banner on every dashboard it reaches, including the office's own — a resident opens the workspace to book a guest, not to read a board, so the board comes to them.

**It comes down on its own.** An optional end date is the last day it shows; after that it drops off every dashboard and stays on the office's board marked _Expired_. Whether it is still up is worked out from that date every time it is read, never stored as a flag — a stored flag is right on the day it is written and wrong the morning after, with nothing there to correct it, which is exactly the quiet wrongness that made a rent flag without its month useless. An end date already in the past is refused rather than published into silence.

**Nothing is deleted.** The office takes an announcement down and it stops showing, while staying on the board so the record still says it went up. What it _says_ can be corrected — a date that moved, a level that was wrong — and the correction is stamped and shown, because someone who read "Tuesday" yesterday is owed the fact that it no longer says Tuesday. What it says can change; **who it went to cannot**. Audience and building are what put it on particular dashboards, and redirecting it quietly would leave the people who read it holding an announcement that no longer exists for them, and the people it moved to having missed it entirely.

**Emailing is per announcement, and optional.** Ticking _Email it as well_ sends it to everyone it is addressed to, with the author as the visible recipient and everybody else blind copied, so no resident's address reaches another resident and the author gets a copy to check. Addresses go out in batches of fifty, so a 300-unit estate is a handful of messages rather than three hundred HTTP requests inside one click. Delivery never fails the announcement: it is on the board either way, and the screen reports separately how many inboxes it reached, because that is the half a manager may have to chase. Most announcements belong on the dashboard and nowhere else — a product that mails the whole building every time a date is corrected is one whose managers stop writing announcements.

**Not gated on billing**, for the same reason the books are not. The trial gate stops an unpaid organisation growing; withholding "the water is off from noon" would not prompt a payment, it would leave a building that does not know.

## The demo

`/demo` runs the **real workspace component** against an in-browser sample
organisation - two properties, six residents, a week of arrivals, a maintenance
queue, a contacts directory and a notice board. It is not a mock-up:
`lib/demo/engine.ts` imports the same validation, visitor limits, visit-window,
urgency and announcement rules the server runs, so the demo cannot promise
behaviour the product does not have. What is simulated is persistence and
identity, nothing else.

A prospect can follow one guest end to end: sign in as the resident, request a
visit (confirming with the sample password `sangopass`), switch to Security and
check the guest in at the gate, then switch to the manager and watch the
maintenance queue and visitor limits. Role scoping is derived by the same rules
as the server, so switching roles demonstrates real isolation - the notice
board makes it visible in one click, since the guard's board carries the broken
boom the residents never see and not the AGM they do. **Reset data** puts the
world back.

Set `SANGOPASS_DEMO=true` for a showcase deployment: the boot guard then allows
ephemeral hosting (there is nothing to store), `APP_URL` becomes optional, and
the sign-in screens say accounts are switched off and point at the demo. The
committed `vercel.json` turns this on, so the branch deploys to Vercel as a
demo with no configuration. Delete it before deploying for real customers;
`npm run preflight` warns while it is in place.

## Backends

Storage and credentials sit behind one interface, selected by `SANGOPASS_BACKEND`.

|                    | `sqlite` (default)                | `firebase`                     |
| ------------------ | --------------------------------- | ------------------------------ |
| Data               | Node 24 built-in SQLite, one file | Cloud Firestore                |
| Credentials        | salted scrypt on the user record  | Firebase Authentication        |
| Deployment         | one server with a persistent disk | any host, including serverless |
| Horizontal scaling | no                                | yes                            |

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

The v3 migration rebuilds a v1 or v2 database on the current shape. It preserves existing passwords, unit assignments, login codes, usernames and email sign-in, and backfills the denormalised fields from the old joins. The v5 migration adds report urgency with the numeric rank the manager queue sorts on, the maintenance contacts directory, and the optional visitor email address; existing reports become "normal", which is exactly what they were. The v7 migration adds the visitor gate code: no code is invented for a pass issued before it, exactly as no identity number was invented at v4, and those passes still work by QR and reference. The v8 migration adds the finance ledger and the month a unit rent flag belongs to; no month is claimed for a flag that was never period-aware, so a unit marked paid under the old schema reads as unpaid until it is marked again. The v9 migration adds archiving for properties and units, and everything that already exists is in use. The v10 migration adds occupancy history, the tenant document archive and the resident notice queue: all three are new tables, so nothing is altered and no column is backfilled, and whoever is living in a unit at the moment of the upgrade becomes that unit's current tenancy. Its start date is the upgrade itself rather than a guess — when they actually moved in was never recorded, and inventing a date would put a number on a lease dispute that nothing in the database supports — and no claim at all is made about who lived there before. The v11 migration adds the company logo; the columns default to empty, which reads as "no logo uploaded" and is exactly what every existing organisation has, so their dashboards keep the SangoPass mark until someone chooses otherwise. The v4 migration adds visit types, sleepover windows, visitor identity documents and the per-property limits: existing passes become day visits ending on the date they started, their guest slot is released if they are already closed, and their host's unit is derived from the membership. No identity number is invented for a pass taken before the upgrade — it reads as "not recorded". Existing student records without a stored student number still need re-enrolment with the student number; it cannot be inferred.

One account can belong to multiple organisations through invitations; switch between them in the workspace menu. Public signup creates a manager only, never a platform administrator. The platform administration screens under /dashboard remain explicitly labelled demo screens; there is no public route to cross-organisation production access.

Password recovery supports Resend when RESEND_API_KEY, EMAIL_FROM and APP_URL are configured. Reset links expire after 30 minutes, are single use, and revoke previous sessions and provider refresh tokens. Enrolment welcome emails are automatically submitted to Resend when configured. The manager sees not-configured, failed or sent-to-provider status and can resend a pending invitation. Resending rotates the setup token, invalidates its previous link and retains the username. Provider acceptance does not guarantee inbox delivery; no delivery webhook is configured. Without credentials, enrolments are saved visibly as unsent.

Every mutation writes an audit row, and managers can read their own organisation's trail at `GET /api/activity?org=<id>`. Rows older than `AUDIT_RETENTION_DAYS` are pruned by maintenance.

## Money

**Money** is the manager's own books, and has nothing to do with Billing — that is what the organisation pays SangoPass. This is what the property earns and what it costs to run, one month at a time, and only managers can see it: the read model never sends a line of it to a resident or a guard.

Every amount is stored as an integer number of cents. Rands appear only where a person types one or reads one.

**Rent is recorded once, not twice.** Marking a unit paid in Properties writes the receipt straight into the books, and unmarking takes it off again, so the rent register and the accounts cannot disagree. The paid flag now carries the month it refers to: a unit marked in September reads as unpaid in October, where before it stayed green forever and made "rent outstanding" meaningless the moment a month turned over.

**A vacant unit owes nothing.** It is excluded from rent expected and never counted as arrears — nobody owes rent on an empty flat. What it is instead is income the property is not earning, so it is reported on its own line: **Vacancy**, with the empty units named and priced, and **Rent if fully let** beside it. Removing a resident clears that unit's rent flag along with the tenancy, so the next tenant does not move in already marked paid for the month; the departing resident's receipt stays on the books, because that money really was received.

**Costs go in by hand**, under the five things a residential property actually spends money on — **utilities, staff, maintenance, security** and **other** (rates, insurance, levies) — each marked **fixed** (the same every month: wages, a guarding contract, insurance) or **variable** (a repair, a water bill, overtime). Six categories rather than forty, because a manager choosing from six categorises consistently. An entry can be filed against an earlier month, since catching up on last month is the ordinary case; a future month is refused, because an amount filed against next March is a typo every time.

The screen shows rent expected, collected and outstanding, total costs split fixed against variable, the net for the month, a breakdown by category, and the units still to pay — one click from marking any of them paid. Rent expected and outstanding are shown for the **month in progress only**: the rent register states how things stand today, not how they stood in a closed month, so measuring August against today's tenants and today's rents would produce a number that means nothing. Earlier months report what was actually recorded, and say so.

**Download spreadsheet** returns the month as CSV, which opens directly in Excel, Numbers and Google Sheets and can be handed to a bookkeeper or an accounting package with nothing in between. The file leads with the summary — that is the part forwarded to an owner or a body corporate — then arrears, then every line behind the totals. Costs are written negative so a manager's own `SUM` over the amount column lands on the same net figure as the summary. Cells beginning with `=`, `+`, `-` or `@` are prefixed so a description cannot execute as a formula when the file is opened, while genuine negative amounts stay numeric. Only a manager of that organisation can export it, and it is generated by the same code the screen reads.

Not gated on billing. The trial gate exists to stop an unpaid organisation growing — more properties, units, people, passes — and blocking a manager from recording money that has already moved would not prompt payment, it would corrupt their records.

## Pricing and PayFast

**Every published price includes 15% VAT.** Registration is compulsory above R1m of turnover in twelve months, which this business reaches at roughly seventy paying organisations, so the VAT inside the price was never the seller's to keep. What a customer sees is what they pay.

| Tier      | Price     | Units  | Managers | Gate-code texts | For                                                       |
| --------- | --------- | ------ | -------- | --------------- | --------------------------------------------------------- |
| Starter   | R699/mo   | 25     | 1        | 75/mo           | One block, one person running it                          |
| Growth    | R1,499/mo | 150    | 5        | 450/mo          | An agent with several buildings, or an estate with a team |
| Premium   | R2,899/mo | 300    | 10       | 900/mo          | A larger estate or a full agency                          |
| Portfolio | Quoted    | Custom | Custom   | Custom          | Above 300 units, or needing its own terms and an SLA      |

The rules that hold on every tier:

- **Units are counted while they are in use.** Archive a unit and it stops counting the same day — a manager who has closed a wing should not be paying for it, and should not be allowed for it either.
- **Properties, residents, security accounts and guest passes are unlimited.** Only units and manager sign-ins are capped, because those are what the price is measured in.
- **Gate-code texts carry an allowance of three per unit per month.** SMS is the only cost that scales with how hard a customer uses the product rather than with how many customers there are, so it is the one thing with a stated limit. Beyond it, R0.60 each, raised with the customer before it reaches an invoice. Nothing is blocked at the gate: a guest who needs a code gets one.
- **A 14-day Starter trial**, no card, nothing to cancel.
- **Paid access runs for a month and is renewed by hand.** Nothing recurs on a card.
- **When access lapses, nothing is taken away.** Every record stays readable and the gate keeps working; only new properties, units, enrolments and guest passes wait for renewal.
- **The organisation's data is exportable at any time**, in full.

Billing shows a manager exactly where they stand — units in use against the cap, manager seats used, and this month's gate-code texts against the allowance — so a cap is visible before it stops anyone. That usage panel counts passes created this month from the loaded register: it is a guide, not a meter, and no automatic overage billing exists.

Prices, caps, allowances and the wording of every rule have a single definition in `lib/shared/plans.ts`. Enforcement at creation time, the checkout guard, the pricing page and the billing screen all read that table, and a test asserts the advertised caps are the enforced ones.

Copy .env.example to .env and set your own PayFast merchant credentials. PAYFAST_MODE defaults to sandbox. Checkout also requires APP_URL to be a publicly reachable HTTPS origin so PayFast can deliver its notification to /api/billing/notify. The app uses one-off monthly payments with manual renewal, not automatic recurring subscriptions. The amount shown is the checkout total; no extra tax is added by the application.

Prices and limits are enforced on the server. A redirect from checkout never activates a plan. Notifications verify the signature, merchant, amount, payment reference, PayFast referrer domain and a server-to-server confirmation. Payments are idempotent, and anything the merchant can legitimately resend — including a duplicate reference — is acknowledged with 200 rather than retried into an error loop. Sandbox payments are labelled separately and never activate live paid entitlements. Only verified live payments extend paid access. When access expires, existing records and gate/report operations remain available; creation of properties, units, invitations and new visitor passes requires renewal.

`npm run maintenance` emails managers whose paid month or trial ends within `RENEWAL_REMINDER_DAYS`. Schedule it daily; without it, manual renewal lapses silently.

The integration follows [PayFast custom integration](https://developers.payfast.co.za/) and its [official notification implementation](https://github.com/Payfast/payfast-php-sdk/blob/master/lib/PaymentIntegrations/Notification.php). No merchant credentials are supplied, no live payment has been executed, and public callback delivery still needs a merchant sandbox acceptance test before launch.

## Operations

The operator console is a CLI. It runs against whichever backend the
environment selects, so with Firebase credentials it works from an operator
workstation rather than on the application host.

```sh
npm run admin -- tenants                       # every organisation and its state
npm run admin -- export <orgId> dump.json      # full tenant export
npm run admin -- extend <orgId> 30             # move the trial or paid horizon
npm run admin -- suspend <orgId> --confirm     # end access and all sessions
npm run admin -- delete <orgId> --confirm      # erase a tenant (export first)
npm run admin -- invoices <orgId>
npm run admin -- invoice-paid <id> <ref> --confirm
```

Managers can export their own organisation at `GET /api/tenancy/export?org=<id>`. Deletion erases every record scoped to the organisation, releases its uniqueness keys, and removes any account that belonged to no other organisation, including its credential in the identity backend.

Schedule maintenance daily. It sweeps elapsed sessions, reset tokens and rate-limit windows, prunes the audit trail, and sends renewal reminders:

```sh
npm run maintenance
```

## Deployment

**Full guide, both supported shapes, and the go-live checklist: [docs/DEPLOY.md](docs/DEPLOY.md).**

Run this before every deploy. It reads the environment the way the server will, prints no secrets, and exits non-zero if anything is unsafe or missing:

```sh
npm run preflight
```

`GET /api/health` is a readiness probe: it confirms the storage backend answers and reveals nothing else.

The server refuses to start on a configuration that is silently unsafe: a production `APP_URL` that is not HTTPS (loopback excepted), or the SQLite backend on a platform with ephemeral per-invocation storage such as Vercel, Netlify, Lambda or Cloud Run. Use `SANGOPASS_BACKEND=firebase` on those platforms.

On the SQLite backend, run **one Node.js application instance with a persistent disk**. Do not put the database on ephemeral storage or run independent replicas with separate files.

```sh
npm run build
npm start
```

For Docker, copy .env.example to .env, set APP_URL to your public HTTPS origin, then run:

```sh
docker compose up --build -d
```

The provided image runs as the node user. Compose binds port 3000 on loopback and persists the database in the sangopass-data volume. Put an HTTPS reverse proxy in front of it, preserve the public Host header and `X-Forwarded-Proto`, and proxy to port 3000. APP_URL is used for origin checks and absolute payment/recovery links. Docker must have network access at build time to obtain the bundled Google fonts.

Responses carry `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a camera-only `Permissions-Policy` and `Cross-Origin-Opener-Policy`. The policy relaxes `script-src` and `connect-src` in development only, for hot reload.

Back up SQLite with `npm run backup` on a host installation. This uses SQLite's consistent backup API and writes to data/backups. Store encrypted backup copies off the application host and test restoration. For restoration stop the app and replace the database from a verified backup; preserve restrictive file permissions. Do not copy only a live WAL-mode database file without using a consistent backup. On Firebase, configure scheduled backups in the Google Cloud console.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:http
```

The automated suite covers real tenant isolation on the live backend, role denial, invitation replay prevention, SAST visit windows, password reset/session revocation, signed and idempotent payment callbacks with mocked PayFast confirmation, audit-trail scoping, tenant export and erasure, per-tenant rate-limit scoping, the store contract shared by both backends (uniqueness reservations, read-before-write transactions, rollback, query translation), refusal to boot on unsafe deployments, every schema migration from v1 through v4, and the guest-visit rules: SA ID checksum validation, passport and student-number acceptance per property type, identity masking, residents-only booking, day/sleepover/extended windows, each of the three manager-set limits including the release of nights and slots on cancellation, the pass reaching both the resident and the visitor, the gate code (its alphabet, the mistyped O and I a guard actually produces, uniqueness, and that it is never the pass reference), South African phone numbers normalised to E.164, the SMS gateway being called correctly and every unsent outcome reported rather than thrown, check-in being refused to a resident and accepted from reception, password re-authentication on every guest request, report urgency ordering and manager re-triage, and the contacts directory including its organisation scoping, and the books: the totals in cents, rent receipts written and withdrawn by the register, manager-only access, one organisation never seeing another, refusal of a future month or a cost filed as rent, vacancy reported apart from arrears and a vacated unit not carrying its rent flag to the next tenant, editing and archiving (a repriced unit leaving past receipts alone, a rename reaching an unused pass, name reservations released and re-held, an occupied unit or a tenanted property refused, archived units freeing a plan slot and leaving vacancy, and restoration bringing a building and its units back), and a spreadsheet that cannot execute a formula while its negative amounts still sum. Plus the original demo's QR encode/decode and workflows. The HTTP smoke test starts an isolated production server, exercises account creation, invitations, a resident-only guest request with identity capture, the visitor-facing pass page and its masking, a resident signing their own guest in and out, the health probe, cross-tenant/CSRF denial and SSR, then restarts the server to verify database and session persistence. It uses generated test accounts and a temporary database, never the application database.

`NEXT_DIST_DIR` builds into an alternate directory, so a verification build can run while another server is serving `.next`.

A connected browser was unavailable during implementation. Desktop/mobile visual review, physical-camera scanning and actual PayFast/Resend delivery remain external acceptance checks. The Firebase backend is implemented and typechecked but has not been executed against a real project or emulator in this environment. Docker configuration is provided; the image has not been run here.
