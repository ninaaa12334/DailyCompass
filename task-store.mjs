// This module manages task data. It knows nothing about HTML or CSS.
export const STORAGE_KEY = 'day-compass.tasks.v1';
export const CATEGORIES = ['Study', 'Exercise', 'Chores', 'Personal projects', 'Social'];
export const PRIORITIES = ['Low', 'Medium', 'High'];

function validDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateTask(task) {
  if (!task || typeof task.id !== 'string' || !task.id ||
      typeof task.title !== 'string' || !task.title.trim() || task.title.length > 120 ||
      !CATEGORIES.includes(task.category) || !PRIORITIES.includes(task.priority) ||
      !Number.isInteger(task.duration) || task.duration < 1 || task.duration > 1440 ||
      typeof task.deadline !== 'string' || !validDate(task.deadline) ||
      typeof task.completed !== 'boolean') {
    throw new Error('Invalid task data. Check the title, date, and duration.');
  }
}

export function createTaskStore(storage) {
  const saved = storage.getItem(STORAGE_KEY);
  let tasks = saved === null ? [] : JSON.parse(saved);
  if (!Array.isArray(tasks)) throw new Error('Saved tasks must be a list.');
  tasks.forEach(validateTask);
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) {
    throw new Error('Saved tasks contain duplicate IDs.');
  }

  // Save before changing memory: a failed write must not pretend it succeeded.
  function commit(next) {
    next.forEach(validateTask);
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    tasks = next;
  }

  function find(id) {
    const task = tasks.find(task => task.id === id);
    if (!task) throw new Error('That task no longer exists.');
    return task;
  }

  return {
    list() { return tasks.map(task => ({ ...task })); },
    add(task) {
      validateTask(task);
      if (tasks.some(existing => existing.id === task.id)) throw new Error('Duplicate task ID.');
      commit([...tasks, { ...task }]);
    },
    update(id, fields) {
      const current = find(id);
      // Editing details preserves completion and identity.
      const updated = { ...current, ...fields, id, completed: current.completed };
      commit(tasks.map(task => task.id === id ? updated : task));
    },
    toggle(id) {
      const current = find(id);
      commit(tasks.map(task => task.id === id ? { ...task, completed: !current.completed } : task));
    },
    remove(id) {
      find(id);
      commit(tasks.filter(task => task.id !== id));
    }
  };
}
