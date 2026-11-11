import { APPEARANCE_KEY, createAppearanceStore, DEFAULT_APPEARANCE, PRESETS, resolveAppearance } from './appearance.mjs';
import { storage, isDemo } from './runtime.mjs';

const media = window.matchMedia('(prefers-color-scheme: dark)');
let store;
let saved = { ...DEFAULT_APPEARANCE };
let loadError = false;
try { store = createAppearanceStore(storage); saved = store.get(); }
catch { loadError = true; }

function apply(value) {
  const theme = resolveAppearance(value, media.matches);
  const root = document.documentElement;
  root.dataset.mode = theme.dark ? 'dark' : 'light';
  root.dataset.theme = value.preset;
  for (const [key, color] of Object.entries({ accent: theme.accent, 'accent-ink': theme.accentText, busy: theme.busy, 'busy-ink': theme.busyText, background: theme.background, tint: theme.tint })) {
    root.style.setProperty(`--${key}`, color);
  }
}
apply(saved);
export function currentAppearance() { return { ...saved }; }
export function bindAccountAppearance(model) {
  try { store = createAppearanceStore(storage); }
  catch { storage.setItem(APPEARANCE_KEY, JSON.stringify(model.snapshot().settings.appearance || DEFAULT_APPEARANCE)); store = createAppearanceStore(storage); }
  saved = model.snapshot().settings.appearance || store.get();
  store.save(saved); apply(saved);
  model.subscribe(() => {
    const remote = model.snapshot().settings.appearance;
    if (remote && JSON.stringify(remote) !== JSON.stringify(saved)) { saved = { ...remote }; store.save(saved); apply(saved); }
  });
  document.addEventListener('appearance-changed', () => {
    if (JSON.stringify(model.snapshot().settings.appearance) !== JSON.stringify(saved)) model.saveSettings({ appearance: { ...saved } });
  });
}
media.addEventListener('change', () => apply(saved));
export function selectPreset(preset) {
  const next = { ...saved, preset, customAccent: false, customBusy: false };
  if (!store) { storage.setItem(APPEARANCE_KEY, JSON.stringify(next)); store = createAppearanceStore(storage); } else store.save(next);
  saved = next; loadError = false; apply(saved); document.dispatchEvent(new Event('appearance-changed'));
}

const dialog = document.createElement('dialog');
dialog.id = 'appearance-dialog';
dialog.setAttribute('aria-labelledby', 'appearance-title');
// This template is static UI. User-entered colours are only assigned through validated values.
dialog.innerHTML = `
  <div class="dialog-heading"><div><p class="widget-label">MAKE YOURSELF AT HOME</p><h2 id="appearance-title">Your colours, your space.</h2></div><button type="button" class="secondary" id="close-appearance">Close</button></div>
  <p class="muted">Choose a palette, then make it a little more you.</p>
  <form id="appearance-form">
    <fieldset><legend>Theme</legend><div class="theme-options" id="theme-options"></div></fieldset>
    <div class="colour-choice"><label><input type="checkbox" name="customAccent"> Use a custom accent</label><input type="color" name="accent" aria-label="Custom accent colour"></div>
    <div class="colour-choice"><label><input type="checkbox" name="customBusy"> Use a custom busyness colour</label><input type="color" name="busy" aria-label="Calendar busyness colour"></div>
    <p class="fine-print">Button text adjusts for contrast. Dates with their own busy colour keep that override.</p>
    <div class="theme-preview" id="theme-preview"><span>Live preview</span><span class="preview-button">Your accent</span></div>
    <p class="fine-print">${isDemo ? 'Demo preferences stay separate from your personal planner.' : 'Preferences save in this browser. You can change them anytime.'}</p>
    <p id="appearance-error" role="alert" hidden></p>
    <button type="submit">Save appearance</button>
  </form>`;
document.body.append(dialog);
const form = dialog.querySelector('form');
const error = dialog.querySelector('#appearance-error');
for (const [key, preset] of Object.entries(PRESETS)) {
  const label = document.createElement('label');
  label.className = 'theme-option';
  const input = document.createElement('input');
  input.type = 'radio'; input.name = 'preset'; input.value = key; input.required = true;
  const swatch = document.createElement('span');
  swatch.className = 'theme-swatch'; swatch.style.background = preset.accent ?? 'linear-gradient(90deg,#365d4d 50%,#141e23 50%)';
  swatch.setAttribute('aria-hidden', 'true');
  label.append(input, swatch, document.createTextNode(preset.label));
  dialog.querySelector('#theme-options').append(label);
}
function read() {
  return { preset: form.elements.namedItem('preset').value, customAccent: form.elements.namedItem('customAccent').checked, accent: form.elements.namedItem('accent').value, customBusy: form.elements.namedItem('customBusy').checked, busy: form.elements.namedItem('busy').value };
}
function preview() {
  const value = read();
  form.elements.namedItem('accent').disabled = !value.customAccent;
  form.elements.namedItem('busy').disabled = !value.customBusy;
  const theme = resolveAppearance(value, media.matches);
  const block = dialog.querySelector('#theme-preview');
  block.style.setProperty('--preview-accent', theme.accent);
  block.style.setProperty('--preview-ink', theme.accentText);
}
document.querySelectorAll('[data-open-appearance]').forEach(button => button.addEventListener('click', () => {
  for (const [key, value] of Object.entries(saved)) {
    const control = form.elements.namedItem(key);
    if (key.startsWith('custom')) control.checked = value;
    else control.value = value;
  }
  error.hidden = !loadError;
  error.textContent = loadError ? 'Saved preferences could not be read. Saving a new choice will replace only appearance preferences; your tasks and calendar stay intact.' : '';
  preview();
  dialog.showModal();
}));
form.addEventListener('input', preview);
form.addEventListener('submit', event => {
  event.preventDefault();
  const next = read();
  try {
    if (!store) {
      // Recovery is explicit: the user chooses to save new appearance preferences.
      storage.setItem(APPEARANCE_KEY, JSON.stringify(next));
      store = createAppearanceStore(storage);
    } else store.save(next);
    saved = next; loadError = false; apply(saved); dialog.close();
    document.dispatchEvent(new Event('appearance-changed'));
  } catch {
    error.hidden = false;
    error.textContent = 'Could not save your appearance. Check browser storage permissions or available space and try again.';
  }
});
dialog.querySelector('#close-appearance').addEventListener('click', () => dialog.close());
