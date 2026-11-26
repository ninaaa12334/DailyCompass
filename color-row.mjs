import { EVENT_COLORS } from './event-colors.mjs';

// One-tap colour choice for the event card: Auto (from the category) plus Google Calendar's colours.
// For a repeating event, "Every repeat" decides whether all of them change or just this day.
let rowCount = 0;
export function colorRow({ current, auto, repeats, onPick }) {
  const field = document.createElement('fieldset'); field.className = 'color-field event-card-colors';
  const legend = document.createElement('legend'); legend.textContent = 'Colour'; field.append(legend);
  const swatches = document.createElement('div'); swatches.className = 'color-swatches'; field.append(swatches);
  const name = `card-color-${++rowCount}`;
  const options = [['', 'Automatic (from the category)', auto], ...Object.entries(EVENT_COLORS).map(([key, c]) => [key, c.label, c.hex])];
  let all = null;
  for (const [value, label, hex] of options) {
    const wrap = document.createElement('label'); wrap.className = `color-swatch${value ? '' : ' color-auto'}`; wrap.title = label;
    const input = document.createElement('input'); input.type = 'radio'; input.name = name; input.value = value; input.checked = value === (current || ''); input.setAttribute('aria-label', label);
    const dot = document.createElement('span'); dot.style.background = hex;
    wrap.append(input, dot);
    if (!value) wrap.append(Object.assign(document.createElement('small'), { textContent: 'Auto' }));
    input.addEventListener('change', () => { if (input.checked && onPick(value, Boolean(all?.checked)) === false) input.checked = false; });
    swatches.append(wrap);
  }
  if (repeats) {
    const label = document.createElement('label'); label.className = 'color-all-repeats';
    all = document.createElement('input'); all.type = 'checkbox'; all.checked = true;
    label.append(all, ' Every repeat'); field.append(label);
  }
  return field;
}
