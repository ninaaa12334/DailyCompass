# Day Compass

A local personal planner built with HTML, CSS, and JavaScript modules. The colourful welcome page and floating-card design are preserved. No account, paid AI service, or backend is required to use this version.

## Run

If the existing preview is running, open http://127.0.0.1:8080/dashboard.html and refresh. Keep the same address and browser to retain access to your saved local data.

For a fresh local server:

```sh
npm.cmd start
```

On Windows PowerShell, the `.cmd` form avoids the npm PowerShell-script policy issue. On other systems, use `npm` instead. This uses Node's built-in HTTP server; app dependencies are not required. Default address: http://127.0.0.1:8080. If a Python server already owns that port, keep using it or stop that terminal first. Do not change ports unnecessarily: browser storage is separate for each origin, including the port.

The Python alternative remains:

```sh
python -m http.server 8080 --bind 127.0.0.1
```

Use a web-server URL rather than double-clicking the HTML file. The Node server serves modules with the correct JavaScript MIME type and disables caching during development. `.htaccess` also declares the `.mjs` MIME type for compatible Apache setups; Apache itself must be running if you choose that route.

- `index.html`: welcome and honest local-account explanation.
- `dashboard.html`: personal planner using this browser's local storage.
- `dashboard.html?demo=1`: isolated sample planner in session storage, with separate appearance and view preferences.

## Loading investigation and fix

The supplied attachment contained written symptoms, not a screenshot. The old app loaded correctly in a clean isolated Chrome context, so the exact original environment/data trigger could not be reproduced. Server checks confirmed that the active Python preview serves JavaScript modules correctly; the Apache URL did not respond during investigation.

The confirmed startup weakness was that static module failures or initialization exceptions left the HTML's loading placeholders on screen, with no recovery UI. `bootstrap.js` is now a small classic-script entry point that dynamically imports and starts the app, catches failures, and times out stalled module requests after ten seconds. It resolves to a ready state or an error with Retry, details, and a local saved-data download. It does not reset storage to hide an error.

A separate browser test caught an actual rescheduling defect: an activity moved to another date, but the calendar stayed on the original week. Saving now selects and displays the activity's date.

If a particular saved dataset still fails, use the visible error details and download a backup for recovery. Do not delete local storage just to clear a loading message.

## Stage 1: shared data and safe persistence

`planner-store.mjs` is the shared source for tasks, fixed events, schedules, settings, completion, locks, reminder receipts, and one-level undo. Every change validates a copy, saves it, then updates the UI. A failed write leaves the previous state intact.

Older task and calendar keys are read and normalised in memory. Known missing optional fields get safe defaults. The new planner writes to `day-compass.planner.v2`; the original `.tasks.v1` and `.calendar.v1` keys are never deleted or overwritten by migration. Invalid data is preserved and reported. The legacy data modules and their tests remain for compatibility.

Appearance and the Day/Week/Month view are independent UI preferences. The sample demo uses a prefixed session-storage adapter and does not overwrite your personal data.

Data remains in this browser profile, not in an account. Clearing browser data removes it, and another person using this same profile can open it. Storage events refresh other open tabs, but simultaneous editing is still last-write-wins; prefer one editing tab. Cross-device sync needs a backend database, real authentication, server-side authorization, and a migration/sync design. None is simulated here.

## Stage 2: calendar and activities

- Day: a 24-hour timeline with activity blocks at their actual times.
- Week: seven dated columns, sticky headings, time labels, and scrolling within the calendar.
- Month: six Monday-first weeks including leading/trailing dates, activity labels, deadline markers, and busyness shading.
- Today, selected dates, deadline dots, and completed activities have distinct indicators; exact booked/free time appears in the selected-day panel.
- Previous/next moves by the active view. Today uses the configured timezone. The selected view is saved. Narrow screens initially use Day.
- Clicking a slot prefills its date and start/end time. Keyboard arrows, Home/End, and Enter provide a slot-entry alternative.
- All Add activity buttons use one editor. The quick task form opens that editor as a flexible task.

The editor supports title, category, fixed/flexible type, date, fixed start/end, flexible estimated duration/deadline, priority, notes, reminder override, and finite daily/weekly recurrence. It also supports editing, completion/reopening, and deletion. Changes can be undone using Undo last change. Simultaneous duplicate clicks are guarded; duplicate fixed events and overlaps produce errors.

For recurring activities, choose This occurrence only or Entire series when editing/deleting. One-occurrence edits detach an exception. Recurrences are materialised through a required end date within one year. Their frequency stays as created; create a new series to change frequency. Overnight events and drag-and-drop are not implemented.

## Stage 3: understandable scheduling

Generate my day and Replan remaining day both open a preview before changing the saved schedule. The preview lists proposed times, previous times when an activity moves, recommendation reasons, and tasks that cannot fit. Apply is explicit; Cancel leaves the stored plan unchanged. A changed planner revision invalidates an old preview. Undo restores the previous plan.

Rules in `scheduler.mjs`:

1. Start inside planning hours and, for today, round the current time up to the next five-minute boundary. Never create a new plan in the past.
2. Reserve fixed events, sleep, completed placements, manually locked work, and already-started/past placements. Keep breaks attached to preserved work.
3. Sort eligible unfinished tasks by earliest deadline, then priority, then title for deterministic ties.
4. Place `estimated duration - minutes already worked` into the first uninterrupted gap that fits. Do not assume work was done simply because time passed.
5. Reserve the configured break after each newly placed task where the gap permits. Do not duplicate a task already scheduled on another current/future day.
6. Keep tasks that do not fit in the task list and save the last plan's unscheduled reasons alongside the selected day. Offer another date, different hours, or an updated remaining duration instead of placing work outside the window.

