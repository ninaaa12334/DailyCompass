import { addDays } from './calendar-view.mjs';
import { dateLabel } from './clock.mjs';
import { activityVisual } from './activity-visuals.mjs';
import { minutes } from './calendar-store.mjs';
import { selectPreset } from './theme-ui.mjs';
import { PRESETS } from './appearance.mjs';
import { storage } from './runtime.mjs';

const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
export function initDashboardDesign({ model, openActivity, now }) {
  const $ = selector => document.querySelector(selector);
  document.body.classList.add('compass-workspace');
  const tabs = $('.assistant-tabs');
  tabs.id = 'workspace-navigation';
  const brand = node('a', undefined, 'workspace-brand'); brand.href = 'index.html';
  brand.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16"/><path d="m30 11-4 15-15 11 10-17Z"/><path d="M24 1v9m0 28v9M1 24h9m28 0h9"/></svg><span>Day Compass<small>A little direction.</small></span>';
  brand.setAttribute('aria-label', 'Day Compass home'); tabs.prepend(brand);
  const icons = { day: '\u2302', calendar: '\u25a6', ai: '\u2727', settings: '\u2699' };
  tabs.querySelectorAll('[data-panel]').forEach(button => { const label = button.textContent.trim(), icon = node('span', icons[button.dataset.panel], 'workspace-nav-icon'); icon.setAttribute('aria-hidden', 'true'); button.replaceChildren(icon, node('span', label, 'workspace-nav-label')); button.setAttribute('aria-label', label); button.title = label; });
  const appearance = node('a', undefined, 'workspace-appearance'); appearance.href = '#appearance'; appearance.innerHTML = '<span aria-hidden="true">&#9680;</span> Themes & appearance'; appearance.addEventListener('click', event => { event.preventDefault(); $('[data-open-appearance]').click(); }); tabs.append(appearance, node('p', 'A calmer kind of productive.', 'workspace-sidebar-note'));
  appearance.lastChild.replaceWith(node('span', 'Themes & appearance', 'workspace-nav-label'));
  appearance.setAttribute('aria-label', 'Themes & appearance'); appearance.title = 'Themes & appearance';
  const collapse = node('button', undefined, 'sidebar-toggle'); collapse.type = 'button'; collapse.setAttribute('aria-controls', tabs.id);
  let compact = false;
  try { compact = storage.getItem('day-compass.sidebar-compact.v1') === 'true'; } catch { /* Navigation still works without saved preferences. */ }
  function sidebarState() {
    document.body.dataset.sidebar = compact ? 'compact' : 'expanded';
    collapse.textContent = compact ? '›' : '‹'; collapse.setAttribute('aria-expanded', String(!compact));
    collapse.setAttribute('aria-label', compact ? 'Expand sidebar' : 'Collapse sidebar'); collapse.title = compact ? 'Expand sidebar' : 'Collapse sidebar';
  }
  collapse.addEventListener('click', () => { document.body.dataset.sidebarAnimated = 'true'; compact = !compact; sidebarState(); try { storage.setItem('day-compass.sidebar-compact.v1', String(compact)); } catch {} });
  brand.after(collapse); sidebarState();
  const sidecar = node('aside', undefined, 'workspace-sidecar'); sidecar.setAttribute('aria-label', 'Upcoming events');
  sidecar.innerHTML = '<section class="widget workspace-upcoming"><h2>Upcoming events</h2><p class="fine-print">Next activities from today, over the next seven days.</p><ul id="workspace-upcoming-list"></ul></section><section class="widget scene-themes"><p class="widget-label">A SPACE THAT FEELS LIKE YOU</p><h2>Choose a mood</h2><div class="scene-theme-grid"></div><button type="button" class="secondary calm-theme" data-open-full-themes>All themes</button></section>';
  $('.calendar-widget').after(sidecar);
  const dayDetails = node('details', undefined, 'day-details');
  dayDetails.append(node('summary', 'Day details'), $('.timeline-widget'));
  $('.tasks-widget').after(dayDetails);

  const themes = $('.scene-themes'), themeDetails = node('details', undefined, 'mood-details');
  themeDetails.append(node('summary', 'Choose a mood'));
  themes.querySelector('h2').remove(); themes.querySelector('.widget-label').remove();
  themeDetails.append(...themes.children); themes.append(themeDetails);
  for (const [preset, label] of [['linen', 'Linen'], ['stone', 'Stone'], ['clay', 'Clay'], ['dusk', 'Soft dusk']]) {
    const button = node('button', undefined, `scene-theme scene-${preset}`); button.type = 'button'; button.dataset.sceneTheme = preset; button.setAttribute('aria-label', `${label} workspace theme`);
    const art = node('span', undefined, 'scene-theme-art'); art.setAttribute('aria-hidden', 'true');
    if (['linen', 'stone', 'clay', 'dusk'].includes(preset)) { art.style.background = `linear-gradient(135deg, ${PRESETS[preset].tint}, ${PRESETS[preset].accent})`; }
    button.append(art, node('span', label, 'scene-theme-name'), node('span', '\u2713', 'scene-theme-check')); $('.scene-theme-grid').append(button);
  }
  $('[data-open-full-themes]').addEventListener('click', () => $('[data-open-appearance]').click());
  document.querySelectorAll('[data-scene-theme]').forEach(button => button.addEventListener('click', () => { try { selectPreset(button.dataset.sceneTheme); } catch { $('#planner-feedback').textContent = 'This theme could not be saved. Check browser storage permissions.'; } }));
  function themeState() { document.querySelectorAll('[data-scene-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sceneTheme === document.documentElement.dataset.theme))); }
  document.addEventListener('appearance-changed', themeState);
  function render() {
    const unplaced = $('#day-unscheduled').children.length;
    dayDetails.querySelector('summary').textContent = unplaced ? `Day details \u00b7 ${unplaced} task${unplaced === 1 ? '' : 's'} could not fit` : 'Day details';
    const current = now(), upcoming = [], from = current.date;
    for (let i = 0; i < 7; i++) for (const item of model.getDay(addDays(from, i)).commitments) if (!item.completed && item.kind !== 'break' && (item.date !== current.date || minutes(item.end) > current.minute)) upcoming.push(item);
    upcoming.sort((a, b) => a.date.localeCompare(b.date) || minutes(a.start) - minutes(b.start));
    const list = $('#workspace-upcoming-list'); list.replaceChildren();
    for (const item of upcoming.slice(0, 6)) { const li = node('li'), b = node('button', undefined, 'upcoming-activity'); b.type = 'button'; b.dataset.activity = activityVisual(item).kind; const icon = node('span', activityVisual(item).icon, 'upcoming-mark'); icon.setAttribute('aria-hidden', 'true'); const text = node('span'); text.append(node('strong', item.title), node('small', `${dateLabel(item.date)} · ${item.start}–${item.end}`)); b.append(icon, text); b.addEventListener('click', () => openActivity({ date: item.date, item })); li.append(b); list.append(li); }
    if (!upcoming.length) list.append(node('li', 'No upcoming events in the next seven days.', 'fine-print'));
    themeState();
  }
  render(); return { render };
}
