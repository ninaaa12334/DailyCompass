import test from 'node:test';
import assert from 'node:assert/strict';
import { APPEARANCE_KEY, PRESETS, DEFAULT_APPEARANCE, createAppearanceStore, resolveAppearance, contrastRatio } from './appearance.mjs';
import { createStorage } from './storage.mjs';
import { seedDemo } from './demo.mjs';
import { createTaskStore, STORAGE_KEY } from './task-store.mjs';
import { createCalendarStore, CALENDAR_KEY } from './calendar-store.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('preset and custom appearance persist after recreating the store', () => {
  const storage = memoryStorage();
  const value = { ...DEFAULT_APPEARANCE, preset: 'midnight', customAccent: true, accent: '#ffff00', customBusy: true, busy: '#ff00ff' };
  createAppearanceStore(storage).save(value);
  assert.deepEqual(createAppearanceStore(storage).get(), value);
});

test('all preset and custom accent/button text combinations meet 4.5:1 contrast', () => {
  for (const preset of Object.keys(PRESETS)) {
    for (const systemDark of [true, false]) {
      const theme = resolveAppearance({ ...DEFAULT_APPEARANCE, preset }, systemDark);
      assert.ok(contrastRatio(theme.accent, theme.accentText) >= 4.5);
      assert.ok(contrastRatio(theme.busy, theme.busyText) >= 4.5);
    }
  }
  for (const color of ['#ffffff', '#000000', '#ffff00', '#00ffff', '#ff0000', '#777777', '#0000ff']) {
    const theme = resolveAppearance({ ...DEFAULT_APPEARANCE, customAccent: true, accent: color, customBusy: true, busy: color });
    assert.ok(contrastRatio(theme.accent, theme.accentText) >= 4.5, color);
    assert.ok(contrastRatio(theme.busy, theme.busyText) >= 4.5, color);
  }
});

test('system theme responds to OS mode and corrupt preferences remain untouched', () => {
  const value = { ...DEFAULT_APPEARANCE, preset: 'system' };
  assert.equal(resolveAppearance(value, true).dark, true);
  assert.equal(resolveAppearance(value, false).dark, false);
  const storage = memoryStorage();
  storage.setItem(APPEARANCE_KEY, 'bad json');
  assert.throws(() => createAppearanceStore(storage));
  assert.equal(storage.getItem(APPEARANCE_KEY), 'bad json');
});

test('failed appearance writes do not change the current saved preferences', () => {
  const storage = memoryStorage();
  const store = createAppearanceStore(storage);
  storage.setItem = () => { throw new Error('Full'); };
  assert.throws(() => store.save({ ...DEFAULT_APPEARANCE, preset: 'rose' }));
  assert.deepEqual(store.get(), DEFAULT_APPEARANCE);
});

test('sample demo data, preferences, and edits cannot overwrite personal storage', () => {
  const local = memoryStorage();
  const session = memoryStorage();
  local.setItem(STORAGE_KEY, 'personal tasks');
  local.setItem(CALENDAR_KEY, 'personal calendar');
  local.setItem(APPEARANCE_KEY, 'personal appearance');
  const demo = createStorage(() => local, () => session, true);
  seedDemo(demo);
  const tasks = createTaskStore(demo);
  assert.equal(tasks.list().length, 3);
  tasks.remove('demo-1');
  seedDemo(demo); // Revisiting must not put removed samples back.
  assert.equal(createTaskStore(demo).list().length, 2);
  assert.doesNotThrow(() => createCalendarStore(demo));
  createAppearanceStore(demo).save({ ...DEFAULT_APPEARANCE, preset: 'peach' });
  assert.equal(local.getItem(STORAGE_KEY), 'personal tasks');
  assert.equal(local.getItem(CALENDAR_KEY), 'personal calendar');
  assert.equal(local.getItem(APPEARANCE_KEY), 'personal appearance');
});
