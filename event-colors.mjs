import { activityVisual } from './activity-visuals.mjs';

// Event colours, like Google Calendar: the same 11 named colours (so Google events keep theirs),
// chosen automatically from the category unless the person picks one. Fill, line and text colours
// are worked out for light and dark mode so event text stays readable.
export const EVENT_COLORS = {
  tomato: { label: 'Tomato', hex: '#d50000' }, flamingo: { label: 'Flamingo', hex: '#e67c73' }, tangerine: { label: 'Tangerine', hex: '#f4511e' },
  banana: { label: 'Banana', hex: '#f6bf26' }, sage: { label: 'Sage', hex: '#33b679' }, basil: { label: 'Basil', hex: '#0b8043' },
  peacock: { label: 'Peacock', hex: '#039be5' }, blueberry: { label: 'Blueberry', hex: '#3f51b5' }, lavender: { label: 'Lavender', hex: '#7986cb' },
  grape: { label: 'Grape', hex: '#8e24aa' }, graphite: { label: 'Graphite', hex: '#616161' }
};
// Google Calendar's event colour numbers.
export const GOOGLE_COLOR_IDS = { 1: 'lavender', 2: 'sage', 3: 'grape', 4: 'flamingo', 5: 'banana', 6: 'tangerine', 7: 'peacock', 8: 'graphite', 9: 'blueberry', 10: 'basil', 11: 'tomato' };
const BY_KIND = { reminder: 'tangerine', school: 'blueberry', study: 'peacock', football: 'basil', exercise: 'basil', volleyball: 'sage', creative: 'grape', rest: 'banana' };
const BY_CATEGORY = { Study: 'peacock', Exercise: 'basil', Work: 'graphite', Social: 'flamingo', Appointments: 'tangerine', Chores: 'banana', 'Personal projects': 'lavender' };

// Which colour an item shows: its own choice, then (for Google events) Google's colour, then automatic.
export function colorOf(item) {
  if (item.color && EVENT_COLORS[item.color]) return EVENT_COLORS[item.color].hex;
  if (item.color && /^#[\da-f]{6}$/i.test(item.color)) return item.color;
  const kind = activityVisual(item).kind;
  return EVENT_COLORS[BY_KIND[kind] || BY_CATEGORY[item.category] || 'lavender'].hex;
}

const rgb = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16));
const toHex = parts => '#' + parts.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, amount) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v * amount + y[i] * (1 - amount))); };
const lum = hex => { const [r, g, b] = rgb(hex).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };

const cache = new Map();
export function eventPalette(hex, dark) {
  const key = `${hex}|${dark}`; if (cache.has(key)) return cache.get(key);
  let fill, ink;
  if (dark) {
    fill = mix(hex, '#141824', .34); ink = mix(hex, '#ffffff', .25);
    for (let a = .25; contrast(ink, fill) < 4.5 && a > 0; a -= .05) ink = mix(hex, '#ffffff', a);
  } else {
    fill = mix(hex, '#ffffff', .2); ink = mix(hex, '#000000', .6);
    for (let a = .6; contrast(ink, fill) < 4.5 && a > 0; a -= .05) ink = mix(hex, '#000000', a);
  }
  const result = { fill, line: hex, ink };
  cache.set(key, result); return result;
}

// Puts the colours on an element as the CSS variables the calendar styles already use.
export function paintEvent(element, item) {
  const dark = document.documentElement.dataset.mode === 'dark';
  const { fill, line, ink } = eventPalette(colorOf(item), dark);
  element.style.setProperty('--event-fill', fill); element.style.setProperty('--event-line', line); element.style.setProperty('--event-ink', ink);
  element.dataset.colored = 'true';
}
