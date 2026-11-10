import { availability, activitySuggestion } from './availability.mjs';
import { addDays } from './calendar-view.mjs';
import { dateLabel } from './clock.mjs';
import { activityVisual } from './activity-visuals.mjs';
import { minutes } from './calendar-store.mjs';
import { selectPreset } from './theme-ui.mjs';

const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
export function initDashboardDesign({ model, calendar, openActivity, now, showPanel, openSetup }) {
  const $ = selector => document.querySelector(selector);
  document.body.classList.add('compass-workspace');
  const tabs = $('.assistant-tabs');
  const brand = node('a', undefined, 'workspace-brand'); brand.href = 'index.html';
  brand.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16"/><path d="m30 11-4 15-15 11 10-17Z"/><path d="M24 1v9m0 28v9M1 24h9m28 0h9"/></svg><span>Day Compass<small>A little direction.</small></span>';
  tabs.prepend(brand);
  const icons = { day: '\u2302', calendar: '\u25a6', ai: '\u2727', settings: '\u2699' };
  tabs.querySelectorAll('[data-panel]').forEach(button => { const icon = node('span', icons[button.dataset.panel], 'workspace-nav-icon'); icon.setAttribute('aria-hidden', 'true'); button.prepend(icon); });
  const appearance = node('a', undefined, 'workspace-appearance'); appearance.href = '#appearance'; appearance.innerHTML = '<span aria-hidden="true">&#9680;</span> Themes & appearance'; appearance.addEventListener('click', event => { event.preventDefault(); $('[data-open-appearance]').click(); }); tabs.append(appearance, node('p', 'A calmer kind of productive.', 'workspace-sidebar-note'));
  const sidecar = node('aside', undefined, 'workspace-sidecar'); sidecar.setAttribute('aria-label', 'Planning companion and upcoming activities');
  sidecar.innerHTML = '<section class="widget companion-card"><div class="companion-heading"><div><p class="widget-label">A LITTLE DIRECTION</p><h2>Your planning companion</h2></div><span class="companion-orb" aria-hidden="true"><i></i><i></i></span></div><div class="companion-insight"><span class="insight-label">From your calendar</span><h3 id="companion-gap"></h3><p id="companion-suggestion"></p></div><div class="companion-actions"><button type="button" id="companion-plan">Plan this time</button><button type="button" class="secondary" id="companion-keep">Keep it free</button></div><p class="fine-print" id="companion-note"></p></section><section class="widget workspace-upcoming"><p class="widget-label">WHAT IS COMING UP</p><h2>On the horizon</h2><ul id="workspace-upcoming-list"></ul></section><section class="widget scene-themes"><p class="widget-label">A SPACE THAT FEELS LIKE YOU</p><h2>Choose a mood</h2><div class="scene-theme-grid"></div><button type="button" class="secondary calm-theme" data-scene-theme="aurora">Back to Calm</button></section>';
  $('.calendar-widget').after(sidecar);
  const themes = $('.scene-themes'), themeDetails = node('details', undefined, 'mood-details');
  themeDetails.append(node('summary', 'Choose a mood'));
  themes.querySelector('h2').remove(); themes.querySelector('.widget-label').remove();
  themeDetails.append(...themes.children); themes.append(themeDetails);
  for (const [preset, label] of [['aurora-night', 'Aurora'], ['ocean', 'Ocean'], ['sunset', 'Sunset'], ['space', 'Space']]) {
    const button = node('button', undefined, `scene-theme scene-${preset}`); button.type = 'button'; button.dataset.sceneTheme = preset; button.setAttribute('aria-label', `${label} workspace theme`);
    const art = node('span', undefined, 'scene-theme-art'); art.setAttribute('aria-hidden', 'true'); button.append(art, node('span', label, 'scene-theme-name'), node('span', '\u2713', 'scene-theme-check')); $('.scene-theme-grid').append(button);
  }
  document.querySelectorAll('[data-scene-theme]').forEach(button => button.addEventListener('click', () => { try { selectPreset(button.dataset.sceneTheme); } catch { $('#planner-feedback').textContent = 'This theme could not be saved. Check browser storage permissions.'; } }));
  let gap, selected;
  $('#companion-plan').addEventListener('click', () => {
    if (!model.snapshot().settings.setupConfirmed) { openSetup(); return; }
    if (!gap) { openActivity({ date: selected }); return; }
    showPanel('ai'); $('#ai-prompt').value = `Plan my free time on ${selected} from ${gap.start} to ${gap.end}.`; $('#ai-prompt').focus();
  });
  $('#companion-keep').addEventListener('click', () => { if (!gap) return; try { const s = model.snapshot().settings; model.saveSettings({ keptFree: [...(s.keptFree || []), { date: selected, start: gap.start, end: gap.end }] }); } catch (error) { $('#planner-feedback').textContent = error.message; } });
  function themeState() { document.querySelectorAll('[data-scene-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sceneTheme === document.documentElement.dataset.theme))); }
  document.addEventListener('appearance-changed', themeState);
  function render() {
    const state = model.snapshot(), s = state.settings, current = now(); selected = calendar.getSelectedDate();
    gap = availability(model.getDay(selected), s, selected === current.date ? current.minute : 0).gaps[0];
    if (!s.setupConfirmed) { $('#companion-gap').textContent = 'Start with your real week.'; $('#companion-suggestion').textContent = 'Add sleep, school and routines so your free time means something.'; $('#companion-plan').textContent = 'Set up my week'; }
    else if (gap && selected >= current.date) { const idea = activitySuggestion(state.tasks, gap, s); $('#companion-gap').textContent = `${dateLabel(selected)}: ${gap.start}–${gap.end} free`; $('#companion-suggestion').textContent = `${idea.title}. ${idea.reason}`; $('#companion-plan').textContent = 'Plan this time'; }
    else { gap = null; $('#companion-gap').textContent = selected < current.date ? 'A day already lived.' : 'Your day has a rhythm.'; $('#companion-suggestion').textContent = 'No usable gap meets your minimum length. There is no need to squeeze more in.'; $('#companion-plan').textContent = 'View / add an activity'; }
    $('#companion-keep').hidden = !gap || !s.setupConfirmed;
    $('#companion-note').textContent = 'Suggestions use your saved tasks and availability. AI plans open separately for your review.';
    const upcoming = [], from = selected < current.date ? current.date : selected;
    for (let i = 0; i < 8; i++) for (const item of model.getDay(addDays(from, i)).commitments) if (!item.completed && item.kind !== 'break' && (item.date !== current.date || minutes(item.end) > current.minute)) upcoming.push(item);
    upcoming.sort((a, b) => a.date.localeCompare(b.date) || minutes(a.start) - minutes(b.start));
    const list = $('#workspace-upcoming-list'); list.replaceChildren();
    for (const item of upcoming.slice(0, 4)) { const li = node('li'), b = node('button', undefined, 'upcoming-activity'); b.type = 'button'; b.dataset.activity = activityVisual(item).kind; const icon = node('span', activityVisual(item).icon, 'upcoming-mark'); icon.setAttribute('aria-hidden', 'true'); const text = node('span'); text.append(node('strong', item.title), node('small', `${dateLabel(item.date)} · ${item.start}–${item.end}`)); b.append(icon, text); b.addEventListener('click', () => openActivity({ date: item.date, item })); li.append(b); list.append(li); }
    if (!upcoming.length) list.append(node('li', 'A clear horizon. Add an activity when you are ready.', 'fine-print'));
    themeState();
  }
  render(); return { render };
}
