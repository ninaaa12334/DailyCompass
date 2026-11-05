# Day Compass

A personal daily planner, built one milestone at a time. Task management, calendar setup, and fixed commitments work locally; automatic scheduling and the TRMNL dashboard are future milestones.

## Run locally

From this folder, run:

```sh
python -m http.server 8080 --bind 127.0.0.1
```

Visit http://127.0.0.1:8080/index.html. Keep the terminal running. No packages, accounts, or paid services are required. The page now uses JavaScript modules, so use the server instead of double-clicking the HTML file.

The folder happens to be inside a WordPress theme, but this app does not require WordPress. Keep using the same address and browser: localStorage belongs to the website address, including the port. Localhost and 127.0.0.1 have separate storage.

## Current milestone: a functional task manager

- Add titles, categories, optional deadlines, duration in minutes, and priority.
- Edit or delete tasks; mark them complete or reopen them.
- Filter all, active, or completed tasks and see the completion count.
- Save changes in localStorage so tasks survive refresh and browser restarts.
- Keep the floating widget layout on phones and laptops.

This is browser-local storage, not account-based storage or cross-device sync. Clearing browser data removes tasks; private browsing may discard them on exit. Use one tab while working for now: simultaneous editing across tabs is not coordinated. A backend with authentication and server-side permissions will come later.

## Calendar setup milestone

Choose a calendar date and click **Set up your day**. The popup lets you save planning hours and a colour for that date, then add, edit, or remove fixed commitments. Changes persist in this browser. Close or Escape dismisses the popup; unsaved form changes are discarded. There is no external calendar connection.

Each date has its own settings. The selected day's palette colours the controls and overview; individual calendar dates retain their own palette. There are four presets: ocean blue, sage, lavender, and rose.

Calendar shading counts fixed commitment minutes **inside planning hours** divided by total planning minutes. Empty dates are unshaded; up to one third uses a light shade, up to two thirds uses a medium shade, and more uses a dark shade. This is a proportion, so a short planning window can look full with fewer booked minutes. Text and accessible date labels provide the numbers too.

Incomplete task deadlines get a dot and appear in the selected-day overview. Completing a task removes its deadline marker unless other incomplete tasks are due that day. Deadlines do not reserve time, and the unbooked count does not yet subtract task estimates. Commitments cannot overlap; adjacent activities are allowed. Commitments outside planning hours stay visible but do not consume planning time. Entries are for individual dates, without recurrence or overnight support.

### Try the calendar

1. Pick a date, open setup, set planning hours to 08:00–16:00, choose lavender, and save.
2. Add School from 08:00–15:00. The date should darken and show 420 minutes booked and 60 unbooked.
3. Try adding Volleyball from 14:00–16:00. The overlap should be rejected without changing School.
4. Edit School to finish at 12:00. The date should lighten, with 240 minutes booked and 240 unbooked.
5. Close the popup and refresh. Select that date again and check its colour, hours, and commitment.
6. Create a task due on that date, then mark it complete. Check the deadline dot and summary update.
7. Check another date and another month: the settings should stay specific to the chosen day.
8. Test the popup with keyboard Tab and Escape and at a phone width.

Learning task: calculate the shade you expect for a 90-minute commitment in a six-hour window, then test it. Change one palette's display name in `index.html` without changing its stored value.

## Understand the code

- `index.html` contains the form and widget structure. `type="module"` allows the script to import other files.
- `styles.css` controls the appearance and mobile layout.
- `task-store.mjs` manages task data and persistence independently from the page.
- `app.js` connects form actions to the store, then redraws the list.
- `task-store.test.mjs` checks persistence, validation, completion preservation, and failure handling.
- `calendar-store.mjs` saves each day's hours, palette, and commitments and calculates booked time.
- `calendar-ui.mjs` connects the calendar and setup popup to that data; `calendar-store.test.mjs` checks conflicts, dates, capacity, and persistence.

A task is a JavaScript object. Tasks live in an array. `JSON.stringify()` converts that array to a string for localStorage; `JSON.parse()` reads it back. Every change saves first and redraws the list afterward. If writing fails, the old data stays intact and the page shows an error. Unreadable saved data is left untouched for recovery.

`textContent` displays typed titles as plain text. Editing preserves a task's ID and completion status. A checkbox changes its completed boolean. A deadline is a date only, not a scheduled activity or a reminder.

### Your hands-on check

1. Add Algebra, category Study, duration 30, priority High, and a deadline.
2. Refresh the page: confirm every field survived.
3. Complete Algebra, edit its duration to 45, and refresh: it should still be completed.
4. Try the Active and Completed filters, then reopen the task.
5. Start editing, change the title, then cancel: the stored title should stay unchanged.
6. Delete the task and refresh: it should remain deleted.
7. Try a spaces-only title, a zero duration, and a decimal duration: these should not create tasks.
8. Add `<strong>Hello</strong>`: it should appear as literal text.
9. Check the layout at a narrow phone width.

Small coding exercise: change the default duration from 30 to 25 in `index.html`, then explain why existing tasks should retain their saved durations. Send your explanation and test results before we add scheduling.

### Automated checks

```sh
node task-store.test.mjs
node calendar-store.test.mjs
```

Eleven data-layer tests pass. JavaScript syntax and local module delivery were also checked. Real-browser interaction and visual verification remain pending because browser automation was unavailable.

## Next milestones

1. Test and understand the task manager, calendar, and setup popup.
2. Build and test a scheduler incrementally: commitments first, then tasks ordered by deadline and priority, breaks, visible unscheduled tasks, and explanations. Later support adjustments and preserve completed work when replanning.
3. Add the dashboard and a separate monochrome TRMNL layout and real integration.
4. Add a conversational planning panel after the basic scheduler works. It should propose changes for review; no AI service is connected now. Discuss cost and privacy before introducing one.
5. Add due-work reminders, distinguishing an in-app reminder list from background notifications. Notification and alarm support must be verified for the target browser; closed-app delivery is not implemented or guaranteed.
6. Add email-to-task capture after choosing the mail provider and implementing a secure backend. Keep mailbox credentials out of browser code. Start with user-selected emails and editable task drafts; do not connect or read a mailbox without authorization.

## TRMNL status

No device integration exists yet. A future browser preview will not by itself demonstrate a working integration.

Official references reviewed on 4 November 2026:

- [Private plugins](https://help.trmnl.com/en/articles/9510536-private-plugins): account setup requires the Developer add-on or BYOD licence.
- [Plugin strategies](https://help.trmnl.com/en/articles/17434705-plugin-strategies): polling and webhooks are available; polling can run every 15 minutes, or every 5 minutes with TRMNL+. Screen generation and device check-in affect when updates appear.
- [TRMNT challenge](https://trmnt.hackclub.com/): accepts projects for the TRMNL ecosystem. Its linked Get Started page could not be fetched, so detailed submission rules remain unverified.

Choose the integration after checking the full current challenge requirements. Keep credentials out of browser code and public Git history; do not expose schedules through an unprotected public endpoint. Check available challenge grants before considering paid licences or hardware.

## Learning and AI assistance

The scaffold, widget styling, task-management and calendar implementations, tests, and README were generated with AI assistance. The learner's next exercise is to test and explain the data flow and make a small change. Keep this attribution accurate as the project develops.

Hack Club rules differ by program. Verify TRMNT's current AI-use, originality, and time-tracking rules before submitting; this README does not establish eligibility. Track only genuine eligible work using the required tools. Do not fabricate hours, claim generated work as your own, or submit AI-written text as a personal journal.
