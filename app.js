// querySelector finds an HTML element using its CSS selector.
const taskForm = document.querySelector('#task-form');
const taskTitle = document.querySelector('#task-title');
const taskList = document.querySelector('#task-list');
const taskStatus = document.querySelector('#task-status');

// A form's submit event works for both the button and the Enter key.
taskForm.addEventListener('submit', function (event) {
  event.preventDefault();

  const title = taskTitle.value.trim();
  if (title === '') {
    taskStatus.textContent = 'Please enter a task title.';
    return;
  }

  // Your exercise: create an li, set its textContent to title,
  // and append it to taskList. See README.md for hints and checks.
});