Completed and locked placements stay fixed. A conflict with sleep or a preserved placement is shown rather than silently moving it. Fixed-event conflicts with existing schedules are rejected. For a flexible task that should move to another day, open its scheduled block, unlock if needed, choose Remove task from this day, then select the new date and preview a new plan. The task itself is retained. Fixed events can change dates directly in the editor.

Planning settings include timezone, default planning hours, sleep hours, break length, reminder defaults, and quiet hours. Existing per-day hours remain specific to that date; use Edit day hours to change them. Equal sleep or quiet start/end disables that particular blocked interval.

## Stage 4: real dashboard calculations

Current and next activities include fixed events, scheduled tasks, and breaks. Next also searches later saved dates. The selected-day timeline reads the same shared records. Progress explicitly counts tasks dated, due, or scheduled on the selected date, rather than claiming an unspecified daily total.

Booked time clips activities to the selected planning window and merges overlaps. Sleep-only blocked minutes are excluded from free time. Calendar busyness uses the same capacity calculation, including scheduled work and breaks. Date-only deadlines stay as date strings; timezone-aware current-time calculations use `Intl.DateTimeFormat`, without converting deadlines through UTC.

## Stage 5: honest reminders

Upcoming reminders are derived from the current activities, not separate stale timers. Moving an activity changes its reminder key; deletion/completion removes its pending reminder and closes any notification created by this page for it. Default timing can be overridden per activity or switched off.

Global alerts are off initially. Enable them in Planning settings. Quiet hours suppress delivery. Notification permission is requested only when the user clicks the explained Enable browser notifications button. If permission is denied or notifications are unavailable, the in-app list and alerts remain available. See [MDN's notification permission guidance](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API).

Open-page checks run every 15 seconds and on return to the page. Persistent receipts prevent repeated alerts for the same activity/date/start/lead. A browser lock serialises checks across supported same-origin tabs; without that API cross-tab delivery is best effort. Receipt storage failures are shown and suppress delivery rather than pretending deduplication succeeded.

These are **open-page reminders only**. A suspended browser, sleeping computer, closed page, or nonexistent local time during a daylight-saving transition can delay or prevent delivery. No push service, background notification scheduler, email delivery, or reliable closed-app alarm is implemented. OS notification delivery was not tested; the automated permission-denial test uses a mock, while in-app timing/rescheduling is exercised with an isolated browser clock.

## Verification

App use needs no installed packages. For development tests only, install the free Playwright tooling:

```sh
npm.cmd ci
npm.cmd test
npm.cmd run test:browser
```

The browser suite uses installed Google Chrome in a new isolated profile and its own local server at port 8081. It never reads your normal browser's storage or login session. Screenshots and test output are ignored by Git. [Playwright documentation](https://playwright.dev/docs/library).

Model tests cover safe migration, preserved original keys, conflicts, recurrence/one-occurrence edits, validation, persistence failures, schedule gaps, sleep, past dates, remaining duration, breaks, locks/completion, stale previews, undo, capacity, timezone boundaries, reminder cancellation/rescheduling/deduplication, themes, and demo isolation.

Browser tests cover:

- First visit and existing data, plus failed/stalled module loading and corrupt saved-data recovery.
- All three views, month/year boundaries, Today, date selection, and keyboard slot entry.
- Adding, editing, rescheduling, completing, deleting, undoing, and refreshing activities.
- Recurrence exceptions, fixed/flexible planning, preview/cancel/apply, locks, replanning, overfull days, and saved unscheduled explanations.
- Timezone persistence, notification denial, in-app reminder rescheduling/cancellation without duplicate receipts.
- Mobile layout, dialog fitting, keyboard dismissal, and focus return. Desktop and mobile screenshots have also been visually inspected.

## Learning map

- `bootstrap.js`: loading, error reporting, retry, and backup export.
- `app.js`: forms, shared-store actions, dashboard widgets, plan previews, and reminder delivery.
- `planner-store.mjs`: validated transactions, migration, recurrence occurrences, persistence, and undo.
- `scheduler.mjs`: pure scheduling rules and capacity calculations.
- `calendar-ui.mjs`, `timetable-ui.mjs`, `calendar-view.mjs`: view navigation, DOM rendering, date arithmetic, and time-to-position mapping.
- `clock.mjs`, `reminders.mjs`: timezone-aware clock and pure reminder calculations.
- `appearance.mjs`, `theme-ui.mjs`, `runtime.mjs`, `storage.mjs`: saved appearance and real/demo storage selection.

Small exercise: create a 45-minute task with 15 minutes already worked. Before generating a plan, predict how long its scheduled block will be. Then find the subtraction in `scheduler.mjs` and explain why planning in the past is blocked.

## Remaining project boundaries

There is no backend, real signup/login, friend sharing, external calendar sync, Gmail connection, AI service, or working TRMNL integration. Gmail remains the chosen later email provider. A future TRMNL layout should stay monochrome and separate from the colourful web themes, with server-side credentials and protected schedule access. The inspected project had no device integration to preserve, and no device testing is claimed.

Verify current official TRMNL documentation and the full TRMNT challenge rules before choosing an integration or buying hardware/licences. The full challenge Get Started page was not available in the earlier research.

The implementation, tests, and README were generated with AI assistance. Keep that attribution accurate, understand and test the code, and make your own small changes. Hack Club programs differ in AI-use, originality, and time-tracking rules. Verify the chosen program's current requirements; never fabricate coding hours or submit AI-written text as a personal work journal.
