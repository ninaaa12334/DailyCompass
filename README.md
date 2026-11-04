# Day Compass

A personal daily planner, built one small lesson at a time. A separate TRMNL dashboard is planned for later.

## Run the starter

Open `index.html` in a browser. No packages, accounts, or paid services are required.

This is a standalone learning project even though its local folder is inside a WordPress theme. It does not need WordPress to run.

## Lesson 1: add and display a task

The starter contains a labelled form, responsive styling, and a JavaScript submit listener. The display logic is intentionally unfinished so you can write it yourself.

- `index.html` defines the page and form. `defer` runs the script after the HTML has been read.
- `styles.css` controls appearance and allows the form to wrap on narrow screens.
- `app.js` finds the elements, handles submission, and rejects spaces-only titles.
- `preventDefault()` prevents normal form submission from reloading the page.
- `trim()` removes spaces from the beginning and end of the input.

Replace the exercise comment in `app.js` with three steps:

1. Use `document.createElement('li')` to create a list item and store it in a variable.
2. Assign `title` to that item's `textContent` so the title is displayed as plain text.
3. Call `taskList.append(...)` with your new item.

Then try clearing the input with `taskForm.reset()` after adding a task. Explain why the reset belongs after validation, rather than before reading the title.

### Test your attempt

- Add `Practise algebra`: one task should appear without a page reload.
- Add a second task using Enter: both should remain visible.
- Submit an empty title: the browser should require a value.
- Submit spaces only: a message should appear and no item should be added.
- Enter `<strong>Hello</strong>`: it should appear literally, rather than as bold HTML.
- Try a narrow browser window: the input and button should fit.
- Refresh: tasks will disappear at this stage. Persistence is a later lesson.

Send your attempt for review before moving to the next lesson. This starter has not been visually tested in a browser.

## Next milestones

1. Finish and understand adding task titles.
2. Introduce a task array and localStorage, then completion, editing, categories, deadlines, durations, and priorities one feature at a time.
3. Add fixed commitments and planning hours.
4. Build and test a scheduler incrementally: commitments first, tasks ordered by deadline and priority, breaks, visible unscheduled tasks, and explanations. Later support adjustments and preserve completed work when replanning.
5. Add the dashboard and a separate monochrome TRMNL layout and real integration.

localStorage stores data for a website address in one browser. It is not cross-device sync or an account system. A later backend will authenticate users, enforce permissions, and store data in a database. Schedules should remain private by default.

## TRMNL status

No device integration exists yet. A future browser preview will not by itself demonstrate a working integration.

Official references reviewed on 4 November 2026:

- [Private plugins](https://help.trmnl.com/en/articles/9510536-private-plugins): account setup requires the Developer add-on or BYOD licence.
- [Plugin strategies](https://help.trmnl.com/en/articles/17434705-plugin-strategies): polling and webhooks are available; polling can run every 15 minutes, or every 5 minutes with TRMNL+. Screen generation and device check-in affect when updates appear.
- [TRMNT challenge](https://trmnt.hackclub.com/): accepts projects for the TRMNL ecosystem. Its linked Get Started page could not be fetched, so detailed submission rules remain unverified.

Choose the integration after checking the full current challenge requirements. Keep credentials out of browser code and public Git history; do not expose schedules through an unprotected public endpoint. Check available challenge grants before considering paid licences or hardware.

## Learning and AI assistance

This initial HTML/CSS scaffold, JavaScript event-handler skeleton, and README were generated with AI assistance. The learner's first exercise is to implement task display and test it. Keep this attribution accurate as the project develops.

Hack Club rules differ by program. Verify TRMNT's current AI-use, originality, and time-tracking rules before submitting; this README does not establish eligibility. Track only genuine eligible work using the required tools. Do not fabricate hours, claim generated work as your own, or submit AI-written text as a personal journal.
