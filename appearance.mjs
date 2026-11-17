export const APPEARANCE_KEY = 'day-compass.appearance.v1';
// Featured themes carry a soft "wallpaper" gradient behind the workspace. Older presets stay
// valid so saved choices keep working; the picker lists them under "Classic".
const wash = (...stops) => stops.join(', ');
export const PRESETS = {
  cloud: { label: 'Cloud', group: 'light', accent: '#0a6cdb', busy: '#0a6cdb', background: '#f2f4f8', tint: '#dfe9f8', surface: '#ffffff', surfaceAlt: '#f1f4f9', text: '#1c1f26', muted: '#5f6676', border: '#e1e5ee', wallpaper: wash('radial-gradient(60% 50% at 0% 0%, #dbe8ff 0%, transparent 70%)', 'radial-gradient(50% 45% at 100% 10%, #efe4ff 0%, transparent 70%)', 'radial-gradient(60% 50% at 70% 100%, #e3f4ff 0%, transparent 70%)') },
  blossom: { label: 'Blossom', group: 'light', accent: '#c2366b', busy: '#c2366b', background: '#fbf3f5', tint: '#f8dfe8', surface: '#fffbfc', surfaceAlt: '#f9eef2', text: '#2e1f26', muted: '#715a64', border: '#efdde4', wallpaper: wash('radial-gradient(55% 50% at 0% 0%, #ffd9e6 0%, transparent 70%)', 'radial-gradient(50% 45% at 100% 20%, #ffe6d6 0%, transparent 70%)', 'radial-gradient(60% 50% at 40% 100%, #f3e1ff 0%, transparent 70%)') },
  matcha: { label: 'Matcha', group: 'light', accent: '#3f6f2e', busy: '#4d7f39', background: '#f3f6ee', tint: '#dfead2', surface: '#fdfef9', surfaceAlt: '#eff3e7', text: '#232a1e', muted: '#5c6653', border: '#dfe5d5', wallpaper: wash('radial-gradient(55% 50% at 0% 0%, #dcefc9 0%, transparent 70%)', 'radial-gradient(50% 45% at 100% 30%, #f6f0d4 0%, transparent 70%)', 'radial-gradient(60% 50% at 60% 100%, #d3ece3 0%, transparent 70%)') },
  sunrise: { label: 'Sunrise', group: 'light', accent: '#c4511f', busy: '#d0602d', background: '#fff6ef', tint: '#fde0cc', surface: '#fffcf9', surfaceAlt: '#fbefe5', text: '#2f2119', muted: '#735c4e', border: '#f0dfd2', wallpaper: wash('radial-gradient(55% 50% at 0% 0%, #ffdcc2 0%, transparent 70%)', 'radial-gradient(50% 45% at 100% 15%, #ffd6df 0%, transparent 70%)', 'radial-gradient(60% 50% at 50% 100%, #fff0c7 0%, transparent 70%)') },
  iris: { label: 'Iris', group: 'light', accent: '#6146d9', busy: '#6f55e6', background: '#f5f3fd', tint: '#e5defc', surface: '#fefdff', surfaceAlt: '#f1eefc', text: '#211d33', muted: '#615b7a', border: '#e3def5', wallpaper: wash('radial-gradient(55% 50% at 0% 0%, #e2dbff 0%, transparent 70%)', 'radial-gradient(50% 45% at 100% 25%, #d9ecff 0%, transparent 70%)', 'radial-gradient(60% 50% at 40% 100%, #fbe0f4 0%, transparent 70%)') },
  graphite: { label: 'Graphite', group: 'dark', dark: true, accent: '#4ea3ff', busy: '#4ea3ff', background: '#121214', tint: '#24324a', surface: '#1c1c1f', surfaceAlt: '#26262a', text: '#f4f4f6', muted: '#a8a8b3', border: '#323238', wallpaper: wash('radial-gradient(55% 50% at 0% 0%, #1d2a40 0%, transparent 70%)', 'radial-gradient(50% 45% at 100% 100%, #2a1f3d 0%, transparent 70%)') },
  'deep-sea': { label: 'Deep sea', group: 'dark', dark: true, accent: '#5fd4f5', busy: '#5fd4f5', background: '#08131f', tint: '#123047', surface: '#0f1d2c', surfaceAlt: '#152637', text: '#eaf6fb', muted: '#9fb6c6', border: '#203347', wallpaper: wash('radial-gradient(60% 50% at 0% 0%, #0f3550 0%, transparent 70%)', 'radial-gradient(50% 50% at 100% 100%, #102c4a 0%, transparent 70%)', 'radial-gradient(40% 40% at 80% 10%, #13403f 0%, transparent 70%)') },
  velvet: { label: 'Velvet night', group: 'dark', dark: true, accent: '#c7a4ff', busy: '#b48cff', background: '#120f1c', tint: '#2d2347', surface: '#1b1728', surfaceAlt: '#241f34', text: '#f4f0fd', muted: '#b3aac8', border: '#332c47', wallpaper: wash('radial-gradient(55% 50% at 0% 0%, #2e1d4f 0%, transparent 70%)', 'radial-gradient(50% 45% at 100% 90%, #3f1b3d 0%, transparent 70%)', 'radial-gradient(40% 40% at 90% 0%, #1b2950 0%, transparent 70%)') },
  // Winter themes: the decorations (garland, snow, snowman, tree) come from seasonal-decor.mjs.
  christmas: { label: 'Christmas', group: 'winter', decor: 'christmas', darkVariant: 'snowy-night', accent: '#b3122e', busy: '#2c7a51', background: '#edf3f9', tint: '#fbe3e6', surface: '#ffffff', surfaceAlt: '#f3f7fb', text: '#1d2333', muted: '#535a6b', border: '#dde5ef', wallpaper: wash('radial-gradient(70% 55% at 10% 0%, #ffffff 0%, transparent 70%)', 'radial-gradient(60% 50% at 95% 25%, #dfeaf6 0%, transparent 70%)', 'radial-gradient(70% 50% at 50% 100%, #f7fbff 0%, transparent 70%)') },
  'snowy-night': { label: 'Snowy night', hidden: true, replacedBy: 'christmas', decor: 'christmas', dark: true, accent: '#ff8a8a', busy: '#7fd3a5', background: '#0d1729', tint: '#3a2232', surface: '#15223a', surfaceAlt: '#1c2b46', text: '#f2f5fb', muted: '#b4bfd3', border: '#2a3a58', wallpaper: wash('radial-gradient(60% 50% at 15% 0%, #1d3157 0%, transparent 70%)', 'radial-gradient(50% 45% at 90% 20%, #24224a 0%, transparent 70%)', 'radial-gradient(80% 45% at 50% 100%, #1a2a47 0%, transparent 75%)') },
  frost: { label: 'Frost', hidden: true, replacedBy: 'christmas', decor: 'snow', accent: '#1f5f9e', busy: '#2b6cb0', background: '#eaf2fa', tint: '#d8e8f7', surface: '#fbfdff', surfaceAlt: '#eef5fc', text: '#1a2534', muted: '#4f5d70', border: '#d6e2ee', wallpaper: wash('radial-gradient(60% 50% at 0% 0%, #d9ebfb 0%, transparent 70%)', 'radial-gradient(50% 45% at 100% 20%, #eef6ff 0%, transparent 70%)', 'radial-gradient(70% 50% at 60% 100%, #dcebf8 0%, transparent 70%)') },
  aurora: { label: 'Daylight', accent: '#6554cf', busy: '#6554cf', background: '#faf8f5', tint: '#ede6fb' },
  linen: { label: 'Linen', accent: '#52604a', busy: '#52604a', background: '#f5f3ed', tint: '#e3e7da', surface: '#fffefa', surfaceAlt: '#eeece5', text: '#30342c', muted: '#686b61', border: '#deded4', warm: true },
  stone: { label: 'Stone', accent: '#6a6055', busy: '#6a6055', background: '#f2f0eb', tint: '#e6e0d7', surface: '#fdfcf9', surfaceAlt: '#eae7e0', text: '#37322c', muted: '#645d54', border: '#dcd7cf', warm: true },
  clay: { label: 'Clay', accent: '#8b5e49', busy: '#8b5e49', background: '#f7f2eb', tint: '#efdfd2', surface: '#fffcf7', surfaceAlt: '#eee5dc', text: '#3b312c', muted: '#6e5f55', border: '#e0d5c9', warm: true },
  pistachio: { label: 'Pistachio', accent: '#46613a', busy: '#46613a', background: '#f5f7ef', tint: '#e0ebce', surface: '#fdfef9', surfaceAlt: '#eff3e6' },
  dusk: { label: 'Soft dusk', accent: '#c4c9ac', busy: '#c4c9ac', background: '#252621', tint: '#3c4033', surface: '#30312b', surfaceAlt: '#383930', text: '#f2f0e7', muted: '#c0bfb1', border: '#4c4d42', dark: true, warm: true },
  'aurora-night': { label: 'Night aurora', accent: '#8bf0d6', busy: '#bea5ff', background: '#14152c', tint: '#31244c', dark: true },
  sunset: { label: 'Sunset', accent: '#96513e', busy: '#96513e', background: '#fff5ef', tint: '#f6dbd8' },
  space: { label: 'Space', accent: '#c9b8ff', busy: '#c9b8ff', background: '#101422', tint: '#292540', dark: true },
  sage: { label: 'Sage & cream', accent: '#365d4d', busy: '#365d4d', background: '#f4f5ef', tint: '#e6eddf' },
  lavender: { label: 'Lavender', accent: '#624a82', busy: '#624a82', background: '#f5f2f8', tint: '#eae2f3' },
  ocean: { label: 'Ocean blue', accent: '#2d567c', busy: '#2d567c', background: '#f0f5f9', tint: '#dfebf4' },
  rose: { label: 'Rose', accent: '#86485e', busy: '#86485e', background: '#faf2f5', tint: '#f2e0e7' },
  peach: { label: 'Warm peach', accent: '#965131', busy: '#965131', background: '#fbf4ed', tint: '#f5e4d5' },
  midnight: { label: 'Midnight', accent: '#b5cdbf', busy: '#b5cdbf', background: '#141e23', tint: '#263b35' },
  system: { label: 'Follow system' }
};
export const DEFAULT_APPEARANCE = { preset: 'linen', customAccent: false, accent: '#52604a', customBusy: false, busy: '#52604a' };
const validHex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function validateAppearance(value) {
  if (!value || !Object.hasOwn(PRESETS, value.preset) || typeof value.customAccent !== 'boolean' || typeof value.customBusy !== 'boolean' || !validHex(value.accent) || !validHex(value.busy) || (value.dark !== undefined && typeof value.dark !== 'boolean')) {
    throw new Error('Choose a theme and valid colours.');
  }
}

