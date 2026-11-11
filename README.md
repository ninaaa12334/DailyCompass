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

## Combined dashboard design

The calendar is the main workspace, with a compact productivity/current activity/free-time row above it and a single Upcoming events list beside it on desktop. Tasks & deadlines stay below; the duplicate day timeline is collapsed under Day details. Availability tools are in Settings. The planning companion and breathing-room dashboard card have been removed. Upcoming events lists the next six unfinished activities in the next seven days, starting today, and opens the existing activity editor.

Tap the productivity ring to open daily, weekly or monthly task completion details. Each task counts once. The denominator includes tasks dated, due or scheduled in the selected period, unfinished overdue tasks, missed earlier scheduled tasks and active tasks without dates. Fixed events (including school), routines and breaks do not earn task-completion credit. Empty/school-only periods show 0%; any unfinished counted task prevents 100%, even after rounding. Completion comes from the saved task checkbox, never elapsed time or an AI guess. Historical views reflect current saved completion, not an immutable history of what was finished on a past date.

Desktop navigation uses a sidebar; phones retain a four-item bottom dock and compact day/week calendar. Aurora, Ocean, Sunset, Space and Calm choices use the existing saved appearance system; mood choices are collapsed until opened. Sports/study icons and event colours are decorative and never change stored activities or scheduling rules. The aurora landscape is a local SVG asset.

## Front-page design

The landing page has a CSS/SVG animated scene with Football, Study and Unwind example activities. Switching examples changes the illustration and sample card only; it does not read or change personal schedules. A motion toggle remembers the preference, and system reduced-motion settings disable animation. All decorative assets are local code, with no image-generation or external tracking service added. Automatic decoration based on real saved activities is a future, separate feature.

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

