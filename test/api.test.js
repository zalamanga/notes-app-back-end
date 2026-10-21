'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server');
const { createNoteStore } = require('../src/store');

const validNote = (overrides = {}) => ({
  title: 'Catatan pertama',
  tags: ['belajar'],
  body: 'Belajar membuat REST API.',
  ...overrides,
});

async function serverFor(t, store) {
  const server = await createServer({
    store: store || await createNoteStore({ filePath: null }),
    config: { port: 0, host: '127.0.0.1', dataFile: null, corsOrigins: ['*'] },
  });
  t.after(() => server.stop());
  return server;
}

test('health endpoint is available without exposing notes or configuration', async (t) => {
  const server = await serverFor(t);
  const response = await server.inject('/health');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.result, { status: 'success' });
});

test('CRUD keeps the original API response contract and stable creation timestamp', async (t) => {
  const server = await serverFor(t);
  const empty = await server.inject('/notes');
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.result, { status: 'success', data: { notes: [] } });

  const added = await server.inject({ method: 'POST', url: '/notes', payload: validNote() });
  assert.equal(added.statusCode, 201);
  assert.equal(added.result.status, 'success');
  assert.equal(added.result.message, 'Catatan berhasil ditambahkan');
  const { noteId } = added.result.data;
  assert.match(noteId, /^[A-Za-z0-9_-]{16}$/);

  const found = await server.inject(`/notes/${noteId}`);
  assert.equal(found.statusCode, 200);
  assert.equal(found.result.status, 'success');
  const original = found.result.data.note;
  assert.deepEqual(Object.keys(original).sort(), ['body', 'createdAt', 'id', 'tags', 'title', 'updatedAt']);
  assert.equal(original.title, validNote().title);
  assert.deepEqual(original.tags, validNote().tags);
  assert.equal(original.body, validNote().body);
  assert.equal(original.createdAt, original.updatedAt);
  assert.deepEqual((await server.inject('/notes')).result.data.notes, [original]);

  const updated = await server.inject({
    method: 'PUT', url: `/notes/${noteId}`, payload: validNote({ title: 'Diperbarui', tags: [], body: '' }),
  });
  assert.equal(updated.statusCode, 200);
  assert.deepEqual(updated.result, { status: 'success', message: 'Catatan berhasil diperbarui' });
  const replacement = (await server.inject(`/notes/${noteId}`)).result.data.note;
  assert.equal(replacement.id, noteId);
  assert.equal(replacement.createdAt, original.createdAt);
  assert.ok(Date.parse(replacement.updatedAt) >= Date.parse(original.updatedAt));
  assert.equal(replacement.title, 'Diperbarui');
  assert.equal(replacement.body, '');
  assert.deepEqual(replacement.tags, []);

  const deleted = await server.inject({ method: 'DELETE', url: `/notes/${noteId}` });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.result, { status: 'success', message: 'Catatan berhasil dihapus' });
  assert.deepEqual((await server.inject('/notes')).result.data.notes, []);
  assert.equal((await server.inject(`/notes/${noteId}`)).statusCode, 404);
});

test('unknown IDs return the original 404 responses for read, update, and delete', async (t) => {
  const server = await serverFor(t);
  const read = await server.inject('/notes/not-found');
  assert.equal(read.statusCode, 404);
  assert.deepEqual(read.result, { status: 'fail', message: 'Catatan tidak ditemukan' });
  const update = await server.inject({ method: 'PUT', url: '/notes/not-found', payload: validNote() });
  assert.equal(update.statusCode, 404);
  assert.deepEqual(update.result, { status: 'fail', message: 'Gagal memperbarui catatan. Id tidak ditemukan' });
  const remove = await server.inject({ method: 'DELETE', url: '/notes/not-found' });
  assert.equal(remove.statusCode, 404);
  assert.deepEqual(remove.result, { status: 'fail', message: 'Catatan gagal dihapus. Id tidak ditemukan' });
});

