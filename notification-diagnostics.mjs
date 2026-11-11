import { api } from './account-client.mjs';

async function currentWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('This browser does not support background notification workers.');
  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  await registration.update();
  const installing = registration.installing || registration.waiting;
  if (installing && installing.state !== 'activated') await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { installing.removeEventListener('statechange', changed); reject(new Error('Notification worker update is still pending. Reload this page and retry.')); }, 10000);
    function changed() { if (installing.state === 'activated') { clearTimeout(timeout); installing.removeEventListener('statechange', changed); resolve(); } }
    installing.addEventListener('statechange', changed); changed();
  });
  return registration;
}

export function initNotificationDiagnostics({ account }) {
  const $ = selector => document.querySelector(selector);
  const display = document.createElement('button'); display.type = 'button'; display.className = 'secondary'; display.id = 'notification-display-test'; display.textContent = 'Test Windows popup'; $('#push-test').after(display);
  const displayStatus = document.createElement('p'); displayStatus.id = 'notification-display-status'; displayStatus.setAttribute('role', 'status'); $('#push-test-status').after(displayStatus);
  display.addEventListener('click', async () => {
    display.disabled = true;
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') throw new Error('Allow browser notifications first. This test does not change your permission.');
      const registration = await currentWorker();
      await registration.showNotification('Day Compass — popup test', { body: 'This popup was requested directly by your browser, without the push service.', tag: `compass-local-test-${Date.now()}`, data: { url: '/dashboard.html#notifications' } });
      displayStatus.textContent = 'The browser accepted a direct popup request, bypassing the push service. Did Windows show it? If not, the problem is in browser/Windows display settings. API acceptance alone does not prove a popup appeared.';
    } catch (error) { displayStatus.textContent = error.message; }
    finally { display.disabled = false; }
  });
  $('#push-test').addEventListener('click', async () => {
    const button = $('#push-test'), status = $('#push-test-status'); button.disabled = true;
    try {
      if (!account.user) throw new Error('Sign in to your private account first.');
      status.textContent = 'Updating the notification worker and sending a background test…';
      const registration = await currentWorker(), subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error('Enable background reminders on this device first.');
      const result = await api('push/test', 'POST', { endpoint: subscription.endpoint });
      status.textContent = 'Push service accepted the test. Waiting for a browser receipt; this is not proof of delivery.';
      if (!result.testKey) return;
      for (let attempt = 0; attempt < 12; attempt++) {
        const receipt = await api(`push/test/status?key=${encodeURIComponent(result.testKey)}`);
        if (receipt.displayError) { status.textContent = 'The browser received the push but could not request notification display. Try Test Windows popup to isolate the display problem.'; return; }
        if (receipt.displayRequested) { status.textContent = 'Browser receipt confirmed: it received the push and requested notification display. If Windows showed nothing, check browser/Windows notification settings. This still does not confirm you saw a popup.'; return; }
        if (receipt.browserReceived) status.textContent = 'The browser received the push. Waiting for its notification-display report…';
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      status.textContent = 'Push service accepted the test, but no browser display receipt arrived yet. Delivery is unconfirmed; the browser may be offline or unable to report. Try Test Windows popup, then compare the results.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}
