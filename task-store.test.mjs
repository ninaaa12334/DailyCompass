import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskStore, STORAGE_KEY } from './task-store.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const example = { id: 'task-1', title: '<strong>Algebra</strong>', category: 'Study', deadline: '2026-11-10', duration: 30, priority: 'High', completed: false };

test('add, reload, complete, edit, reopen, and delete persist correctly', () => {
  const storage = memoryStorage();
  let store = createTaskStore(storage);
  store.add(example);
  store = createTaskStore(storage);
  assert.deepEqual(store.list(), [example]);
  store.toggle(example.id);
  store.update(example.id, { title: 'Geometry', duration: 45, completed: false });
  store = createTaskStore(storage);
  assert.equal(store.list()[0].title, 'Geometry');
  assert.equal(store.list()[0].duration, 45);
  assert.equal(store.list()[0].completed, true);
  store.toggle(example.id);
  assert.equal(createTaskStore(storage).list()[0].completed, false);
  store.remove(example.id);
  assert.deepEqual(createTaskStore(storage).list(), []);
});

test('rejects invalid fields and impossible dates without saving', () => {
  const store = createTaskStore(memoryStorage());
  for (const fields of [{ title: '  ' }, { duration: 0 }, { duration: 1.5 }, { duration: 1441 }, { deadline: '2026-02-30' }, { priority: 'Urgent' }, { category: 'Other' }]) {
    assert.throws(() => store.add({ ...example, ...fields }));
  }
  assert.deepEqual(store.list(), []);
});

test('storage failure leaves the previous list unchanged', () => {
  const storage = memoryStorage();
  const store = createTaskStore(storage);
  store.add(example);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => store.remove(example.id));
  assert.deepEqual(store.list(), [example]);
});

test('corrupt stored data is preserved for recovery', () => {
  const storage = memoryStorage();
  for (const corrupt of ['broken json', '{}', JSON.stringify([example, example])]) {
    storage.setItem(STORAGE_KEY, corrupt);
    assert.throws(() => createTaskStore(storage));
    assert.equal(storage.getItem(STORAGE_KEY), corrupt);
  }
});

test('callers cannot change saved data by mutating returned objects', () => {
  const store = createTaskStore(memoryStorage());
  store.add(example);
  store.list()[0].title = 'Changed outside the store';
  assert.equal(store.list()[0].title, example.title);
});
