import { loadAccount, api } from './account-client.mjs';
import { storage } from './runtime.mjs';
import { createPlannerStore } from './planner-store.mjs';
import { PRESETS } from './appearance.mjs';
import { selectPreset, currentAppearance, bindAccountAppearance } from './theme-ui.mjs';

const $ = selector => document.querySelector(selector), form = $('#onboarding-form');
try {
  const account = await loadAccount();
  if (!account.user) location.replace('auth.html?mode=login');
  else if (account.document.state.settings.onboardingComplete === true && new URLSearchParams(location.search).get('edit') !== '1') location.replace('dashboard.html');
  else {
    const model = createPlannerStore(storage); bindAccountAppearance(model);
    let step = 0, version = account.document.version, saving = false;
    const settings = model.snapshot().settings;
    $('#onboarding-start').value = settings.planningStart; $('#onboarding-end').value = settings.planningEnd;
    $('#onboarding-zone').value = settings.timeZone; $('#onboarding-reminder').value = settings.reminderMinutes;
    $('#onboarding-interests').value = settings.interests || '';
    const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    for (const zone of new Set([settings.timeZone, 'UTC', ...zones])) { const option = document.createElement('option'); option.value = zone; $('#onboarding-zones').append(option); }
    function zonePreview() {
      try { $('#onboarding-zone-preview').textContent = `The time there is ${new Intl.DateTimeFormat(undefined, { timeZone: $('#onboarding-zone').value, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date())}. Does that match your local time?`; }
      catch { $('#onboarding-zone-preview').textContent = 'Choose a valid timezone from the suggestions.'; }
    }
    $('#onboarding-zone').addEventListener('input', zonePreview); zonePreview();
    for (const preset of ['aurora', 'linen', 'pistachio', 'lavender', 'ocean', 'sunset', 'dusk', 'aurora-night', 'space']) {
      const label = PRESETS[preset].label;
      const choice = document.createElement('label'), radio = document.createElement('input'), art = document.createElement('span');
      radio.type = 'radio'; radio.name = 'theme'; radio.value = preset; radio.required = true; radio.checked = currentAppearance().preset === preset;
      art.className = 'onboarding-theme-art'; art.style.background = `linear-gradient(135deg, ${PRESETS[preset].background} 0 45%, ${PRESETS[preset].tint} 45% 75%, ${PRESETS[preset].accent} 75%)`; art.setAttribute('aria-hidden', 'true');
      choice.append(radio, art, document.createTextNode(label)); $('#onboarding-themes').append(choice);
      radio.addEventListener('change', () => { selectPreset(preset); $('#onboarding-error').textContent = ''; });
    }
    function show(next) {
      step = next;
      document.querySelectorAll('.onboarding-step').forEach((fieldset, index) => { fieldset.hidden = index !== step; fieldset.disabled = index !== step; });
      document.querySelectorAll('.onboarding-dots i').forEach((dot, index) => dot.classList.toggle('active', index <= step));
      $('#onboarding-step-label').textContent = `Step ${step + 1} of 3`; $('#onboarding-back').hidden = step === 0;
      $('#welcome-stage').textContent = ['Your colours', 'Your rhythm', 'Your starting point'][step];
      $('#onboarding-next').textContent = step === 2 ? 'Let’s get started' : 'Continue';
      const legend = document.querySelectorAll('.onboarding-step legend')[step]; legend.tabIndex = -1; legend.focus();
    }
    $('#onboarding-back').addEventListener('click', () => { if (!saving) show(step - 1); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (saving) return; $('#onboarding-error').textContent = '';
      try {
        if (step === 1) {
          if ($('#onboarding-start').value >= $('#onboarding-end').value) throw new Error('Choose a planning end time after the start time.');
          new Intl.DateTimeFormat('en', { timeZone: $('#onboarding-zone').value }).format();
        }
        if (step < 2) { show(step + 1); return; }
        saving = true; $('#onboarding-next').disabled = $('#onboarding-back').disabled = true;
        model.saveSettings({ planningStart: $('#onboarding-start').value, planningEnd: $('#onboarding-end').value, timeZone: $('#onboarding-zone').value, interests: $('#onboarding-interests').value.trim(), reminderMinutes: Number($('#onboarding-reminder').value), appearance: currentAppearance(), onboardingComplete: true });
        const result = await api('planner', 'PUT', { state: model.snapshot(), version }); version = result.version;
        location.replace('dashboard.html?welcome=1');
      } catch (error) { $('#onboarding-error').textContent = error.status === 409 ? 'Your account changed in another tab. Reload this page before finishing; your calendar has not been overwritten.' : error.message; }
      finally { saving = false; $('#onboarding-next').disabled = $('#onboarding-back').disabled = false; }
    });
    $('#onboarding-loading').hidden = true; form.hidden = false; show(0);
  }
} catch (error) { $('#onboarding-loading').textContent = `Setup could not load: ${error.message}`; $('#onboarding-retry').hidden = false; }
