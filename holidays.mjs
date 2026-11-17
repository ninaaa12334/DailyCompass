// Public holidays shown at the top of each day, like in a real calendar.
// Kosovo's official holidays are built in (the holiday service doesn't cover Kosovo);
// other countries come from the free Nager.Date service and are remembered on this device.
const SERVICE = 'https://date.nager.at/api/v3';
const memory = new Map(); // "XK|2026" → [{ date, name }]
const pending = new Set();

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function westernEaster(y) { // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1; return iso(y, month, day);
}
function orthodoxEaster(y) { // Julian computus, shown on the Gregorian calendar (+13 days for 1900–2099)
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7, month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  const date = new Date(Date.UTC(y, month - 1, day + 13)); return date.toISOString().slice(0, 10);
}
// Bajram dates follow the moon; these are the expected dates (the official day can differ by one).
const EID = { 2025: ['2025-03-30', '2025-06-06'], 2026: ['2026-03-20', '2026-05-27'], 2027: ['2027-03-10', '2027-05-16'], 2028: ['2028-02-27', '2028-05-05'], 2029: ['2029-02-15', '2029-04-24'], 2030: ['2030-02-05', '2030-04-13'], 2031: ['2031-01-25', '2031-04-02'], 2032: ['2032-01-14', '2032-03-22'] };
function kosovo(y) {
  const list = [[iso(y, 1, 1), 'New Year’s Day'], [iso(y, 1, 2), 'New Year holiday'], [iso(y, 1, 7), 'Orthodox Christmas'], [iso(y, 2, 17), 'Independence Day'], [iso(y, 4, 9), 'Constitution Day'],
    [westernEaster(y), 'Catholic Easter'], [orthodoxEaster(y), 'Orthodox Easter'], [iso(y, 5, 1), 'Labour Day'], [iso(y, 5, 9), 'Europe Day'], [iso(y, 12, 25), 'Catholic Christmas']];
  if (EID[y]) list.push([EID[y][0], 'Eid al-Fitr (Fitër Bajram) · may vary by a day'], [EID[y][1], 'Eid al-Adha (Kurban Bajram) · may vary by a day']);
  return list.map(([date, name]) => ({ date, name }));
}

function cacheKey(country, year) { return `day-compass.holidays.${country}.${year}`; }
function loadYear(country, year) {
  const key = `${country}|${year}`;
  if (memory.has(key) || pending.has(key)) return;
  if (country === 'XK') { memory.set(key, kosovo(year)); return; }
  try { const saved = JSON.parse(localStorage.getItem(cacheKey(country, year))); if (saved && Date.now() - saved.at < 30 * 86400000) { memory.set(key, saved.list); return; } } catch {}
  pending.add(key);
  fetch(`${SERVICE}/PublicHolidays/${year}/${encodeURIComponent(country)}`).then(r => r.ok ? r.json() : []).then(data => {
    const list = (Array.isArray(data) ? data : []).filter(h => !h.types || h.types.includes('Public')).map(h => ({ date: h.date, name: h.localName && h.localName !== h.name ? `${h.name} (${h.localName})` : h.name }));
    memory.set(key, list);
    try { localStorage.setItem(cacheKey(country, year), JSON.stringify({ at: Date.now(), list })); } catch {}
    document.dispatchEvent(new Event('holidays-updated'));
  }).catch(() => memory.set(key, [])).finally(() => pending.delete(key));
}

// What the calendar asks: "is this date a holiday?" (loads the year in the background the first time).
export function holidaysOn(settings, date) {
  const h = settings?.holidays || { show: true, country: settings?.countryCode || '' }; // on by default for your country
  if (!h || h.show === false || !h.country) return [];
  const year = Number(date.slice(0, 4)), key = `${h.country}|${year}`;
  if (!memory.has(key)) { loadYear(h.country, year); if (!memory.has(key)) return []; }
  return memory.get(key).filter(item => item.date === date).map(item => item.name);
}

let countries = null;
export async function holidayCountries() {
  if (countries) return countries;
  try { const saved = JSON.parse(localStorage.getItem('day-compass.holiday-countries')); if (saved?.length) countries = saved; } catch {}
  if (!countries) {
    try { countries = (await (await fetch(`${SERVICE}/AvailableCountries`)).json()).map(c => ({ code: c.countryCode, name: c.name })); localStorage.setItem('day-compass.holiday-countries', JSON.stringify(countries)); }
    catch { countries = []; }
  }
  if (!countries.some(c => c.code === 'XK')) countries = [...countries, { code: 'XK', name: 'Kosovo' }];
  return countries.sort((a, b) => a.name.localeCompare(b.name));
}

// "Show holidays" switch + country, used in Settings and in the Google Calendar tile.
export function holidayControls({ model, feedback = () => {} }) {
  const box = document.createElement('div'); box.className = 'holiday-controls';
  box.innerHTML = '<label class="hub-switch"><span><strong>Show public holidays</strong><small>At the top of each day, like a real calendar</small></span><input type="checkbox" role="switch"></label><label class="hub-row"><span><strong>Country</strong></span><select><option value="">Choose…</option></select></label>';
  const toggle = box.querySelector('input'), select = box.querySelector('select');
  const current = () => ({ show: true, country: model.getSettings().countryCode || '', ...(model.getSettings().holidays || {}) });
  async function fill() {
    const list = await holidayCountries(), chosen = current().country;
    select.replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: 'Choose…' }), ...list.map(c => Object.assign(document.createElement('option'), { value: c.code, textContent: c.name, selected: c.code === chosen })));
  }
  function sync() { const h = current(); toggle.checked = h.show !== false; select.value = h.country; select.closest('label').hidden = h.show === false; }
  const save = next => { try { model.saveSettings({ holidays: { ...current(), ...next } }); } catch (error) { feedback(error.message); } sync(); };
  toggle.addEventListener('change', () => save({ show: toggle.checked }));
  select.addEventListener('change', () => save({ country: select.value }));
  model.subscribe(sync); fill().then(sync); sync();
  return box;
}
