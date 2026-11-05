# Day Compass

A personal planner built in manageable learning stages, using HTML, CSS, and JavaScript modules. No packages or paid services are required.

## Run locally

```sh
python -m http.server 8080 --bind 127.0.0.1
```

Keep that terminal running and visit http://127.0.0.1:8080/index.html.

- `index.html`: dedicated welcome page with Start planning, demo, and an honest account-status explanation.
- `dashboard.html`: your existing local planner and saved data, now in a compact widget layout.
- `dashboard.html?demo=1`: editable sample data stored separately in this tab's session storage.

Use the same browser and address as before. Storage belongs to an origin, including its port: localhost and 127.0.0.1 have separate data. Opening the HTML directly will not load JavaScript modules correctly. WordPress is not required despite the local folder location.

## Stage 1: welcome, dashboard, and themes

Implemented:

- The welcome headline and supporting text from the redesign brief, an illustrative floating-card preview, and a short three-step explanation.
- Working navigation, a Start planning account-status dialog, and a separate editable demo. Log in explains that real authentication is not available; it never asks for or accepts a password.
- Smaller widgets for current/next fixed events, unbooked minutes, task progress, calendar, selected-day timeline, and task management. Current/next refresh on page visibility and every minute.
- Sage and cream, lavender, ocean, rose, peach, midnight, and system appearance options.
- Custom accent and calendar busyness colours. Black or white text is chosen automatically for filled accents and heavily booked dates. Theme changes save only on Save; closing the popup cancels unsaved choices.
- Persistent appearance across the welcome page and dashboard. Demo appearance is isolated too.
- Distinct calendar indicators for busyness, today (underline), selected date (outline), and incomplete deadlines (dot), plus exact booked/unbooked minutes.
- A default Use my theme busyness colour for new dates. Existing saved date-specific colours remain supported and do not change your global theme.
- Reduced-motion support, visible keyboard focus, native dialog focus handling, and responsive layouts.

Progress is across the saved task list, not a claimed count of tasks completed today. Current/next and unbooked time currently use fixed commitments only. Task durations do not reserve calendar time yet. The preview on the welcome page is labelled example data.

## Existing features preserved

Tasks support title, category, optional deadline, duration, and priority; editing, deletion, completion, reopening, and filtering all persist. Extra task fields are under Category, deadline & priority; editing opens them automatically.

Select a date and use Add activity to open day setup. Save planning hours and a per-date busy colour, then add, edit, or remove fixed commitments. Commitments cannot overlap; adjacent events are allowed. Entries are for individual dates, without recurrence or overnight support.

Calendar capacity clips activities to planning hours and merges overlapping intervals before counting minutes. The shades are empty, up to one third, up to two thirds, and more than two thirds booked. The calculation is ready to receive scheduled tasks later, but no scheduler has been implemented.

Your tasks, calendar, and preferences remain in browser storage. They are not uploaded by this app or synced across devices. Anyone using this browser profile can open the local planner; this is not an authenticated account. Clearing browser data removes saved information. Use one tab for editing for now: simultaneous edits are not coordinated.

## Implementation order

1. Welcome, compact dashboard, and saved appearance (this stage).
2. Local personalisation: name, timezone, planning and sleep hours, break preferences. Preferences can be edited later. Real signup/login needs a backend and authentication setup.
3. Scheduling: fixed events first, then tasks by deadline and priority; breaks, sleep, no past placements, visible unscheduled reasons, and preserved completed/locked work. Preview moves before applying and support undo.
4. Activity recurrence, notes, category colours, and reminder preferences.
5. In-app reminders, then optional browser notifications after explaining and requesting permission. Verify permission denial, quiet hours, duplicate prevention, and rescheduling. No closed-app alarms are implemented or guaranteed.
6. Secure Gmail-to-task capture after backend and Google authorization setup. Use selected emails and reviewable drafts; keep credentials out of browser code. Gmail is the chosen provider, but nothing is connected now.
7. Separate monochrome TRMNL integration and later optional friend invitations with acceptance and revocable availability sharing.

This stage does not add automatic scheduling, natural-language parsing, AI, reminders, sleep settings, recurring activities, accounts, Gmail access, or a device integration. Those controls are not presented as working features.

## Understand the code

