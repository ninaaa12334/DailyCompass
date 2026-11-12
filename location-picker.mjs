import { LOCATIONS } from './location-data.mjs';

export function countryChoices() {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  return LOCATIONS.map(c => ({ ...c, name: c.code === 'XK' ? 'Kosovo' : names.of(c.code) || c.name })).sort((a,b) => a.name.localeCompare(b.name));
}
export function supportedZones() {
  const runtime = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const fixed = Array.from({ length: 27 }, (_, i) => { const offset = i - 14; return `Etc/GMT${offset >= 0 ? '+' : ''}${offset}`; });
  return [...new Set(['UTC', ...runtime, ...LOCATIONS.flatMap(c => c.zones), ...fixed])].filter(zone => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return true; } catch { return false; }
  }).sort();
}
export function initLocationPicker(settings, onChange) {
  const $ = s => document.querySelector(s), country = $('#onboarding-country'), zone = $('#onboarding-zone'), all = $('#onboarding-all-zones');
  const choices = countryChoices(), zones = supportedZones();
  for (const c of choices) { const option = document.createElement('option'); option.value = c.name; option.label = c.code; $('#onboarding-countries').append(option); }
  const selected = choices.find(c => c.code === settings.countryCode);
  country.value = selected?.name || ''; zone.value = settings.timeZone;
  all.checked = Boolean(selected && !selected.zones.includes(settings.timeZone));
  const match = () => choices.find(c => c.name.toLowerCase() === country.value.trim().toLowerCase() || c.code === country.value.trim().toUpperCase());
  function update(preserve = false) {
    const c = match(), invalid = country.value.trim() && !c;
    country.setCustomValidity(invalid ? 'Choose a country from the suggestions, or leave it empty to browse all timezones.' : '');
    if (invalid) return;
    const local = c?.zones.filter(z => zones.includes(z)) || [];
    const list = !c || all.checked || !local.length ? zones : local;
    $('#onboarding-zones').replaceChildren();
    for (const id of list) { const option = document.createElement('option'); option.value = id; $('#onboarding-zones').append(option); }
    if (!preserve && c && !all.checked && !local.includes(zone.value)) zone.value = local.length === 1 ? local[0] : '';
    $('#onboarding-location-help').textContent = c?.code === 'XK' && !all.checked ? 'Kosovo: Central European Time. Europe/Belgrade is the technical timezone identifier used for these clock rules.' : c && !all.checked && !local.length ? 'No geographic timezone is listed for this territory. Choose an appropriate timezone from the full list.' : c && !all.checked ? `${local.length} timezone option${local.length === 1 ? '' : 's'} for ${c.name}. Choose the zone that matches your city or region.` : `${zones.length} supported timezone options. Search by city or identifier, such as Asia/Kolkata or America/New_York.`;
    onChange();
  }
  country.addEventListener('input', () => update()); all.addEventListener('change', () => update(true));
  update(true);
  return { countryCode: () => match()?.code || '' };
}
