export const APPEARANCE_KEY = 'day-compass.appearance.v1';
export const PRESETS = {
  aurora: { label: 'Daylight', accent: '#6554cf', busy: '#6554cf', background: '#faf8f5', tint: '#ede6fb' },
  linen: { label: 'Linen', accent: '#73574c', busy: '#73574c', background: '#f8f5ef', tint: '#ece2d3', surface: '#fffcf7', surfaceAlt: '#f3eee5' },
  pistachio: { label: 'Pistachio', accent: '#46613a', busy: '#46613a', background: '#f5f7ef', tint: '#e0ebce', surface: '#fdfef9', surfaceAlt: '#eff3e6' },
  dusk: { label: 'Soft dusk', accent: '#dfbda8', busy: '#c4b5e8', background: '#24232a', tint: '#3f3543', surface: '#2d2b33', surfaceAlt: '#35313c', dark: true },
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
export const DEFAULT_APPEARANCE = { preset: 'aurora', customAccent: false, accent: '#6554cf', customBusy: false, busy: '#6554cf' };
const validHex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function validateAppearance(value) {
  if (!value || !Object.hasOwn(PRESETS, value.preset) || typeof value.customAccent !== 'boolean' || typeof value.customBusy !== 'boolean' || !validHex(value.accent) || !validHex(value.busy)) {
    throw new Error('Choose a theme and valid colours.');
  }
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
  const key = value.preset === 'system' ? systemDark ? 'midnight' : 'sage' : value.preset;
  const preset = PRESETS[key];
  const accent = value.customAccent ? value.accent : preset.accent;
  const busy = value.customBusy ? value.busy : preset.busy;
  const dark = Boolean(preset.dark || key === 'midnight');
  return { surface: dark ? '#252734' : '#ffffff', surfaceAlt: dark ? '#2c2e3b' : '#f8f7fb', ...preset, dark, accent, accentText: textOn(accent), busy, busyText: textOn(busy) };
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
