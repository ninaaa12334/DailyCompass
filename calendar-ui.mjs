import { createCalendarStore, dateKey, capacity, minutes } from './calendar-store.mjs';

export function initCalendar(getTasks) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#day-dialog');
  const settings = $('#day-settings-form');
  const commitmentForm = $('#commitment-form');
  let selected = dateKey(new Date());
  let month = new Date(`${selected.slice(0, 7)}-01T12:00:00`);
  let editingId = null;
  let store;
  const formatDate = date => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  try { store = createCalendarStore(window.localStorage); }
  catch {
    $('#calendar-error').hidden = false;
    $('#calendar-error').textContent = 'Your saved calendar could not be read. Nothing has been overwritten. Check browser storage permissions or ask for help recovering the saved data.';
    $('#setup-day').disabled = true;
    return;
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
    $('#save-commitment').textContent = 'Add commitment';
    $('#cancel-commitment').hidden = true;
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
        const actions = document.createElement('div');
        actions.className = 'task-actions';
        for (const label of ['Edit', 'Remove']) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'secondary';
          button.textContent = label;
          button.setAttribute('aria-label', `${label} ${item.title}`);
          button.addEventListener('click', () => {
            if (label === 'Edit') {
              editingId = item.id;
              for (const field of ['title', 'start', 'end']) commitmentForm.elements.namedItem(field).value = item[field];
              $('#save-commitment').textContent = 'Save commitment';
              $('#cancel-commitment').hidden = false;
              $('#commitment-title').focus();
            } else if (action(() => store.removeCommitment(selected, item.id), 'Commitment removed.')) {
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
      const empty = document.createElement('li');
      empty.textContent = 'No fixed commitments yet.';
      target.append(empty);
    }
  }

  function render() {
    const tasks = getTasks();
    $('#calendar-month').textContent = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const grid = $('#calendar-days');
    grid.replaceChildren();
    const offset = (month.getDay() + 6) % 7; // Monday is the first column.
    for (let i = 0; i < offset; i++) {
      const blank = document.createElement('span');
      blank.setAttribute('aria-hidden', 'true');
      grid.append(blank);
    }
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
      const date = dateKey(new Date(month.getFullYear(), month.getMonth(), dayNumber));
      const day = store.getDay(date);
      const { ratio, booked } = capacity(day);
      const due = tasks.filter(task => task.deadline === date && !task.completed).length;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      button.textContent = dayNumber;
      button.dataset.color = day.color;
      button.dataset.load = ratio === 0 ? '0' : ratio <= 1 / 3 ? '1' : ratio <= 2 / 3 ? '2' : '3';
      button.dataset.due = due ? 'true' : 'false';
      button.setAttribute('aria-pressed', String(date === selected));
      button.setAttribute('aria-label', `${formatDate(date)}. ${booked} minutes booked within planning hours. ${due} incomplete task deadlines.`);
      if (date === dateKey(new Date())) button.setAttribute('aria-current', 'date');
      button.addEventListener('click', () => {
        selected = date;
        render();
        $('#calendar-days button[aria-pressed="true"]').focus();
      });
      grid.append(button);
    }
    const day = store.getDay(selected);
    document.body.dataset.color = day.color;
    const { booked, free, ratio } = capacity(day);
    $('#selected-day').textContent = formatDate(selected);
    $('#day-capacity').textContent = `${booked} min booked · ${free} min unbooked`;
    $('#capacity-fill').style.width = `${ratio * 100}%`;
    $('#day-hours').textContent = `Planning hours: ${day.start}–${day.end}`;
    renderCommitments($('#day-commitments'));
    const due = tasks.filter(task => task.deadline === selected && !task.completed);
    $('#day-deadlines').textContent = due.length ? `Due this day: ${due.map(task => task.title).join(', ')}` : 'No incomplete tasks due this day.';
  }

  $('#setup-day').addEventListener('click', () => {
    const day = store.getDay(selected);
    $('#setup-date-label').textContent = formatDate(selected);
    for (const field of ['start', 'end', 'color']) settings.elements.namedItem(field).value = day[field];
    resetCommitment();
    $('#setup-error').hidden = true;
    $('#setup-feedback').textContent = 'Changes save when you use the save or add buttons.';
    renderCommitments($('#setup-commitments'), true);
    dialog.showModal();
  });
  $('#close-day-dialog').addEventListener('click', () => dialog.close());
  settings.addEventListener('submit', event => {
    event.preventDefault();
    action(() => store.setHours(selected, Object.fromEntries(new FormData(settings))), 'Planning hours and colour saved for this day.');
  });
  commitmentForm.addEventListener('submit', event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(commitmentForm));
    fields.title = fields.title.trim();
    const item = { ...fields, id: editingId ?? crypto.randomUUID() };
    if (action(() => store.saveCommitment(selected, item), editingId ? 'Commitment updated.' : 'Commitment added.')) {
      resetCommitment();
      $('#commitment-title').focus();
    }
  });
  $('#cancel-commitment').addEventListener('click', () => { resetCommitment(); $('#commitment-title').focus(); });
  for (const [selector, direction] of [['#previous-month', -1], ['#next-month', 1]]) {
    $(selector).addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() + direction, 1, 12); render(); });
  }
  $('#calendar-today').addEventListener('click', () => {
    selected = dateKey(new Date());
    month = new Date(`${selected.slice(0, 7)}-01T12:00:00`);
    render();
  });
  document.addEventListener('tasks-changed', render);
  render();
}
