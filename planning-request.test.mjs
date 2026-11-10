import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretPlanningRequest } from './planning-request.mjs';
import { memoryModel, proposeAI } from './server/plans.mjs';
const settings = { timeZone: 'Europe/Budapest', planningStart: '08:00', planningEnd: '20:00' };
const at = new Date('2026-11-10T10:00:00Z');
test('prompt infers shared pm, explicit meridiems, noon crossings and 24-hour ranges', () => {
  for (const prompt of ['I want to practise math from 5 to 6 pm', 'Math between 5 and 6pm', 'Math 5pm to 6pm', 'Math from 17:00 to 18:00']) assert.deepEqual(interpretPlanningRequest(prompt, settings, at), { date: '2026-11-10', start: '17:00', end: '18:00' });
  assert.equal(interpretPlanningRequest('Study 11 to 1pm', settings, at).start, '11:00');
  assert.equal(interpretPlanningRequest('Math at 5 pm for 45 minutes', settings, at).end, '17:45');
});
test('today/tomorrow/weekdays and explicit dates resolve in the selected timezone', () => {
  assert.equal(interpretPlanningRequest('Math tomorrow from 5 to 6pm', settings, at).date, '2026-11-11');
  assert.equal(interpretPlanningRequest('Math Friday from 5 to 6pm', settings, at).date, '2026-11-13');
  assert.deepEqual(interpretPlanningRequest('Plan on 2026-11-20 from 17:00 to 18:00', settings, at), { date: '2026-11-20', start: '17:00', end: '18:00' });
  assert.equal(interpretPlanningRequest('Math from 5 to 6pm', { ...settings, timeZone: 'Asia/Tokyo' }, new Date('2026-11-10T20:00:00Z')).date, '2026-11-11');
});
test('unclear, invalid and overnight times ask for clarification instead of guessing', () => {
  for (const prompt of ['Math from 5 to 6', 'Math at 5', 'Math from 25:00 to 26:00', 'Math 11pm to 1am', 'Math next week', 'Math on 2026-02-30']) assert.ok(interpretPlanningRequest(prompt, settings, at).clarification, prompt);
  assert.deepEqual(interpretPlanningRequest('Help me plan my afternoon', settings, at), { date: '2026-11-10', start: '12:00', end: '18:00' });
});
test('prompt-only AI requests get inferred bounds, while clarification sends no provider request', async () => {
  const snapshot = memoryModel().snapshot(); Object.assign(snapshot.settings, settings);
  let context, calls = 0;
  const provider = async (url, options) => { calls++; context = JSON.parse(JSON.parse(options.body).input); return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ activities: [{ title: 'Practise maths', taskId: null, start: '17:00', end: '18:00', reason: 'Your requested time fits.' }] }) }] }] }); };
  const result = await proposeAI(snapshot, { prompt: 'I want to practise math from 5 to 6 pm' }, { OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'test-model' }, [], provider, at);
  assert.equal(result.date, '2026-11-10'); assert.equal(result.start, '17:00'); assert.equal(result.end, '18:00'); assert.equal(context.gaps[0].minutes, 60); assert.equal(snapshot.tasks.length, 0);
  const question = await proposeAI(snapshot, { prompt: 'Math from 5 to 6' }, {}, [], provider, at); assert.ok(question.clarification); assert.equal(calls, 1);
});
