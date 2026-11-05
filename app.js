import { createTaskStore } from './task-store.mjs';

import { initCalendar } from './calendar-ui.mjs';
import { initDashboard } from './dashboard-summary.mjs';
import { storage, isDemo } from './runtime.mjs';
import { seedDemo } from './demo.mjs';

const form = document.querySelector('#task-form');
const titleInput = document.querySelector('#task-title');
const list = document.querySelector('#task-list');
const status = document.querySelector('#task-status');
const count = document.querySelector('#task-count');
const filter = document.querySelector('#task-filter');
const saveButton = document.querySelector('#save-task');
const cancelButton = document.querySelector('#cancel-edit');
const storageError = document.querySelector('#storage-error');
let editingId = null;
let store;

function showError(message) {
  storageError.textContent = message;
  storageError.hidden = false;
}

try {
  if (isDemo) seedDemo(storage);
  store = createTaskStore(storage);
} catch {
  // Keep unreadable data intact rather than silently replacing it with an empty list.
  showError('Saved tasks could not be read. Nothing has been overwritten. Check browser storage permissions; if needed, ask for help recovering the saved data.');
  for (const control of form.elements) control.disabled = true;
}

if (isDemo) {
  const banner = document.querySelector('#planner-mode');
  banner.textContent = 'Sample demo · Changes stay separate from your personal planner. ';
  const link = document.createElement('a');
  link.href = 'dashboard.html'; link.textContent = 'Open my planner';
  banner.append(link);
  document.querySelector('#task-help').textContent = 'Sample tasks save only in this demo tab’s session.';
}

function resetEditor() {
  editingId = null;
  form.reset();
  saveButton.textContent = 'Add task';
  cancelButton.hidden = true;
}

function mutate(action, message) {
  try {
    action();
    storageError.hidden = true;
    render();
    status.textContent = message;
    return true;
  } catch {
    showError('Your change could not be saved. Check browser storage permissions or available space, then try again.');
    return false;
  }
}

function editTask(task) {
  editingId = task.id;
  for (const field of ['title', 'category', 'deadline', 'duration', 'priority']) {
    form.elements.namedItem(field).value = task[field];
  }
  saveButton.textContent = 'Save changes';
  document.querySelector('.task-options').open = true;
  cancelButton.hidden = false;
  status.textContent = 'Editing task. Save your changes or cancel.';
  titleInput.focus();
}

// Rebuild the list from data after each change. The array is the source of truth.
function render() {
  if (!store) return;
  const tasks = store.list();
  document.dispatchEvent(new Event('tasks-changed'));
  const visible = tasks.filter(task => filter.value === 'all' || (filter.value === 'completed' ? task.completed : !task.completed));
  list.replaceChildren();
  count.textContent = tasks.length;
  count.setAttribute('aria-label', `${tasks.length} tasks`);
  document.querySelector('#completion-summary').textContent = `${tasks.filter(task => task.completed).length} of ${tasks.length} completed`;
  status.textContent = visible.length ? '' : 'No tasks to show here yet.';

  for (const task of visible) {
    const item = document.createElement('li');
    item.className = task.completed ? 'completed' : '';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.taskId = task.id;
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`);
    checkbox.addEventListener('change', () => {
      if (!mutate(() => store.toggle(task.id), task.completed ? 'Task reopened.' : 'Task completed.')) {
        checkbox.checked = task.completed;
      } else {
        const replacement = [...list.querySelectorAll('input')].find(input => input.dataset.taskId === task.id);
        (replacement ?? filter).focus();
      }
    });

    const content = document.createElement('div');
    content.className = 'task-content';
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    const details = document.createElement('p');
    details.className = 'task-details';
    const deadline = task.deadline ? new Date(`${task.deadline}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline';
    details.textContent = `${task.category} · ${task.duration} min · ${task.priority} priority · ${deadline}`;
    content.append(title, details);

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    for (const label of ['Edit', 'Delete']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = label;
      button.setAttribute('aria-label', `${label} ${task.title}`);
      button.addEventListener('click', () => {
        if (label === 'Edit') return editTask(task);
        if (mutate(() => store.remove(task.id), 'Task deleted.')) {
          if (editingId === task.id) resetEditor();
          titleInput.focus();
        }
      });
      actions.append(button);
    }
    item.append(checkbox, content, actions);
    list.append(item);
  }
}

form.addEventListener('invalid', event => {
  const details = event.target.closest('details');
  if (details) details.open = true;
}, true);

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!store) return;
  const title = titleInput.value.trim();
  if (!title) {
    status.textContent = 'Please enter a task title.';
    titleInput.focus();
    return;
  }
  const fields = {
    title,
    category: form.elements.namedItem('category').value,
    deadline: form.elements.namedItem('deadline').value,
    duration: Number(form.elements.namedItem('duration').value),
    priority: form.elements.namedItem('priority').value
  };
  const wasEditing = editingId !== null;
  if (mutate(() => {
    if (wasEditing) store.update(editingId, fields);
    else store.add({ ...fields, id: crypto.randomUUID(), completed: false });
  }, wasEditing ? 'Task updated.' : 'Task added.')) {
    resetEditor();
    filter.value = 'all';
    render();
    status.textContent = wasEditing ? 'Task updated.' : 'Task added.';
    titleInput.focus();
  }
});

cancelButton.addEventListener('click', () => {
  resetEditor();
  status.textContent = 'Edit cancelled.';
  titleInput.focus();
});
filter.addEventListener('change', render);
render();
const getTasks = () => store ? store.list() : [];
const calendar = initCalendar(getTasks);
initDashboard(getTasks, calendar, () => Boolean(store));