test('invalid note payloads fail without adding or changing notes', async (t) => {
  const server = await serverFor(t);
  const added = await server.inject({ method: 'POST', url: '/notes', payload: validNote() });
  const { noteId } = added.result.data;
  const before = (await server.inject(`/notes/${noteId}`)).result.data.note;
  const missing = validNote();
  delete missing.body;
  const invalidPayloads = [
    {}, missing, null, [], 'string',
    validNote({ title: '' }), validNote({ title: ' \t\n ' }),
    validNote({ title: 10 }), validNote({ title: 'a'.repeat(201) }),
    validNote({ body: null }), validNote({ body: 'a'.repeat(100001) }),
    validNote({ tags: 'tag' }), validNote({ tags: [1] }),
    validNote({ tags: ['a'.repeat(51)] }), validNote({ tags: Array(21).fill('tag') }),
    validNote({ owner: 'unrecognized' }), validNote({ id: 'client-controlled' }),
  ];
  for (const payload of invalidPayloads) {
    const body = JSON.stringify(payload);
    for (const [method, url] of [['POST', '/notes'], ['PUT', `/notes/${noteId}`]]) {
      const response = await server.inject({
        method, url, payload: body, headers: { 'content-type': 'application/json' },
      });
      assert.equal(response.statusCode, 400, `${method} accepted ${body.slice(0, 150)}`);
      assert.notEqual(response.result.status, 'success');
    }
  }
  assert.deepEqual((await server.inject('/notes')).result.data.notes, [before]);
});

test('inclusive note size boundaries remain valid', async (t) => {
  const server = await serverFor(t);
  const payload = validNote({ title: 'a'.repeat(200), tags: Array(20).fill('t'.repeat(50)), body: 'b'.repeat(100000) });
  const response = await server.inject({ method: 'POST', url: '/notes', payload });
  assert.equal(response.statusCode, 201);
  const note = (await server.inject(`/notes/${response.result.data.noteId}`)).result.data.note;
  assert.equal(note.title.length, 200);
  assert.equal(note.body.length, 100000);
  assert.deepEqual(note.tags, payload.tags);
});

test('malformed, empty, and non-JSON payloads are client errors', async (t) => {
  const server = await serverFor(t);
  for (const payload of ['', ' ', '{"title":']) {
    const response = await server.inject({
      method: 'POST', url: '/notes', payload, headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.statusCode, 400);
  }
  const text = await server.inject({
    method: 'POST', url: '/notes', payload: JSON.stringify(validNote()),
    headers: { 'content-type': 'text/plain' },
  });
  assert.ok([400, 415].includes(text.statusCode), `Unexpected status ${text.statusCode}`);
  assert.deepEqual((await server.inject('/notes')).result.data.notes, []);
});

test('JSON prototype keys cannot become note fields or pollute objects', async (t) => {
  const server = await serverFor(t);
  const payload = '{"title":"A","tags":[],"body":"","__proto__":{"polluted":true}}';
  const response = await server.inject({
    method: 'POST', url: '/notes', payload,
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal({}.polluted, undefined);
  assert.deepEqual((await server.inject('/notes')).result.data.notes, []);
});

test('requests over 128 KiB are rejected before the note reaches storage', async (t) => {
  const server = await serverFor(t);
  const response = await server.inject({
    method: 'POST', url: '/notes', payload: validNote({ body: 'x'.repeat(128 * 1024) }),
  });
  assert.equal(response.statusCode, 413);
  assert.deepEqual((await server.inject('/notes')).result.data.notes, []);
});

test('CORS preflight supports the original separate frontend', async (t) => {
  const server = await serverFor(t);
  const response = await server.inject({
    method: 'OPTIONS', url: '/notes', headers: {
      origin: 'http://localhost:8080',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
  assert.ok([200, 204].includes(response.statusCode));
  assert.ok(['*', 'http://localhost:8080'].includes(response.headers['access-control-allow-origin']));
  assert.match(response.headers['access-control-allow-methods'], /POST/);
  assert.match(response.headers['access-control-allow-headers'], /content-type/i);
});

test('storage failures return a generic 500 without disclosing filesystem paths', async (t) => {
  const secret = 'C:\\Users\\private-account\\notes-secret.json';
  const store = {
    list: () => [],
    find: () => undefined,
    add: async () => { throw new Error(`EACCES: ${secret}`); },
    update: async () => { throw new Error(`EACCES: ${secret}`); },
    remove: async () => { throw new Error(`EACCES: ${secret}`); },
  };
  const server = await serverFor(t, store);
  for (const [method, url] of [['POST', '/notes'], ['PUT', '/notes/some-id'], ['DELETE', '/notes/some-id']]) {
    const response = await server.inject({ method, url, ...(method === 'DELETE' ? {} : { payload: validNote() }) });
    assert.equal(response.statusCode, 500);
    assert.notEqual(response.result.status, 'success');
    assert.ok(!response.payload.includes('private-account'));
    assert.ok(!response.payload.includes('notes-secret'));
    assert.ok(!response.payload.includes('EACCES'));
  }
});
