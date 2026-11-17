import { capacity, minutes } from './calendar-store.mjs';
import { storage } from './runtime.mjs';
import { addDays, weekDates, monthDates } from './calendar-view.mjs';
import { paintEvent } from './event-colors.mjs';
import { holidaysOn } from './holidays.mjs';
import { renderTimetable, updateNowLines } from './timetable-ui.mjs';
import { zonedNow, dateLabel, durationLabel } from './clock.mjs';
import { planningCapacity } from './scheduler.mjs';
import { activityVisual } from './activity-visuals.mjs';

export function initCalendar(model, handlers) {
  const $ = selector => document.querySelector(selector);
  const now = () => zonedNow(new Date(), model.getSettings().timeZone);
  let selected = now().date;
  const compactScreen = window.matchMedia('(max-width: 580px)');
  let view = compactScreen.matches ? 'day' : 'week';
  try { const saved = storage.getItem('day-compass.calendar-view.v1'); if (['day', 'week', 'month', 'year'].includes(saved)) view = saved; } catch {}
  let focusHour = 9, lastTimedKey = '', yearKey = '';
  // Year view scrolls through several years; more are added as you reach the top or bottom.
  let yearFrom = 0, yearTo = 0, yearExtending = false, yearJumping = false, yearLastTop = 0;
  function choose(date) { selected = date; render(); handlers.onSelection?.(); }
  // Like Google Calendar: tapping a date opens that day's full schedule (phones keep their agenda list).
  function openDay(date) {
    if (compactScreen.matches) { choose(date); return; }
    view = 'day'; try { storage.setItem('day-compass.calendar-view.v1', view); } catch { /* still opens */ }
    choose(date); $('#week-view')?.focus?.({ preventScroll: true });
  }
  function open(date, item, start) { choose(date); if (item?.kind !== 'break') handlers.onActivity({ date, item, start }); }
  // Month view: one long, scrollable list of months (like a phone calendar). More months load
  // as you scroll up or down; the title follows the month you're looking at.
  let monthFrom = '', monthTo = '', monthScrollTarget = '', extending = false, jumpScheduled = false;
  const addMonths = (month, n) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const monthTitle = month => dateLabel(`${month}-01`, { weekday: undefined, month: 'long', day: undefined, year: 'numeric' });
  function monthCell(date, settingsNow, dueOn) {
      const day = model.getDay(date), { ratio, booked } = planningCapacity(day, model.getSettings());
      const due = dueOn.get(date) || 0;
      const cell = document.createElement('div'); cell.className = 'month-cell';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-day'; button.textContent = Number(date.slice(-2));
      Object.assign(button.dataset, { date, color: day.color, load: ratio === 0 ? '0' : ratio <= 1 / 3 ? '1' : ratio <= 2 / 3 ? '2' : '3', due: due ? 'true' : 'false' });
      button.setAttribute('aria-pressed', String(date === selected));
      button.setAttribute('aria-label', `${dateLabel(date)}, ${day.commitments.length} activities, ${booked} minutes booked, ${due} deadlines. Open day.`);
      const markers = document.createElement('span'); markers.className = 'mobile-month-indicator'; markers.setAttribute('aria-hidden', 'true'); markers.textContent = day.commitments.length ? '•'.repeat(Math.min(3, day.commitments.length)) : ''; button.append(markers);
      if (date === now().date) button.setAttribute('aria-current', 'date');
      button.addEventListener('click', () => openDay(date)); cell.append(button);
      cell.addEventListener('click', event => { if (event.target === cell || event.target.classList.contains('holiday-name') || event.target.classList.contains('month-due')) openDay(date); });
      for (const name of holidaysOn(settingsNow, date)) { const tag = document.createElement('div'); tag.className = 'holiday-name'; tag.textContent = name; tag.title = name; cell.append(tag); cell.dataset.holiday = 'true'; }
      const events = [...day.commitments].sort((a, b) => minutes(a.start) - minutes(b.start));
      for (const item of events.slice(0, 3)) {
        const event = document.createElement(item.kind === 'break' ? 'div' : 'button');
        if (item.kind !== 'break') event.type = 'button';
        event.className = `month-event${item.completed ? ' completed' : ''}`; event.dataset.activity = activityVisual(item).kind; paintEvent(event, item); event.textContent = `${item.start} ${item.title}`; event.title = `${item.title}: ${item.start}–${item.end}`;
        if (item.kind !== 'break') event.addEventListener('click', () => open(date, item)); cell.append(event);
      }
      if (events.length > 3) { const more = document.createElement('button'); more.type = 'button'; more.className = 'month-more'; more.textContent = `+${events.length - 3} more`; more.addEventListener('click', () => { view = 'day'; choose(date); }); cell.append(more); }
      if (due) { const note = document.createElement('small'); note.className = 'month-due'; note.textContent = `${due} due`; cell.append(note); }
      return cell;
  }
  function renderMonth() {
    const scroller = $('#month-view'), host = $('#calendar-days'), month = selected.slice(0, 7);
    if (!monthFrom || month < monthFrom || month > monthTo) { monthFrom = addMonths(month, -2); monthTo = addMonths(month, 6); monthScrollTarget ||= month; }
    const keep = scroller.scrollTop, settingsNow = model.getSettings(), dueOn = new Map();
    for (const task of model.getTasks()) if (!task.completed && task.deadline) dueOn.set(task.deadline, (dueOn.get(task.deadline) || 0) + 1);
    host.replaceChildren();
    for (let m = monthFrom; m <= monthTo; m = addMonths(m, 1)) {
      const block = document.createElement('section'); block.className = 'month-block'; block.dataset.month = m;
      const heading = document.createElement('h4'); heading.className = 'month-block-title'; heading.textContent = monthTitle(m);
      const grid = document.createElement('div'); grid.className = 'calendar-days month-grid';
      const first = `${m}-01`, lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
      for (let i = 0; i < lead; i++) { const blank = document.createElement('div'); blank.className = 'month-cell month-blank'; blank.setAttribute('aria-hidden', 'true'); grid.append(blank); }
      for (let date = first; date.slice(0, 7) === m; date = addDays(date, 1)) grid.append(monthCell(date, settingsNow, dueOn));
      block.append(heading, grid); host.append(block);
    }
    scroller.scrollTop = keep;
    // A jump (Today, arrows, opening the view) waits until all redraws are done, then scrolls there.
    if (monthScrollTarget && !jumpScheduled) {
      jumpScheduled = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const target = $('#calendar-days').querySelector(`[data-month="${monthScrollTarget}"]`);
        if (target) scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - ($('#month-view .weekdays')?.offsetHeight || 0);
        monthScrollTarget = ''; jumpScheduled = false; followTitle();
      }));
    }
  }
  const MAX_MONTHS = 24;
  function visibleBlock() { const line = $('#month-view').getBoundingClientRect().top + 60; return [...$('#calendar-days').children].find(b => b.getBoundingClientRect().bottom > line); }
  // Redraw with a new range without the view jumping: keep the month you're looking at in place.
  function rerangeKeeping(from, to) {
    const scroller = $('#month-view'), anchor = visibleBlock(), month = anchor?.dataset.month, before = anchor?.getBoundingClientRect().top;
    monthFrom = from; monthTo = to; renderMonth();
    const again = month && $('#calendar-days').querySelector(`[data-month="${month}"]`);
    if (again) scroller.scrollTop += again.getBoundingClientRect().top - before;
  }
  function followTitle() {
    if (view !== 'month') return;
    const scroller = $('#month-view'), line = scroller.getBoundingClientRect().top + ($('#month-view .weekdays')?.offsetHeight || 0) + 40;
    const block = [...$('#calendar-days').children].find(b => b.getBoundingClientRect().bottom > line);
    if (block) $('#calendar-month').textContent = monthTitle(block.dataset.month);
  }
  $('#month-view').addEventListener('scroll', () => {
    if (view !== 'month' || extending || monthScrollTarget) return;
    followTitle();
    const scroller = $('#month-view');
    const nearTop = scroller.scrollTop < 250, nearEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 500;
    if (!nearTop && !nearEnd) return;
    extending = true;
    requestAnimationFrame(() => {
      const months = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + 1;
      if (nearTop) { const from = addMonths(monthFrom, -4); rerangeKeeping(from, months(from, monthTo) > MAX_MONTHS ? addMonths(from, MAX_MONTHS - 1) : monthTo); }
      else { const to = addMonths(monthTo, 4); rerangeKeeping(months(monthFrom, to) > MAX_MONTHS ? addMonths(to, -(MAX_MONTHS - 1)) : monthFrom, to); }
      extending = false;
    });
  }, { passive: true });
  // Whole year: twelve small months. Shading shows how booked each day is; tap a day to open it.
  function renderYear() {
    const host = $('#year-view'), year = selected.slice(0, 4), today = now().date;
    // The title becomes a year picker: jump to any year from two years back to ten years ahead.
    const picker = document.createElement('select'); picker.className = 'year-picker'; picker.setAttribute('aria-label', 'Choose a year');
    const thisYear = Number(today.slice(0, 4)), years = new Set([Number(year)]);
    for (let y = thisYear - 2; y <= thisYear + 10; y++) years.add(y);
    for (const y of [...years].sort((a, b) => a - b)) { const option = document.createElement('option'); option.value = option.textContent = String(y); option.selected = String(y) === year; picker.append(option); }
    picker.addEventListener('change', () => {
      const next = Number(picker.value), last = new Date(Date.UTC(next, Number(selected.slice(5, 7)), 0)).getUTCDate();
      selected = `${next}-${selected.slice(5, 7)}-${String(Math.min(Number(selected.slice(8, 10)), last)).padStart(2, '0')}`;
      render(); handlers.onSelection?.(); $('#calendar-month select')?.focus();
    });
    $('#calendar-month').replaceChildren(picker);
    const dueDates = new Set(model.getTasks().filter(task => !task.completed && task.deadline).map(task => task.deadline));
    const y = Number(year); if (!yearFrom || (yearKey !== year && (y < yearFrom || y > yearTo))) { yearFrom = y - 1; yearTo = y + 1; yearKey = ''; }
    const keep = host.scrollTop;
    host.replaceChildren();
    for (let shown = yearFrom; shown <= yearTo; shown++) {
    const heading = document.createElement('h4'); heading.className = 'year-block-title'; heading.dataset.year = String(shown); heading.textContent = String(shown); host.append(heading);
    for (let month = 1; month <= 12; month++) {
      const first = `${shown}-${String(month).padStart(2, '0')}-01`;
      const box = document.createElement('section'); box.className = 'year-month'; box.dataset.month = first.slice(0, 7);
      const title = document.createElement('button'); title.type = 'button'; title.className = 'year-month-title';
      title.textContent = dateLabel(first, { weekday: undefined, month: 'long', day: undefined, year: undefined });
      title.setAttribute('aria-label', `Open ${dateLabel(first, { weekday: undefined, month: 'long', day: undefined, year: 'numeric' })}`);
      title.addEventListener('click', () => { view = 'month'; monthScrollTarget = first.slice(0, 7); try { storage.setItem('day-compass.calendar-view.v1', view); } catch {} choose(first); });
      if (first.slice(0, 7) === today.slice(0, 7)) box.classList.add('current');
      const grid = document.createElement('div'); grid.className = 'year-days';
      for (const letter of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) { const head = document.createElement('span'); head.className = 'year-weekday'; head.textContent = letter; head.setAttribute('aria-hidden', 'true'); grid.append(head); }
      for (const date of monthDates(first)) {
        if (date.slice(0, 7) !== first.slice(0, 7)) { const blank = document.createElement('span'); blank.className = 'year-blank'; grid.append(blank); continue; }
        const day = model.getDay(date), span = Math.max(60, minutes(day.end) - minutes(day.start));
        const ratio = Math.min(1, day.commitments.reduce((sum, item) => sum + Math.max(0, minutes(item.end) - minutes(item.start)), 0) / span);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'year-day'; button.textContent = Number(date.slice(-2));
        Object.assign(button.dataset, { date, load: !day.commitments.length ? '0' : ratio <= 1 / 3 ? '1' : ratio <= 2 / 3 ? '2' : '3', due: dueDates.has(date) ? 'true' : 'false' });
        button.setAttribute('aria-label', `${dateLabel(date, { year: 'numeric' })}, ${day.commitments.length} activities${dueDates.has(date) ? ', deadline' : ''}. Open day.`);
        if (date === today) button.setAttribute('aria-current', 'date');
        if (date === selected) button.setAttribute('aria-pressed', 'true');
        const holiday = holidaysOn(model.getSettings(), date); if (holiday.length) { button.dataset.holiday = 'true'; button.title = holiday.join(' · '); }
        button.addEventListener('click', () => { view = 'day'; try { storage.setItem('day-compass.calendar-view.v1', view); } catch {} lastTimedKey = ''; choose(date); });
        grid.append(button);
      }
      box.append(title, grid); host.append(box);
    }
    }
    host.scrollTop = keep;
    // When the year view opens (or you pick a year), start at the selected month.
    if (yearKey !== year) {
      yearKey = year; yearJumping = true;
      requestAnimationFrame(() => {
        const target = host.querySelector(`[data-month="${selected.slice(0, 7)}"]`);
        if (target) host.scrollTop += target.getBoundingClientRect().top - host.getBoundingClientRect().top - 6;
        yearLastTop = host.scrollTop; followYear();
        requestAnimationFrame(() => { yearJumping = false; });
      });
    }
  }
  // The year picker in the title follows the year you're scrolling through.
  function followYear() {
    if (view !== 'year') return;
    const host = $('#year-view'), line = host.getBoundingClientRect().top + 80;
    const headings = [...host.querySelectorAll('.year-block-title')];
    const current = headings.filter(h => h.getBoundingClientRect().top <= line).at(-1) || headings[0];
    const picker = $('#calendar-month select');
    if (current && picker && picker.value !== current.dataset.year) {
      if (![...picker.options].some(o => o.value === current.dataset.year)) picker.append(Object.assign(document.createElement('option'), { value: current.dataset.year, textContent: current.dataset.year }));
      picker.value = current.dataset.year;
    }
  }
  function rerangeYears(from, to) {
    const host = $('#year-view'), line = host.getBoundingClientRect().top;
    const anchor = [...host.querySelectorAll('.year-month')].find(b => b.getBoundingClientRect().bottom > line), month = anchor?.dataset.month, before = anchor?.getBoundingClientRect().top;
    yearFrom = from; yearTo = to; renderYear();
    const again = month && host.querySelector(`[data-month="${month}"]`);
    if (again) host.scrollTop += again.getBoundingClientRect().top - before;
  }
  $('#year-view').addEventListener('scroll', () => {
    const host = $('#year-view'), top = host.scrollTop, goingUp = top < yearLastTop; yearLastTop = top;
    if (view !== 'year' || yearExtending || yearJumping) return;
    followYear();
    const nearTop = goingUp && top < 200, nearEnd = !goingUp && host.scrollHeight - top - host.clientHeight < 400;
    if (!nearTop && !nearEnd) return;
    yearExtending = true;
    requestAnimationFrame(() => {
      // Keep at most four years drawn so it stays fast.
      if (nearTop && yearFrom > 1971) rerangeYears(yearFrom - 1, Math.min(yearTo, yearFrom + 2));
      else if (nearEnd && yearTo < 2200) rerangeYears(Math.max(yearFrom, yearTo - 2), yearTo + 1);
      yearLastTop = host.scrollTop;
      requestAnimationFrame(() => { yearExtending = false; });
    });
  }, { passive: true });
  function renderMobileWeek() {
    const strip = $('#mobile-week-days'); strip.replaceChildren();
    for (const date of weekDates(selected)) {
      const day = model.getDay(date), stats = planningCapacity(day, model.getSettings());
      const button = document.createElement('button'); button.type = 'button'; button.className = 'mobile-week-day';
      Object.assign(button.dataset, { date, color: day.color, load: stats.ratio === 0 ? '0' : stats.ratio <= 1 / 3 ? '1' : stats.ratio <= 2 / 3 ? '2' : '3' });
      button.setAttribute('aria-pressed', String(date === selected));
      button.setAttribute('aria-label', `${dateLabel(date)}, ${day.commitments.length} activities, ${stats.free} minutes free. Show timeline.`);
      if (date === now().date) button.setAttribute('aria-current', 'date');
      const weekday = document.createElement('span'); weekday.textContent = dateLabel(date, { weekday: 'short', month: undefined, day: undefined });
      const number = document.createElement('strong'); number.textContent = Number(date.slice(-2));
      button.append(weekday, number);
      button.addEventListener('click', () => { choose(date); [...strip.querySelectorAll('button')].find(node => node.dataset.date === date)?.focus(); }); strip.append(button);
    }
  }
  function renderMobileAgenda() {
    const holidayToday = holidaysOn(model.getSettings(), selected);
    $('#mobile-agenda-heading').textContent = holidayToday.length ? `${dateLabel(selected)} · ${holidayToday.join(' · ')}` : dateLabel(selected);
    const list = $('#mobile-agenda-list'); list.replaceChildren();
    const activities = model.getDay(selected).commitments.sort((a, b) => minutes(a.start) - minutes(b.start));
    $('#mobile-agenda-empty').textContent = activities.length ? '' : 'A clear day. Tap + Add to plan something.';
    for (const item of activities) {
      const li = document.createElement('li');
      const entry = document.createElement(item.kind === 'break' ? 'div' : 'button');
      entry.className = `mobile-agenda-entry${item.completed ? ' completed' : ''}`;
      const visual = activityVisual(item); entry.dataset.activity = visual.kind; paintEvent(entry, item);
      if (item.kind !== 'break') { entry.type = 'button'; entry.setAttribute('aria-label', `Edit ${item.title}, ${item.start} to ${item.end}`); entry.addEventListener('click', () => open(selected, item)); }
      const time = document.createElement('span'); time.className = 'mobile-agenda-time'; time.textContent = `${item.start}–${item.end}`;
      const title = document.createElement('strong'); title.className = 'task-title'; title.textContent = item.title;
      const icon = document.createElement('span'); icon.className = 'agenda-activity-mark'; icon.textContent = visual.icon; icon.setAttribute('aria-hidden', 'true');
      entry.append(time, title, icon); li.append(entry); list.append(li);
    }
  }
  function render() {
    const compact = compactScreen.matches;
    const dates = view === 'day' ? [selected] : weekDates(selected);
    const shortDate = date => dateLabel(date, { weekday: undefined, year: undefined });
    $('#calendar-month').textContent = view === 'year' ? selected.slice(0, 4) : view === 'month' ? dateLabel(selected, { weekday: undefined, month: 'long', day: undefined, year: 'numeric' }) : view === 'day' ? dateLabel(selected, { year: compact ? undefined : 'numeric' }) : compact ? `${shortDate(dates[0])} – ${shortDate(dates[6])}` : `${dateLabel(dates[0])} – ${dateLabel(dates[6], { year: 'numeric' })}`;
    $('#previous-period').setAttribute('aria-label', `Previous ${view}`); $('#next-period').setAttribute('aria-label', `Next ${view}`);
    document.querySelectorAll('[data-calendar-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.calendarView === view)));
    $('#month-view').hidden = view !== 'month'; $('#year-view').hidden = view !== 'year'; $('#week-view').hidden = view === 'month' || view === 'year';
    $('#mobile-week-days').hidden = !compact || view === 'month' || view === 'year';
    $('#mobile-month-agenda').hidden = !compact || view === 'week' || view === 'year';
    $('#calendar-timezone').textContent = `Times in ${model.getSettings().timeZone}`;
    $('#calendar-instructions').textContent = compact ? view === 'month' ? 'Tap a date to see its activities below. Dots mark activities.' : view === 'week' ? 'Choose a day above its timeline. Tap a time to add an activity.' : 'Tap a time to add, or an activity to edit.' : view === 'month' ? 'Select a date for its agenda. Click an activity to edit it.' : 'Click a time to add an activity. Arrow keys move between slots. Hatched areas are outside planning hours.';
    if (compact && !['month', 'year'].includes(view)) renderMobileWeek();
    if (compact && !['week', 'year'].includes(view)) { renderMobileAgenda(); if (view === 'day') $('#week-view').before($('#mobile-month-agenda')); else $('#month-view').after($('#mobile-month-agenda')); }
    if (view !== 'year') yearKey = '';
    if (view === 'month') renderMonth();
    else if (view === 'year') renderYear();
    else {
      renderTimetable($('#week-grid'), { dates: compact && view === 'week' ? [selected] : dates, selected, focusHour, getHoliday: date => holidaysOn(model.getSettings(), date), timeZone: model.getSettings().timeZone, getDay: model.getDay, getTasks: model.getTasks, getCapacity: day => planningCapacity(day, model.getSettings()),
        onSelect: date => view === 'week' ? openDay(date) : choose(date), onAdd: (date, start) => open(date, null, start), onEdit: (date, item) => open(date, item),
        onNavigate: (date, hour) => { focusHour = hour; choose(date); [...document.querySelectorAll('.time-slot')].find(node => node.dataset.date === date && Number(node.dataset.hour) === hour)?.focus(); }
      });
      // Reposition only when the date/view changes, never on an ordinary task update.
      const timedKey = `${selected}|${view}|${compact}`;
      if (timedKey !== lastTimedKey) {
        const first = model.getDay(selected).commitments.sort((a, b) => minutes(a.start) - minutes(b.start))[0];
        const target = selected === now().date ? Math.max(0, now().minute - 60) : first ? Math.max(0, minutes(first.start) - 30) : minutes(model.getDay(selected).start);
        $('#week-view').scrollTop = target; lastTimedKey = timedKey;
      }
    }
    const day = model.getDay(selected), stats = planningCapacity(day, model.getSettings());
    $('#selected-day').textContent = dateLabel(selected, { year: 'numeric' });
    $('#day-hours').textContent = `Planning: ${day.start}–${day.end} · ${model.getSettings().timeZone}`;
    $('#day-capacity').textContent = `${durationLabel(stats.booked)} booked · ${durationLabel(stats.free)} free${stats.blockedSleep ? ` · ${durationLabel(stats.blockedSleep)} reserved for sleep` : ''}`;
    $('#capacity-fill').style.width = `${stats.ratio * 100}%`;
    const list = $('#day-commitments'); list.replaceChildren();
    for (const item of [...day.commitments].sort((a, b) => minutes(a.start) - minutes(b.start))) {
      const li = document.createElement('li'); if (item.completed) li.className = 'completed';
      const title = document.createElement('span'); title.className = 'task-content task-title'; title.textContent = `${item.start}–${item.end} · ${item.title}${item.locked ? ' [locked]' : ''}${item.completed ? ' [completed]' : ''}`; li.append(title);
      if (item.kind !== 'break') { const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'secondary'; edit.textContent = 'Edit'; edit.setAttribute('aria-label', `Edit ${item.title}`); edit.addEventListener('click', () => open(selected, item)); li.append(edit); }
      list.append(li);
    }
    if (!day.commitments.length) { const empty = document.createElement('li'); empty.textContent = 'Nothing planned yet. Add an activity or generate a plan.'; list.append(empty); }
    const due = model.getTasks().filter(task => !task.completed && task.deadline && task.deadline <= selected);
    $('#day-deadlines').textContent = due.length ? `Due or overdue: ${due.map(task => `${task.title} (${task.deadline})`).join(', ')}` : 'No incomplete deadlines on or before this date.';
  }
  for (const id of ['#calendar-add', '#setup-day']) $(id).addEventListener('click', () => open(selected));
  $('#mobile-agenda-add').addEventListener('click', () => open(selected));
  $('#edit-day-hours').addEventListener('click', () => handlers.onHours(selected));
  document.querySelectorAll('[data-calendar-view]').forEach(button => button.addEventListener('click', () => { view = button.dataset.calendarView; if (view === 'month') monthScrollTarget = selected.slice(0, 7); render(); try { storage.setItem('day-compass.calendar-view.v1', view); } catch { $('#calendar-status').textContent = 'View changed but the preference could not be saved.'; } }));
  for (const [id, direction] of [['#previous-period', -1], ['#next-period', 1]]) $(id).addEventListener('click', () => {
    if (view === 'year') { const year = Number(selected.slice(0, 4)) + direction, last = new Date(Date.UTC(year, Number(selected.slice(5, 7)), 0)).getUTCDate(); selected = `${year}-${selected.slice(5, 7)}-${String(Math.min(Number(selected.slice(8, 10)), last)).padStart(2, '0')}`; }
    else if (view === 'month') { monthScrollTarget = 'pending'; const d = new Date(`${selected}T12:00:00`), last = new Date(d.getFullYear(), d.getMonth() + direction + 1, 0).getDate(); selected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d.getDate(), last)).padStart(2, '0')}`; const moved = new Date(d.getFullYear(), d.getMonth() + direction, Math.min(d.getDate(), last), 12); selected = `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-${String(moved.getDate()).padStart(2, '0')}`; }
    else selected = addDays(selected, direction * (view === 'week' ? 7 : 1));
    if (monthScrollTarget === 'pending') monthScrollTarget = selected.slice(0, 7);
    render(); handlers.onSelection?.();
  });
  $('#calendar-today').addEventListener('click', () => { if (view === 'month') monthScrollTarget = now().date.slice(0, 7); choose(now().date); });
  compactScreen.addEventListener('change', () => { lastTimedKey = ''; render(); });
  // Event colours are worked out for light or dark mode, so redraw when that changes.
  new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
  document.addEventListener('holidays-updated', () => render());
  setInterval(() => { if (!document.hidden && !['month', 'year'].includes(view)) updateNowLines($('#week-grid')); }, 60000);
  render();
  return { getSelectedDate: () => selected, selectDate: choose, refresh: render };
}