The separate AI tab takes a written request, energy and planning style. There are no required date/time fields. Common wording such as `practise maths from 5 to 6 pm`, `tomorrow at 5 pm for 45 minutes`, weekdays and ISO dates supplies the range automatically. Undated requests use today in the selected planner timezone; without a time, usual planning hours apply. The review shows the interpreted date and time. Unclear am/pm, unsupported dates or overnight ranges ask for clarification. Use one day per request. It sends task details, computed gaps, interests, the request and optional recorded history. Notes and email bodies are excluded. Requests use `store: false`. See [official OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

The server independently checks proposals against sleep, commitments, buffers, kept-free periods, selected hours, task durations and duplicates. Invalid proposals save nothing. Suggestions reference existing task IDs or become new flexible tasks after approval; AI cannot create fixed commitments. Edit titles/times, uncheck activities, regenerate, reject or approve. Replanning explicitly replaces only future unfinished unlocked slots in the selected range. Started, completed and locked blocks remain. AI planning handles one selected day/range per request; it does not automatically plan a whole week.

Personalization is opt-in. Explicit task completions and date postponements are recorded, capped at 1,000 entries per account. View, delete/reset or disable history in Settings. Interests, energy and style provide context when history is sparse. Time spent on a subject is never treated as proof of difficulty.

### Sign up, log in and Google accounts

The welcome page has separate Sign up and Log in links. Sign up confirms the password; Log in uses the existing account. Both are also available in Settings. Continue without an account keeps the original local planner available.

Continue with Google works for both new and returning users. Configure the same `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` used by the server, and add this **additional authorized redirect URI** to the Google Cloud Web application OAuth client:

```text
http://127.0.0.1:8080/api/auth/google/callback
```

For deployment, use your HTTPS `APP_ORIGIN` plus `/api/auth/google/callback`. Keep the existing `/api/google/callback` registered for optional Calendar/Gmail connections. Restart the server after editing private `.env`.

Account sign-in requests only `openid email`. It uses PKCE, a browser-bound one-use state cookie, a nonce, and server-side RSA verification against Google signing keys. Issuer, audience, expiry, nonce and verified-email claims are checked. The stable Google subject identifies the account; existing password accounts are never silently merged by email. Google sign-in does not grant Calendar or Gmail access, does not store Google access/refresh tokens, and creates a separate private planner for new users. Linking an existing password account to Google is not implemented. Google-created accounts use Google to log in, rather than a local password.

Missing credentials show a setup error instead of simulated success. Unit/API tests use locally signed test identity tokens and mocked Google responses. Live Google consent/sign-in has not been verified. See [official Google OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

### Clerk development Google sign-in

Clerk can supply shared Google OAuth credentials for **development**. A production Clerk instance still requires custom Google credentials. Clerk has a free Hobby plan; no paid plan was activated by this integration. Your Clerk development application must have Google enabled under its social/SSO connections.

1. In the Clerk dashboard choose **JavaScript**, then **Manual setup**, or open **Configure > API keys**.
2. Copy the publishable key (`pk_test_...`) and secret key (`sk_test_...`) from the same development application into private `.env`:

```dotenv
CLERK_PUBLISHABLE_KEY=your_publishable_key
CLERK_SECRET_KEY=your_secret_key
```

3. Restart `npm.cmd start` and open `http://127.0.0.1:8080/auth.html`. Keep using this exact origin. If Clerk requests an application URL, use `http://127.0.0.1:8080`. Continue with Google opens the Clerk authentication page, where you select Google and complete any required verification.

When both Clerk keys are present, the Google button uses Clerk instead of the direct Google OAuth implementation. The official Clerk JS 6/UI 1 components handle provider redirects, signup requirements and verification. On return, the server verifies the Clerk token's signature, issuer and authorized origin, checks that its remote session is active, then creates its own HttpOnly session for a private SQLite planner. Remote session status is rechecked at most every 30 seconds. Logout clears the local session and signs out of Clerk. No Clerk secret is sent to browser JavaScript. The publishable key is intentionally public.

Clerk subjects have their own identity namespace and do not silently merge into password or direct-Google accounts by email. A new Clerk account starts with an empty planner; the original browser data can be copied explicitly into it. Existing app account deletion removes Day Compass records; it does not delete the separate Clerk user profile. No schedule content is sent to Clerk. Clerk and Google process authentication and identity data. The SDK is loaded only on the Clerk sign-in page or when signing a Clerk user out. Network/provider failures produce errors rather than simulated sign-in.

The Clerk flow is implemented and tested with mocked SDK/provider responses. **Live Google-through-Clerk signup remains unverified until real keys are configured and the user completes it.** See [Clerk JavaScript setup](https://clerk.com/docs/js-frontend/getting-started/quickstart), [Google development credentials](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google), and [token verification](https://clerk.com/docs/reference/backend/verify-token).

### Google Calendar and Gmail

**Without Google Cloud (private read-only iCal feed):** Open Settings > Google Calendar. In Google Calendar itself, open Settings > your calendar > Integrate calendar > Secret address in iCal format. Paste that address only into Day Compass's private-link field and press Connect & import calendar. Do not post it in chat, commit it, use a public feed or make your calendar public. This method needs a signed-in Day Compass account but no Google OAuth client or country selection. Google documents the secret address [here](https://support.google.com/calendar/answer/37648/?hl=en).

The server accepts only Google's HTTPS private-feed URL, refuses redirects and limits downloads to 5 MiB. Recurrence parsing runs in a memory/time-bounded worker. The link is stored encrypted with the existing server token key, never returned by status/planner APIs and cleared from the input after submission. It is absent from browser storage and planner backups. Calendar event titles and times are saved in your private account, as with OAuth imports.

Imports cover the past 7 and next 90 days, with refresh about every 15 minutes while the server runs. Google may delay feed updates; this is not instant or two-way sync. Refresh replaces this connection's imports, including changed/deleted occurrences, while retaining OAuth imports and local activities. Failed downloads/parses preserve previous imports. Recurrences, exceptions, timezone-aware timed events and all-day events are supported; an unsupported or oversized feed fails rather than silently dropping events. Imported events block planning conflicts and have reminders off. Disconnect removes the stored link and its imports from Day Compass; reset the secret address in Google Calendar to invalidate it elsewhere. Use one connection method per calendar to avoid duplicates.

The private-feed flow is verified using synthetic feeds and mocked Google downloads; a live private calendar feed still needs the user to connect and confirm its events. Windows test-notification delivery has been confirmed by the user; scheduled delivery still needs a separate timed test.

**OAuth connection (advanced, Google Cloud required):**

Settings is organized into Planning, Google Calendar, Notifications, Account and Privacy. Each section shows its own controls, setup guidance and status. Gmail and calendar export are collapsed optional features.

1. Create a Google Cloud project and enable **Google Calendar API**. Enable **Gmail API** only if you also want email suggestions.
2. Configure Google Auth platform (Branding, Audience, Data Access). For a personal Gmail account, choose External and add your Google account as a test user while in Testing. Add the Calendar read-only scopes listed below.
3. Create an OAuth **Web application** client. Register the exact redirect `http://127.0.0.1:8080/api/google/callback`, or your deployed HTTPS origin plus `/api/google/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and matching `APP_ORIGIN`; restart.
5. Sign in to Day Compass, open Settings > Google Calendar, connect, choose calendars, then import. Clerk Google sign-in and Calendar permission are separate; keep the Clerk keys.

Use the same `127.0.0.1` origin throughout; `localhost` is a different origin and needs its own exact registered redirect. A Google OAuth redirect mismatch means the registered URI differs from `APP_ORIGIN` + `/api/google/callback`. Testing-mode Calendar refresh tokens normally expire after seven days and require reconnecting. See [Google setup](https://developers.google.com/workspace/calendar/api/quickstart/nodejs) and [OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration). Standard Calendar API use has [no additional cost](https://developers.google.com/workspace/calendar/api/guides/quota); no paid service or hosting is provisioned here.

Calendar import asks for `calendar.calendarlist.readonly` and `calendar.events.readonly`. Choose calendars and import. A full paginated rolling sync covers the previous 7 and next 90 days, expands recurring occurrences, updates changed events and removes deleted/cancelled imports. Free/transparent events are skipped; all-day/overnight events split at local midnight. Stable calendar/event/date IDs prevent repeated import duplicates. Overlapping busy imports are merged for availability. Selecting calendars enables five-minute server polling, which can be disabled. Failed fetches preserve previous imports. Status, last success and errors are visible. Imported timed events retain their source instants and reproject immediately when timezone changes; the next sync refreshes the rolling import window.

Export is optional and requests `calendar.app.created`, limited to calendars this app creates. The activity editor has explicit export. An opt-in switch mirrors approved app activities, including future edits/deletions, on the next sync. Only the app-created Day Compass calendar is changed, within the rolling future window. Imported events are edited in Google, not here. App exports are excluded from re-import. Partial remote failures are reported; local state remains the source of truth.

Gmail uses `gmail.readonly` to search/read candidate messages. This is a **restricted Google scope**; a public launch may require verification/security assessment depending on deployment and applicable exceptions. Review [Google Gmail scope requirements](https://developers.google.com/workspace/gmail/api/auth/scopes).

A scan reads up to 20 recent matching messages from the last 30 days. It conservatively extracts plain-text ISO-date/24-hour-time clues and location lines. Uncertain fields stay blank for confirmation. HTML-only bodies and attachments are not parsed. Email is untrusted data, never rendered as HTML or followed as instructions, and never sent to AI. Bodies are discarded; accepted events retain a source message ID and optional location. Reviewed IDs prevent replay. Existing events and overlapping Google imports block duplicate additions. Nothing is automatically added and no mail is sent. Trusted-sender automatic rules and broad natural-language extraction are not implemented.

OAuth uses session-bound one-use state, PKCE and server-side exchange. Tokens are AES-256-GCM encrypted at rest. Disconnect revokes access and removes credentials; Google may revoke a combined grant, requiring the other service to reconnect. See [Google server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) and [Calendar events API](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).

### Background reminders

Configure keys and a real contact email once, from the project terminal:

```sh
npm.cmd run setup:push
```

The script prompts for a push-service contact address (not an email-reminder address), saves keys to private `.env` without printing them, and preserves an existing complete pair. A partial pair is rejected to prevent silently breaking existing subscriptions. Restart the server after configuration. Sign in, open Settings > Notifications and enable background reminders on this device. Permission is requested only on that click. Press Send test notification; the server targets only this account's registered device and rate-limits tests. Provider acceptance is reported honestly, without claiming the notification appeared.

To test a scheduled reminder, use Planning settings to select a default lead time and check quiet hours. Create a saved Day Compass activity far enough in the future (for example, 15 minutes away with a 10-minute lead), with reminders set to Default. Save and wait through its reminder time while the server and computer stay awake. Routine templates and imported Google events have reminders off in the current implementation. Event-specific timing and Planning settings defaults support 10, 30 and 1,440 minutes before. Open-page popups are suppressed in account background mode to avoid duplicates.

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