- `app.js` connects task forms to `task-store.mjs` and renders task rows with safe `textContent`.
- `calendar-ui.mjs` connects the calendar and native day-setup dialog to `calendar-store.mjs`.
- `dashboard-summary.mjs` reads the same saved data for current/next events, capacity, and progress.
- `appearance.mjs` validates preferences and calculates colour contrast. `theme-ui.mjs` applies shared CSS custom properties and handles the appearance dialog.
- `storage.mjs` and `runtime.mjs` choose real or isolated demo storage. `demo.mjs` seeds example tasks/commitments only into the demo.
- `welcome.mjs` handles the local-access explanation. `styles.css` defines the shared design tokens, layout, and responsive rules.

Data modules are separate from UI modules so we can test behaviour without a browser. Saving happens before updating in-memory state: failed writes show an error and do not pretend to succeed. Unreadable saved tasks/calendar data is preserved rather than silently overwritten. The user may explicitly replace unreadable appearance preferences by saving a new theme.

## Verification

Run:

```sh
node task-store.test.mjs
node calendar-store.test.mjs
node appearance.test.mjs
node dashboard-summary.test.mjs
```

Tests cover task persistence and failure handling, commitment conflicts, date boundaries, overlapping capacity, theme persistence, accent/text contrast of at least 4.5:1, demo isolation, and current/next event boundaries. Source syntax, HTML references, and local file delivery are checked separately.

Browser automation could not complete: the browser connector was unavailable and desktop app access timed out. Mobile/desktop rendering, actual keyboard behaviour, and live interactions still need manual verification; source and model checks do not prove those pass.

### Manual acceptance checks

1. Open the welcome page: verify the exact headline and both calls to action. Log in and Start planning should explain local mode, not simulate authentication.
2. Open your local planner and confirm previous tasks/commitments remain. Add, edit, complete, cancel an edit, delete a task, then reload.
3. Enter the sample demo, edit a sample task and theme, then return to your planner: personal data and appearance should be unchanged.
4. Save each theme and reload. Select Follow system and change your OS appearance manually. Try bright yellow and white custom accents: button text should remain readable.
5. Pick a date, set 08:00-16:00 planning hours, then add School from 08:00-15:00. Expect 420 booked minutes and 60 unbooked minutes. Try an overlap and confirm it is rejected.
6. Edit School to end at 12:00: expect 240 booked and 240 unbooked minutes and a lighter calendar shade. Reload and check persistence.
7. Add a task deadline on that date and complete it: verify the deadline dot updates. Check calendar selection does not change the global appearance.
8. Use only Tab, Shift+Tab, Enter, Space, and Escape. Check dialog focus, closed task-details validation, calendar selection, and retained checkbox focus.
9. Check at 360px, 768px, and 1280px widths: no clipped text, overlapping controls, or horizontal scrolling. Enable reduced motion and inspect hover behaviour.

Small learning exercise: change one theme's display label in `appearance.mjs`, then explain how CSS custom properties let all widgets change together. Compare `localStorage` with the demo's `sessionStorage` before the next stage.

Scheduling-full-day and reminder-rescheduling checks remain pending until those features exist.

## TRMNL status

No TRMNL functionality existed in the inspected code. This redesign does not remove a working integration or claim a browser preview is a device test. A future monochrome layout must remain separate from the web themes.

Official references reviewed on 4 November 2026:

- [Private plugins](https://help.trmnl.com/en/articles/9510536-private-plugins): Developer add-on or BYOD licence setup.
- [Plugin strategies](https://help.trmnl.com/en/articles/17434705-plugin-strategies): polling/webhook choices and refresh limitations.
- [TRMNT challenge](https://trmnt.hackclub.com/): the detailed Get Started page could not be fetched, so full submission rules remain unverified.

Verify the current challenge rules before choosing the integration or purchasing hardware/licences. Keep API credentials server-side and schedules off unprotected public endpoints.

## Learning and AI assistance

The scaffold, design, task/calendar implementation, theme/demo modules, tests, and README were generated with AI assistance. Keep this attribution accurate. The learner should test and explain changes and make their own small modifications before moving on.

Hack Club programs have different AI-use, originality, and time-tracking rules. Verify TRMNT's current requirements before submitting. Track only genuine eligible work using the required tools; never fabricate hours, claim generated work as your own, or submit AI-written text as a personal journal.
