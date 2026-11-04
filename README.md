# Day Compass

A personal daily planner, built one small lesson at a time. A separate TRMNL dashboard is planned for later.

## Run the starter

Open `index.html` in a browser. No packages, accounts, or paid services are required.

This is a standalone learning project even though its local folder is inside a WordPress theme. It does not need WordPress to run.

## Lesson 1: add and display a task

This milestone implements adding task titles and displaying them, with an iPhone-widget-inspired layout: rounded floating cards, soft shadows, a local date widget, and a task-count badge. Saving, completion, and scheduling are not implemented yet.

- `index.html` defines the page and form. `defer` runs the script after the HTML has been read.
- `styles.css` controls appearance and allows the form to wrap on narrow screens.
- `app.js` finds the elements, handles submission, and rejects spaces-only titles.
- `preventDefault()` prevents normal form submission from reloading the page.
- `trim()` removes spaces from the beginning and end of the input.

Read the submit listener in `app.js` and follow these steps:

1. `document.createElement('li')` creates a list item. A span inside holds the title.
2. `textContent` assigns plain text, keeping typed HTML from becoming page markup.
3. `taskList.append(item)` attaches the item to the visible list.
4. The number of list children updates the task-count badge.
5. `taskForm.reset()` clears the input, and `focus()` returns the cursor to it.

Your small exercise: change the initial empty-list message to your own wording in `index.html`. Then explain why `reset()` belongs after reading and validating the title. Try this before the next feature.

### Test your attempt

- Add `Practise algebra`: one task should appear without a page reload.
- Add a second task using Enter: both should remain visible.
- Check that the task count becomes 2 and the input clears after adding.
- Submit an empty title: the browser should require a value.
- Submit spaces only: a message should appear and no item should be added.
- Enter `<strong>Hello</strong>`: it should appear literally, rather than as bold HTML.
- Try a narrow browser window: the input and button should fit.
- Refresh: tasks will disappear at this stage. Persistence is a later lesson.

Send your test results and explanation for review before moving to the next lesson. JavaScript syntax checks pass. The browser preview tool was unavailable during this milestone, so visual and real-browser interaction testing remain pending.

## Next milestones

1. Test and understand adding task titles (implemented in this milestone).
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

The initial scaffold, widget styling, task-display implementation, and README were generated with AI assistance. The learner's next exercise is to test and explain the implementation and make a small wording change. Keep this attribution accurate as the project develops.

Hack Club rules differ by program. Verify TRMNT's current AI-use, originality, and time-tracking rules before submitting; this README does not establish eligibility. Track only genuine eligible work using the required tools. Do not fabricate hours, claim generated work as your own, or submit AI-written text as a personal journal.
