# Day Compass

A calm personal planner with floating cards, a phone agenda and optional private server accounts. The dashboard uses soft lilac, peach and blue cards with a circular task-completion widget. Existing saved themes remain available.

## Run locally

Use **Node.js 24.15 or newer**:

```sh
npm.cmd ci
npm.cmd start
```

Open http://127.0.0.1:8080/dashboard.html and keep the terminal running. Stop with Ctrl+C. Use the same address to keep access to the same browser-local data: localhost and 127.0.0.1 are separate origins. On a phone, 127.0.0.1 points to the phone, not this computer. Cross-device access requires a properly hosted HTTPS backend. No hosting or paid subscription has been provisioned.

The Node server serves the frontend, authenticated API, SQLite database and background workers. Static hosting cannot provide accounts, AI, OAuth or background reminders. Development binds only to loopback. Use Node rather than exposing the repository through Apache; additional Apache rules also block private directories.

## Available now

- Circular Day/Week/Month productivity view, based on completed tasks dated, due or scheduled in the selected calendar period. Each task counts once; an empty period shows 0% and a fresh-start message. This is task completion, not time worked.
- Existing tasks/deadlines, completion, fixed events, finite daily/weekly recurrence, occurrence/series edits, deterministic plan previews, locks and undo.
- Phone Day view with compact date selector, readable agenda and timeline. Phone Week uses a full-width daily timetable; desktop Week keeps seven columns. Month fits the screen with selected-day activities below. Saved view choices remain.
- Availability setup: timezone, sleep, planning hours, school/work/meal/other weekly routines, travel buffers, interests and minimum useful gap. No school or meal schedule is assumed; routines are intentionally entered.
- Free-time totals, flexible reservations, largest gaps by weekday, due-soon work, explained suggestions and explicit add/AI/keep-free actions. Kept-free periods can be released and are respected by scheduling.
- Real private accounts with salted scrypt password hashes, random HttpOnly/SameSite session cookies (Secure on HTTPS), origin checks and user-scoped database queries.
- Account changes sync after edits and poll other-device changes every 15 seconds. Versions reject stale writes. Export unsynced changes before reloading after a conflict. Offline edits retry from the current tab; new signed-in sessions require the server. This is not a fully offline PWA.
- Local, demo and account planners are separate. Signing in starts a separate server planner. An empty account can explicitly copy the saved v2 local planner. The original browser data stays intact. Account cache is tab-scoped; sign-out clears it and returns to local mode. Accounts can be deleted. Password recovery/email verification are not implemented.

## External setup

Copy `.env.example` to `.env` and restart after changes. Existing environment variables take precedence. Never put secrets in browser code. `.env`, `data/`, database/encryption keys and package caches are ignored by Git and blocked by the Node static handler. Securely back up both the database and encryption key.

### Plan with AI

Set `OPENAI_API_KEY` and `OPENAI_MODEL` privately. Choose a model supporting Responses structured outputs. **API usage may cost money**. No request is sent until you click Propose/regenerate; no paid service is enabled in this checkout.

