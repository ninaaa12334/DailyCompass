// querySelector finds an HTML element using its CSS selector.
const taskForm = document.querySelector('#task-form');
const taskTitle = document.querySelector('#task-title');
const taskList = document.querySelector('#task-list');
const taskStatus = document.querySelector('#task-status');
const taskCount = document.querySelector('#task-count');

// Use the visitor's local date rather than a hard-coded date.
const today = new Date();
document.querySelector('#today-weekday').textContent = today.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase();
document.querySelector('#today-day').textContent = today.getDate();
document.querySelector('#today-month').textContent = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

// A form's submit event works for both the button and the Enter key.
taskForm.addEventListener('submit', function (event) {
  event.preventDefault();

  const title = taskTitle.value.trim();
  if (title === '') {
    taskStatus.textContent = 'Please enter a task title.';
    return;
  }

  // textContent keeps user input as plain text, even if it contains HTML.
  const item = document.createElement('li');
  const itemTitle = document.createElement('span');
  itemTitle.className = 'task-title';
  itemTitle.textContent = title;
  item.append(itemTitle);
  taskList.append(item);

  const count = taskList.children.length;
  taskCount.textContent = count;
  taskCount.setAttribute('aria-label', `${count} ${count === 1 ? 'task' : 'tasks'}`);
  taskStatus.textContent = `Added “${title}”.`;
  taskForm.reset();
  taskTitle.focus();
});
