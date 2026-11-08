// A classic script can report even an ES-module download/parse failure.
(function () {
  const panel = document.querySelector('#startup-error');
  const status = document.querySelector('#startup-status');
  let ready = false;
  const timeout = setTimeout(() => fail(new Error('Planner files took too long to load. Check the local server address, then Retry.')), 10000);
  function fail(error) {
    document.body.dataset.plannerReady = 'false';
    clearTimeout(timeout);
    panel.hidden = false;
    status.textContent = 'Your planner could not finish loading. Your saved data has not been reset.';
    document.querySelector('#startup-detail').textContent = error?.message || String(error);
    document.querySelector('#now-heading').textContent = 'Planner unavailable';
    document.querySelector('#next-activity').textContent = 'Use Retry below. If opening a file directly, use the local web-server address instead.';
    document.querySelector('#free-minutes').textContent = 'Unavailable';
    document.querySelector('#progress-value').textContent = 'Unavailable';
    document.querySelector('#selected-day').textContent = 'Could not load your selected day';
  }
  document.querySelector('#retry-startup').addEventListener('click', () => location.reload());
  document.querySelector('#export-backup').addEventListener('click', () => {
    try {
      const demo = new URLSearchParams(location.search).get('demo') === '1';
      const source = demo ? sessionStorage : localStorage;
      const backup = {};
      for (const key of ['day-compass.planner.v2', 'day-compass.tasks.v1', 'day-compass.calendar.v1', 'day-compass.appearance.v1', 'day-compass.calendar-view.v1']) backup[key] = source.getItem(`${demo ? 'demo.' : ''}${key}`);
      if (!demo) for (const key of Object.keys(sessionStorage)) if (key.startsWith('account.')) backup[key] = sessionStorage.getItem(key);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'day-compass-backup.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { document.querySelector('#startup-detail').textContent = `Backup could not be read: ${error.message}`; }
  });
  window.addEventListener('error', event => { if (!ready) fail(event.error || new Error(event.message || 'A planner file could not be loaded.')); });
  window.addEventListener('unhandledrejection', event => { if (!ready) fail(event.reason); });
  import('./app.js').then(async module => {
    await module.startApp(); ready = true; document.body.dataset.plannerReady = 'true'; clearTimeout(timeout); panel.hidden = true; status.textContent = 'Planner ready.';
  }).catch(fail);
})();
