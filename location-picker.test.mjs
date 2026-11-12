import test from 'node:test';
import assert from 'node:assert/strict';
import { countryChoices, supportedZones } from './location-picker.mjs';
import { memoryModel } from './server/plans.mjs';

test('country catalogue includes all supplied territories, Kosovo and multiple-zone countries', () => {
  const countries = countryChoices(); assert.equal(countries.length, 250);
  assert.equal(new Set(countries.map(c => c.code)).size, 250);
  assert.deepEqual(countries.find(c => c.code === 'XK').zones, ['Europe/Belgrade']);
  assert.ok(countries.find(c => c.code === 'US').zones.length > 20);
  assert.ok(countries.find(c => c.code === 'AU').zones.length > 5);
  const zones = supportedZones(); assert.ok(zones.length > 400); assert.ok(zones.includes('UTC')); assert.ok(zones.includes('Asia/Kolkata')); assert.ok(zones.includes('Asia/Kathmandu'));
});
test('country choice is validated and saved separately from the clock timezone', () => {
  const model = memoryModel(); model.saveSettings({ countryCode: 'XK', timeZone: 'Europe/Belgrade' });
  assert.equal(model.snapshot().settings.countryCode, 'XK');
  assert.throws(() => model.saveSettings({ countryCode: 'not-a-country' }), /country or territory/);
});