// ----- Dark mode for any theme: a dark version in the same colour family -----
function hexToHsl(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
// Lighten a colour until it is easy to read on the dark surfaces.
function brightOnDark(hex, surface) {
  const [h, s] = hexToHsl(hex);
  for (let l = .62; l <= .9; l += .02) { const c = hslToHex(h, Math.max(.4, Math.min(s, .85)), l); if (contrastRatio(c, surface) >= 4.5) return c; }
  return hslToHex(h, .5, .85);
}
function darkVersion(theme, keepAccent) {
  const [h, s] = hexToHsl(theme.accent), sat = Math.min(s, .5);
  const surface = hslToHex(h, sat * .4, .13);
  const accent = keepAccent ? theme.accent : brightOnDark(theme.accent, surface);
  const busy = theme.busyCustom ? theme.busy : brightOnDark(theme.busy || theme.accent, surface);
  return { ...theme, dark: true, warm: false,
    background: hslToHex(h, sat * .45, .085), surface, surfaceAlt: hslToHex(h, sat * .38, .17), border: hslToHex(h, sat * .3, .25), tint: hslToHex(h, sat * .55, .22),
    text: '#f2f3f7', muted: hslToHex(h, .12, .76), accent, busy,
    wallpaper: wash(`radial-gradient(60% 50% at 0% 0%, ${hslToHex(h, sat * .7, .17)} 0%, transparent 70%)`, `radial-gradient(50% 45% at 100% 90%, ${hslToHex((h + 40) % 360, sat * .6, .14)} 0%, transparent 70%)`) };
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
export function contrastRatio(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}
export function textOn(color) {
  return contrastRatio(color, '#ffffff') > contrastRatio(color, '#000000') ? '#ffffff' : '#000000';
}

export function resolveAppearance(value, systemDark = false) {
  validateAppearance(value);
  let key = value.preset === 'system' ? systemDark ? 'midnight' : 'sage' : value.preset;
  if (PRESETS[key].replacedBy) key = PRESETS[key].replacedBy;
  // Dark mode: a theme can name its own dark look (Christmas → snowy night); others get a generated one.
  const wantsDark = value.dark === true;
  if (wantsDark && PRESETS[key].darkVariant) key = PRESETS[key].darkVariant;
  const preset = PRESETS[key];
  const accent = value.customAccent ? value.accent : preset.accent;
  const busy = value.customBusy ? value.busy : preset.busy;
  const dark = Boolean(preset.dark || key === 'midnight');
  let theme = { surface: dark ? '#252734' : '#ffffff', surfaceAlt: dark ? '#2c2e3b' : '#f8f7fb', text: dark ? '#f1f0fa' : '#27273d', muted: dark ? '#bfc4da' : '#5d6076', border: dark ? '#454561' : '#e4e4ef', ...preset, dark, accent, busy, busyCustom: value.customBusy };
  if (wantsDark && !dark) theme = darkVersion(theme, value.customAccent);
  return { ...theme, accentText: textOn(theme.accent), busyText: textOn(theme.busy) };
}

export function createAppearanceStore(storage) {
  const saved = storage.getItem(APPEARANCE_KEY);
  let value = saved === null ? { ...DEFAULT_APPEARANCE } : JSON.parse(saved);
  validateAppearance(value);
  return {
    get: () => ({ ...value }),
    save(next) {
      validateAppearance(next);
      storage.setItem(APPEARANCE_KEY, JSON.stringify(next));
      value = { ...next };
    }
  };
}