The separate AI tab takes a date/range, request/goals, energy and planning style. It sends task details, computed gaps, interests, the request and optional recorded history. Notes and email bodies are excluded. Requests use `store: false`. See [official OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

The server independently checks proposals against sleep, commitments, buffers, kept-free periods, selected hours, task durations and duplicates. Invalid proposals save nothing. Suggestions reference existing task IDs or become new flexible tasks after approval; AI cannot create fixed commitments. Edit titles/times, uncheck activities, regenerate, reject or approve. Replanning explicitly replaces only future unfinished unlocked slots in the selected range. Started, completed and locked blocks remain. AI planning handles one selected day/range per request; it does not automatically plan a whole week.

Personalization is opt-in. Explicit task completions and date postponements are recorded, capped at 1,000 entries per account. View, delete/reset or disable history in Settings. Interests, energy and style provide context when history is sparse. Time spent on a subject is never treated as proof of difficulty.

### Google Calendar and Gmail

1. Create a Google Cloud project and enable **Google Calendar API** and **Gmail API**.
2. Configure the OAuth consent screen; add your Google account as a test user while in Testing.
3. Create an OAuth **Web application** client. Register the exact redirect `http://127.0.0.1:8080/api/google/callback`, or your deployed HTTPS origin plus `/api/google/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and matching `APP_ORIGIN`; restart.
5. Sign in to Day Compass and connect each service separately in Settings.

Calendar import asks for `calendar.calendarlist.readonly` and `calendar.events.readonly`. Choose calendars and import. A full paginated rolling sync covers the previous 7 and next 90 days, expands recurring occurrences, updates changed events and removes deleted/cancelled imports. Free/transparent events are skipped; all-day/overnight events split at local midnight. Stable calendar/event/date IDs prevent repeated import duplicates. Overlapping busy imports are merged for availability. Selecting calendars enables five-minute server polling, which can be disabled. Failed fetches preserve previous imports. Status, last success and errors are visible. Imported timed events retain their source instants and reproject immediately when timezone changes; the next sync refreshes the rolling import window.

Export is optional and requests `calendar.app.created`, limited to calendars this app creates. The activity editor has explicit export. An opt-in switch mirrors approved app activities, including future edits/deletions, on the next sync. Only the app-created Day Compass calendar is changed, within the rolling future window. Imported events are edited in Google, not here. App exports are excluded from re-import. Partial remote failures are reported; local state remains the source of truth.

Gmail uses `gmail.readonly` to search/read candidate messages. This is a **restricted Google scope**; a public launch may require verification/security assessment depending on deployment and applicable exceptions. Review [Google Gmail scope requirements](https://developers.google.com/workspace/gmail/api/auth/scopes).

A scan reads up to 20 recent matching messages from the last 30 days. It conservatively extracts plain-text ISO-date/24-hour-time clues and location lines. Uncertain fields stay blank for confirmation. HTML-only bodies and attachments are not parsed. Email is untrusted data, never rendered as HTML or followed as instructions, and never sent to AI. Bodies are discarded; accepted events retain a source message ID and optional location. Reviewed IDs prevent replay. Existing events and overlapping Google imports block duplicate additions. Nothing is automatically added and no mail is sent. Trusted-sender automatic rules and broad natural-language extraction are not implemented.

OAuth uses session-bound one-use state, PKCE and server-side exchange. Tokens are AES-256-GCM encrypted at rest. Disconnect revokes access and removes credentials; Google may revoke a combined grant, requiring the other service to reconnect. See [Google server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) and [Calendar events API](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).

### Background reminders

Generate keys once:

```sh
node scripts/generate-push-keys.mjs
```

Copy output into private `.env`, replace the contact address and restart. Keep the same pair for existing subscriptions. Sign in, read the explanation in Settings and enable background reminders. Permission is requested only on that click. Event-specific timing and Planning settings defaults support 10, 30 and 1,440 minutes before. Open-page popups are suppressed in account background mode to avoid duplicates.

The worker checks every 15 seconds while the **server stays running**, even when the page closes. It derives jobs from saved occurrences for the next 31 days, reconciles edits/deletion/completion/timezone changes, and persists delivery fingerprints. Notification center shows pending, cancelled, missed, quiet, failed and push-service-accepted states. Payloads hide activity titles; tapping opens the authenticated event. Subscriptions are user-scoped and restricted to supported push domains. Sign-out currently disables all that account's subscriptions; other devices must re-enable them.

A push-service acceptance is **not proof of device delivery**. Jobs are claimed before sending to avoid duplicate attempts after a crash; an interrupted send may be lost rather than retried. Browser/device/network conditions can delay or suppress delivery. This is not a guaranteed alarm. Email reminders are not configured. In-app upcoming reminders remain available, and open-page alerts can be enabled separately.

On supported iPhone/iPad versions, install to the Home Screen and open from that icon before requesting Web Push permission. Deployment requires HTTPS; localhost is allowed for development. See [official WebKit Web Push guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Physical iPhone delivery has not been tested.

## Time handling and deployment boundaries

Dates stay `YYYY-MM-DD`; local activity times stay `HH:MM` in the selected IANA timezone. Changing timezone keeps intentionally entered wall times. Timed Google imports reproject their stored absolute instants immediately; all-day dates remain all-day dates. Current-time lines, scheduling, reminders and AI context use the selected zone. Imported all-day endings support `24:00`.

DST gaps are rejected. Automatic free-time suggestions conservatively reserve repeated or nonexistent clock-change hours; they never advertise those hours as free. Modern quarter-hour-aligned IANA transitions are handled; unusual historical transitions are outside this planner?s intended range. Repeated times require the earlier/later choice in the activity editor or AI review. A recurrence containing an invalid/ambiguous occurrence is rejected until clarified. Routine templates reserve wall-time ranges and have reminders off; background jobs never guess ambiguous instants. Per-event travel timezones are not supported.

Before public deployment, arrange HTTPS, protected persistent disk outside public web roots, backups, process supervision, monitored workers and account recovery. Never expose personal schedules through public JSON. No hosting deployment was performed. No TRMNL device integration is claimed; its future monochrome layout stays separate.

## Verification and learning

```sh
npm.cmd test
npm.cmd run test:browser
```

Unit/API tests use in-memory SQLite and real local HTTP authentication. Coverage includes user isolation, origin checks, version conflicts, migration, recurrence/undo, scheduling/overlap/buffers, DST, AI validation/approval, OAuth state/encryption, Google import replacement/deletion, Gmail review/deduplication and push cancellation/deduplication. Provider responses and push sends are explicitly mocked. **No live Google connection, paid AI request or physical device delivery has been verified.**

Browser tests use isolated installed Chrome on port 8081, never your normal profile. They cover existing workflows plus setup, actual account creation/import/logout, disconnected states, mocked AI approval and layouts at 360/390/430px. Screenshots are ignored. Phone emulation does not replace real Safari/device testing.

The frontend remains HTML/CSS/JavaScript modules. `availability.mjs` merges busy intervals, `scheduler.mjs` fits tasks, `planner-store.mjs` validates state, `assistant-ui.mjs` manages setup/reviews, and `account-client.mjs` syncs versioned snapshots. `server/` owns accounts, SQLite, secrets and workers.

Small exercise: plan 08:00-18:00 with school 08:00-15:00 and a 15-minute travel buffer. Predict the first afternoon gap, then find its calculation in `availability.mjs`. Understand and test this stage before extending integrations.

Code, tests and documentation were produced with AI assistance. Keep that attribution accurate. Verify the specific Hack Club/TRMNT program's current AI/originality/time rules before submitting; never fabricate coding hours or present generated text as your own work log.
