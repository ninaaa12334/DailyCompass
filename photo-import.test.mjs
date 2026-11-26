import test from 'node:test';
import assert from 'node:assert/strict';
import { readPhoto, cleanItems, checkImage, supabaseUser } from './server/photo-import.mjs';
import { planPhotoRows, photoInputs } from './photo-notes.mjs';
import { memoryModel } from './server/plans.mjs';

const image = `data:image/jpeg;base64,${Buffer.from('fake jpeg').toString('base64')}`;
const config = { OPENAI_API_KEY: 'key', OPENAI_MODEL: 'vision-model' };
const reply = items => async (url, request) => ({ ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ message: 'Found them.', items }) }] }] }), url, request });

test('reads dated items from a photo and sends the image to the model', async () => {
  let sent;
  const fetcher = async (url, request) => { sent = { url, body: JSON.parse(request.body) }; return reply([{ title: 'Maths test', date: '2026-12-03', start: '', end: '', seen: 'Maths test 3/12' }, { title: 'Biology exam', date: '2026-12-10', start: '09:00', end: '10:30', seen: 'Bio exam 10 Dec 9-10:30' }])(); };
  const result = await readPhoto({ image, timeZone: 'Europe/Belgrade' }, config, fetcher, new Date('2026-11-26T10:00:00Z'));
  assert.equal(sent.url, 'https://api.openai.com/v1/responses');
  assert.equal(sent.body.store, false);
  assert.equal(sent.body.input[0].content.at(-1).image_url, image);
  assert.match(sent.body.instructions, /Today is 2026-11-26/);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[1], { title: 'Biology exam', date: '2026-12-10', start: '09:00', end: '10:30', past: false, seen: 'Bio exam 10 Dec 9-10:30' });
});

test('photo reading explains what is missing when AI is not set up', async () => {
  await assert.rejects(readPhoto({ image }, {}), error => error.status === 503 && /GEMINI_API_KEY/.test(error.message));
});

test('uses free Gemini when a Gemini key is set', async () => {
  let sent;
  const fetcher = async (url, request) => { sent = { url, headers: request.headers, body: JSON.parse(request.body) }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ message: 'One test.', items: [{ title: 'Maths test', date: '2026-12-03', start: '', end: '', seen: 'Maths 3/12' }] }) }] } }] }) }; };
  const result = await readPhoto({ image, timeZone: 'Europe/Belgrade' }, { GEMINI_API_KEY: 'g-key', OPENAI_API_KEY: 'o', OPENAI_MODEL: 'm' }, fetcher, new Date('2026-11-26T10:00:00Z'));
  assert.match(sent.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-flash-lite-latest:generateContent$/);
  assert.equal(sent.headers['x-goog-api-key'], 'g-key');
  assert.deepEqual(sent.body.contents[0].parts.at(-1).inline_data, { mime_type: 'image/jpeg', data: image.split(',')[1] });
  assert.equal(result.items[0].title, 'Maths test');
  const limited = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) });
  await assert.rejects(readPhoto({ image }, { GEMINI_API_KEY: 'g' }, limited), /free Gemini limit/);
  const tried = [], busyThenOk = async url => { tried.push(url.match(/models\/([^:]+)/)[1]); return tried.length < 3 ? { ok: false, status: 503, json: async () => ({}) } : fetcher(url, { headers: {}, body: '{}' }); };
  await readPhoto({ image }, { GEMINI_API_KEY: 'g', retryDelay: 0 }, busyThenOk);
  assert.deepEqual(tried, ['gemini-flash-lite-latest', 'gemini-flash-lite-latest', 'gemini-flash-latest']);
});

test('rejects non-images and oversized photos', () => {
  assert.throws(() => checkImage('data:text/html;base64,PGI+'), /JPEG, PNG or WebP/);
  assert.throws(() => checkImage(`data:image/png;base64,${'A'.repeat(2_100_000)}`), /too large/);
});

test('doubtful dates and times from the AI become blank instead of guessed', () => {
  const items = cleanItems([{ title: ' History  essay ', date: '2026-02-30', start: '25:00', end: '', seen: '' }, { title: 'Quiz', date: '2026-11-01', start: '10:00', end: '09:00' }, { title: '', date: '2026-12-01' }], '2026-11-26');
  assert.deepEqual(items.map(({ title, date, start, end, past }) => ({ title, date, start, end, past })), [
    { title: 'History essay', date: '', start: '', end: '', past: false },
    { title: 'Quiz', date: '2026-11-01', start: '10:00', end: '', past: true }
  ]);
});

test('timed rows become events, untimed rows deadlines, and overlaps fall back to deadlines', () => {
  const school = [{ title: 'School', start: '08:00', end: '14:00' }];
  const planned = planPhotoRows([
    { title: 'Maths test', date: '2026-12-03', start: '', end: '' },
    { title: 'Piano exam', date: '2026-12-03', start: '16:00', end: '' },
    { title: 'Chemistry test', date: '2026-12-04', start: '10:00', end: '11:00' },
    { title: 'Essay', date: '', start: '', end: '' }
  ], date => date === '2026-12-04' ? school : []);
  assert.deepEqual(planned.map(p => p.as), ['deadline', 'event', 'deadline', 'missing-date']);
  assert.equal(planned[1].end, '17:00');
  assert.equal(planned[2].clash.title, 'School');
  let n = 0; const inputs = photoInputs(planned, () => `id-${++n}`);
  assert.equal(inputs.length, 3);
  const model = memoryModel(); model.saveActivities(inputs);
  assert.deepEqual(model.getTasks().map(t => [t.title, t.deadline, t.category]), [['Maths test', '2026-12-03', 'Study'], ['Chemistry test', '2026-12-04', 'Study']]);
  assert.match(model.getTasks()[1].notes, /Time on the note: 10:00–11:00/);
  assert.deepEqual(model.getDay('2026-12-03').commitments.map(e => [e.title, e.start, e.end]), [['Piano exam', '16:00', '17:00']]);
});

test('two timed rows from the same photo that overlap do not both become events', () => {
  const planned = planPhotoRows([{ title: 'Test A', date: '2026-12-03', start: '09:00', end: '10:00' }, { title: 'Test B', date: '2026-12-03', start: '09:30', end: '10:30' }], () => []);
  assert.deepEqual(planned.map(p => p.as), ['event', 'deadline']);
});

test('photo reading checks Supabase sign-in tokens', async () => {
  const ok = async (url, request) => ({ ok: request.headers.Authorization === 'Bearer a.b.c', json: async () => ({ id: 'user-1' }) });
  assert.deepEqual(await supabaseUser('a.b.c', { url: 'https://x', key: 'k' }, ok), { id: 'user-1' });
  assert.equal(await supabaseUser('x.y.z', { url: 'https://x', key: 'k' }, ok), null);
  assert.equal(await supabaseUser('', { url: 'https://x', key: 'k' }, ok), null);
});
