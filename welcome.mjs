const dialog = document.querySelector('#access-dialog');
document.querySelectorAll('[data-open-access]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
document.querySelector('#close-access').addEventListener('click', () => dialog.close());
