import { createCalendarStore, dateKey, capacity, minutes } from './calendar-store.mjs';
import { storage } from './runtime.mjs';
import { addDays, weekDates, monthDates, timeLabel } from './calendar-view.mjs';
import { renderTimetable, updateNowLines } from './timetable-ui.mjs';

export function initCalendar(getTasks) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#day-dialog');
  const settings = $('#day-settings-form');
  const commitmentForm = $('#commitment-form');
  let selected = dateKey(new Date());
  let view = window.matchMedia('(max-width: 580px)').matches ? 'day' : 'week';
  const viewStorageKey = 'day-compass.calendar-view.v1';
  const allowedViews = ['day', 'week', 'month'];
  let focusHour = 9;
  let editingId = null;
  let returnFocus = null;
  let scrollInitialized = false;
  let store;
  const formatDate = date => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  try { store = createCalendarStore(storage); }
  catch {
    $('#calendar-error').hidden = false;
    $('#calendar-error').textContent = 'Your saved calendar could not be read. Nothing has been overwritten. Check browser storage permissions or ask for help recovering the saved data.';
    $('#setup-day').disabled = true;
    document.querySelectorAll('.calendar-widget button').forEach(button => { button.disabled = true; });
    return;
  }

  // A saved preference wins over the phone/desktop default, if it is valid.
  try {
    const savedView = storage.getItem(viewStorageKey);
    if (allowedViews.includes(savedView)) view = savedView;
  } catch {
    $('#calendar-status').textContent = 'Could not read your preferred view. Using the default for this screen.';
  }

  function action(callback, message) {
    try {
      callback();
      $('#setup-error').hidden = true;
      $('#setup-feedback').textContent = message;
      $('#calendar-status').textContent = message;
      render();
      renderCommitments($('#setup-commitments'), true);
      return true;
    } catch (error) {
      $('#setup-error').hidden = false;
      $('#setup-error').textContent = error instanceof Error && error.name === 'Error' ? error.message : 'Could not save. Check browser storage permissions or available space.';
      return false;
    }
  }

  function resetCommitment() {
    editingId = null;
    commitmentForm.reset();
    $('#commitment-date').value = selected;
    $('#save-commitment').textContent = 'Add commitment';
    $('#cancel-commitment').hidden = true;
  }

  function editCommitment(item) {
    editingId = item.id;
    for (const field of ['title', 'start', 'end']) commitmentForm.elements.namedItem(field).value = item[field];
    $('#commitment-date').value = selected;
    $('#save-commitment').textContent = 'Save commitment';
    $('#cancel-commitment').hidden = false;
    $('#commitment-title').focus();
  }

  function loadSettings() {
    const day = store.getDay(selected);
    $('#setup-date-label').textContent = formatDate(selected);
    for (const field of ['start', 'end', 'color']) settings.elements.namedItem(field).value = day[field];
  }

  function openDay(date = selected, options = {}) {
    selected = date;
    if (options.start !== undefined) focusHour = Math.floor(options.start / 60);
    returnFocus = options.item ? { id: options.item.id } : options.start !== undefined ? { date, hour: focusHour } : null;
    render();
    loadSettings();
    resetCommitment();
    if (options.start !== undefined) {
      $('#commitment-start').value = timeLabel(options.start);
      $('#commitment-end').value = timeLabel(Math.min(1439, options.start + 60));
    }
    $('#setup-error').hidden = true;
    $('#setup-feedback').textContent = 'Use Save day settings or Add commitment to save. Activity dates can be changed below.';
    renderCommitments($('#setup-commitments'), true);
    dialog.showModal();
    if (options.item) editCommitment(options.item);
    else $('#commitment-title').focus();
  }

  function renderCommitments(target, editable = false) {
    target.replaceChildren();
    const items = store.getDay(selected).commitments.sort((a, b) => minutes(a.start) - minutes(b.start));
    for (const item of items) {
      const row = document.createElement('li');
      const text = document.createElement('span');
      text.className = 'task-content';
      text.textContent = `${item.start}–${item.end} · ${item.title}`;
      row.append(text);
      if (editable) {
        const actions = document.createElement('div'); actions.className = 'task-actions';
        for (const label of ['Edit', 'Remove']) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'secondary'; button.textContent = label;
          button.setAttribute('aria-label', `${label} ${item.title}`);
          button.addEventListener('click', () => {
            if (label === 'Edit') editCommitment(item);
            else if (action(() => store.removeCommitment(selected, item.id), 'Commitment removed.')) {
              if (editingId === item.id) resetCommitment();
              $('#commitment-title').focus();
            }
          });
          actions.append(button);
        }
        row.append(actions);
      }
      target.append(row);
    }
    if (!items.length) {
      const empty = document.createElement('li'); empty.textContent = 'No fixed commitments yet. Pick a time in the calendar to add one.'; target.append(empty);
    }
  }

  function focusDate(date) {
    const button = [...document.querySelectorAll(view === 'month' ? '.calendar-day' : '.week-day-heading')].find(node => node.dataset.date === date);
    button?.focus();
  }

  function selectDate(date) { selected = date; render(); focusDate(date); }

  function renderMonth(tasks) {
    const grid = $('#calendar-days'); grid.replaceChildren();
    for (const date of monthDates(selected)) {
      const day = store.getDay(date);
      const { ratio, booked } = capacity(day);
      const due = tasks.filter(task => task.deadline === date && !task.completed).length;
      const cell = document.createElement('div'); cell.className = 'month-cell';
      if (date.slice(0, 7) !== selected.slice(0, 7)) cell.classList.add('other-month');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'calendar-day'; button.textContent = Number(date.slice(-2));
      button.dataset.date = date; button.dataset.color = day.color;
      button.dataset.load = ratio === 0 ? '0' : ratio <= 1 / 3 ? '1' : ratio <= 2 / 3 ? '2' : '3';
      button.dataset.due = due ? 'true' : 'false';
      button.setAttribute('aria-pressed', String(date === selected));
      button.setAttribute('aria-label', `${formatDate(date)}. ${booked} minutes booked, ${due} incomplete task deadlines. Select day.`);
      if (date === dateKey(new Date())) button.setAttribute('aria-current', 'date');
      button.addEventListener('click', () => selectDate(date));
      cell.append(button);
      const events = [...day.commitments].sort((a, b) => minutes(a.start) - minutes(b.start));
      for (const item of events.slice(0, 3)) {
        const event = document.createElement('button');
        event.type = 'button'; event.className = 'month-event'; event.dataset.eventId = item.id;
        event.textContent = `${item.start} ${item.title}`; event.title = `${item.title}, ${item.start}–${item.end}`;
        event.setAttribute('aria-label', `Edit ${item.title} on ${date}, ${item.start} to ${item.end}`);
        event.addEventListener('click', () => openDay(date, { item })); cell.append(event);
      }
      if (events.length > 3) {
        const more = document.createElement('button'); more.type = 'button'; more.className = 'month-more'; more.textContent = `+${events.length - 3} more`;
        more.addEventListener('click', () => { selected = date; view = 'day'; render(); }); cell.append(more);
      }
      if (due) { const badge = document.createElement('small'); badge.className = 'month-due'; badge.textContent = `${due} due`; cell.append(badge); }
      grid.append(cell);
    }
  }

  function render() {
    const tasks = getTasks();
    const dates = view === 'day' ? [selected] : weekDates(selected);
    const short = date => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    $('#calendar-month').textContent = view === 'month' ? new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : view === 'day' ? formatDate(selected) : `${short(dates[0])} – ${short(dates[6])}, ${dates[6].slice(0, 4)}`;
    $('#previous-period').setAttribute('aria-label', `Previous ${view}`);
    $('#next-period').setAttribute('aria-label', `Next ${view}`);
    document.querySelectorAll('[data-calendar-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.calendarView === view)));
    $('#month-view').hidden = view !== 'month'; $('#week-view').hidden = view === 'month';
    $('#calendar-instructions').textContent = view === 'month' ? 'Select a date to see its agenda below, or click an event to edit it.' : 'Click a time to add an activity; click an event to edit. Arrow keys move between time slots. Hatched areas are outside planning hours. Swipe sideways in Week view on small screens.';
    if (view === 'month') renderMonth(tasks);
    else {
      renderTimetable($('#week-grid'), { dates, selected, focusHour, getDay: store.getDay, getTasks, onSelect: selectDate, onAdd: (date, start) => openDay(date, { start }), onEdit: (date, item) => openDay(date, { item }), onNavigate: (date, hour) => {
        selected = date; focusHour = hour; render();
        [...document.querySelectorAll('.time-slot')].find(slot => slot.dataset.date === date && Number(slot.dataset.hour) === hour)?.focus();
      } });
      if (!scrollInitialized) { $('#week-view').scrollTop = 7 * 60; scrollInitialized = true; }
    }
    const day = store.getDay(selected);
    const { booked, free, ratio } = capacity(day);
    $('#selected-day').textContent = formatDate(selected);
    $('#day-capacity').textContent = `${booked} min booked · ${free} min unbooked`;
    $('#capacity-fill').style.width = `${ratio * 100}%`;
    $('#day-hours').textContent = `Planning hours: ${day.start}–${day.end}`;
    renderCommitments($('#day-commitments'));
    const due = tasks.filter(task => task.deadline === selected && !task.completed);
    $('#day-deadlines').textContent = due.length ? `Due this day: ${due.map(task => task.title).join(', ')}` : 'No incomplete tasks due this day.';
    document.dispatchEvent(new Event('calendar-changed'));
  }

  for (const id of ['#setup-day', '#calendar-add']) $(id).addEventListener('click', () => openDay());
  $('#close-day-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    const visibleView = view === 'month' ? $('#calendar-days') : $('#week-grid');
    const target = returnFocus?.id ? [...visibleView.querySelectorAll('[data-event-id]')].find(node => node.dataset.eventId === returnFocus.id) : returnFocus?.date ? [...visibleView.querySelectorAll('.time-slot')].find(node => node.dataset.date === returnFocus.date && Number(node.dataset.hour) === returnFocus.hour) : null;
    (target ?? $('#calendar-add')).focus();
  });
  settings.addEventListener('submit', event => {
    event.preventDefault(); action(() => store.setHours(selected, Object.fromEntries(new FormData(settings))), 'Planning hours and colour saved for this day.');
  });
  commitmentForm.addEventListener('submit', event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(commitmentForm));
    const targetDate = fields.date; delete fields.date;
    fields.title = fields.title.trim();
    const item = { ...fields, id: editingId ?? crypto.randomUUID() };
    if (action(() => {
      if (editingId) store.moveCommitment(selected, targetDate, item);
      else store.saveCommitment(targetDate, item);
      selected = targetDate;
    }, editingId ? 'Activity updated.' : 'Activity added.')) {
      loadSettings(); resetCommitment(); $('#commitment-title').focus();
    }
  });
  $('#cancel-commitment').addEventListener('click', () => { resetCommitment(); $('#commitment-title').focus(); });
  for (const [selector, direction] of [['#previous-period', -1], ['#next-period', 1]]) {
    $(selector).addEventListener('click', () => {
      if (view === 'month') {
        const current = new Date(`${selected}T12:00:00`);
        const last = new Date(current.getFullYear(), current.getMonth() + direction + 1, 0).getDate();
        selected = dateKey(new Date(current.getFullYear(), current.getMonth() + direction, Math.min(current.getDate(), last), 12));
      } else selected = addDays(selected, view === 'week' ? direction * 7 : direction);
      render();
    });
  }
  document.querySelectorAll('[data-calendar-view]').forEach(button => button.addEventListener('click', () => {
    view = button.dataset.calendarView;
    render();
    try {
      storage.setItem(viewStorageKey, view);
      $('#calendar-status').textContent = `${button.textContent} view saved for your next visit.`;
    } catch {
      // The switch still works even when browser storage is unavailable or full.
      $('#calendar-status').textContent = 'View changed for now, but your preference could not be saved. Check browser storage permissions or available space.';
    }
  }));
  $('#calendar-today').addEventListener('click', () => { selected = dateKey(new Date()); render(); });
  document.addEventListener('tasks-changed', render);
  setInterval(() => { if (!document.hidden && view !== 'month') updateNowLines($('#week-grid')); }, 60000);
  render();
  return { getDay: store.getDay, getSelectedDate: () => selected };
}
