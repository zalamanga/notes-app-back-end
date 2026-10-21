'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createNoteStore } = require('../src/store');

const scratchRoot = path.resolve(__dirname, '..', 'test-results');
const noteInput = (title = 'Belajar Node.js') => ({
  title,
  tags: ['belajar', 'backend'],
  body: 'Isi catatan pertama.',
});

async function scratch(t) {
  await fs.mkdir(scratchRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(scratchRoot, 'store-'));
  t.after(async () => {
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), scratchRoot);
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return directory;
}

test('memory stores are isolated and preserve note identity through CRUD', async () => {
  const store = await createNoteStore({ filePath: null });
  const otherStore = await createNoteStore({ filePath: null });
  const created = await store.add(noteInput());
  assert.match(created.id, /^[A-Za-z0-9_-]{16}$/);
  assert.ok(Number.isFinite(Date.parse(created.createdAt)));
  assert.equal(created.createdAt, created.updatedAt);
  assert.deepEqual(otherStore.list(), []);

  const updated = await store.update(created.id, noteInput('Judul baru'));
  assert.equal(updated.id, created.id);
  assert.equal(updated.createdAt, created.createdAt);
  assert.ok(Date.parse(updated.updatedAt) >= Date.parse(created.updatedAt));
  assert.equal(store.find(created.id).title, 'Judul baru');
  assert.equal(await store.update('unknown-note-id', noteInput()), undefined);
  assert.equal(await store.remove('unknown-note-id'), false);
  assert.equal(await store.remove(created.id), true);
  assert.equal(store.find(created.id), undefined);
  assert.deepEqual(store.list(), []);
});

test('input and returned objects cannot mutate stored notes', async () => {
  const store = await createNoteStore({ filePath: null });
  const input = noteInput();
  const original = await store.add(input);
  const id = original.id;
  input.tags.push('mutated input');
  input.title = 'mutated input';
  original.tags.push('mutated add result');
  original.title = 'mutated add result';
  const found = store.find(id);
  found.tags.push('mutated find result');
  const listed = store.list();
  listed[0].body = 'mutated list result';
  listed.push({ id: 'injected' });
  assert.deepEqual(store.find(id), {
    id,
    ...noteInput(),
    createdAt: original.createdAt,
    updatedAt: original.updatedAt,
  });

  const update = noteInput('Updated');
  const result = await store.update(id, update);
  update.tags.push('mutated update input');
  result.tags.push('mutated update result');
  assert.deepEqual(store.find(id).tags, ['belajar', 'backend']);
});

test('notes survive reload, update, and deletion from the JSON file', async (t) => {
  const directory = await scratch(t);
  const filePath = path.join(directory, 'nested', 'notes.json');
  const store = await createNoteStore({ filePath });
  const note = await store.add(noteInput());
  assert.deepEqual((await createNoteStore({ filePath })).list(), [note]);
  const updated = await store.update(note.id, noteInput('Tersimpan'));
  assert.deepEqual((await createNoteStore({ filePath })).find(note.id), updated);
  await store.remove(note.id);
  assert.deepEqual((await createNoteStore({ filePath })).list(), []);
});

test('concurrent writes do not lose notes or overwrite unrelated updates', async (t) => {
  const directory = await scratch(t);
  const filePath = path.join(directory, 'notes.json');
  const store = await createNoteStore({ filePath });
  const created = await Promise.all(Array.from({ length: 12 }, (_, index) => (
    store.add(noteInput(`Catatan ${index}`))
  )));
  assert.equal(new Set(created.map(({ id }) => id)).size, 12);
  await Promise.all(created.map(({ id }, index) => (
    store.update(id, noteInput(`Diperbarui ${index}`))
  )));
  const reloaded = await createNoteStore({ filePath });
  assert.equal(reloaded.list().length, 12);
  for (const [index, { id }] of created.entries()) {
    assert.equal(reloaded.find(id).title, `Diperbarui ${index}`);
  }
});

test('invalid JSON is refused without replacing the existing data file', async (t) => {
  const directory = await scratch(t);
  const filePath = path.join(directory, 'notes.json');
  const invalid = '{"notes": [ unfinished';
  await fs.writeFile(filePath, invalid);
  await assert.rejects(createNoteStore({ filePath }));
  assert.equal(await fs.readFile(filePath, 'utf8'), invalid);
});

test('invalid persisted shapes, duplicate IDs, and timestamps are refused without overwriting', async (t) => {
  const directory = await scratch(t);
  const filePath = path.join(directory, 'notes.json');
  const note = {
    ...noteInput(), id: 'abcdefghijklmnop',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const invalid = [
    { notes: [] }, [note, note], [{ ...note, body: null }],
    [{ ...note, id: 'short' }], [{ ...note, createdAt: 'not a date' }],
    [{ ...note, updatedAt: '2025-01-01T00:00:00.000Z' }],
    [{ ...note, extra: 'unrecognized' }],
  ];
  for (const contents of invalid) {
    const serialized = JSON.stringify(contents);
    await fs.writeFile(filePath, serialized);
    await assert.rejects(createNoteStore({ filePath }));
    assert.equal(await fs.readFile(filePath, 'utf8'), serialized);
  }
});

test('failed persistence leaves both memory and previous disk data unchanged', async (t) => {
  const directory = await scratch(t);
  const dataDirectory = path.join(directory, 'data');
  const keptDirectory = path.join(directory, 'kept');
  const filePath = path.join(dataDirectory, 'notes.json');
  const store = await createNoteStore({ filePath });
  const original = await store.add(noteInput());
  const originalFile = await fs.readFile(filePath, 'utf8');
  await fs.rename(dataDirectory, keptDirectory);
  await fs.writeFile(dataDirectory, 'block parent directory');
  try {
    await assert.rejects(store.update(original.id, noteInput('Must not commit')));
    assert.deepEqual(store.find(original.id), original);
    await assert.rejects(store.add(noteInput('Must not exist')));
    assert.deepEqual(store.list(), [original]);
    await assert.rejects(store.remove(original.id));
    assert.deepEqual(store.find(original.id), original);
    assert.equal(await fs.readFile(path.join(keptDirectory, 'notes.json'), 'utf8'), originalFile);
  } finally {
    await fs.unlink(dataDirectory);
    await fs.rename(keptDirectory, dataDirectory);
  }
  const recovered = await store.update(original.id, noteInput('Retry succeeds'));
  assert.equal(recovered.title, 'Retry succeeds');
  assert.deepEqual((await createNoteStore({ filePath })).find(original.id), recovered);
});
