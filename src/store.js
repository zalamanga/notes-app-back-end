const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { validateNotePayload } = require('./validation');

const copy = (value) => structuredClone(value);
const validDate = (value) => typeof value === 'string'
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

const validateStoredNotes = (value) => {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  return value.every((note) => {
    if (!note || typeof note !== 'object' || Array.isArray(note)
        || Object.keys(note).length !== 6 || typeof note.id !== 'string' || !/^[\w-]{16}$/.test(note.id)
        || ids.has(note.id) || !validDate(note.createdAt) || !validDate(note.updatedAt)
        || note.updatedAt < note.createdAt
        || validateNotePayload({ title: note.title, tags: note.tags, body: note.body })) {
      return false;
    }
    ids.add(note.id);
    return true;
  });
};

const createNoteStore = async ({ filePath = null } = {}) => {
  if (filePath !== null && (typeof filePath !== 'string' || !path.isAbsolute(filePath))) {
    throw new Error('Path penyimpanan harus absolut atau null');
  }
  let notes = [];
  if (filePath) {
    try {
      const serialized = await fs.readFile(filePath, 'utf8');
      const loaded = JSON.parse(serialized);
      if (!validateStoredNotes(loaded)) throw new Error('Skema catatan tidak valid');
      notes = loaded;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error('Penyimpanan catatan tidak dapat dibaca; file tidak diubah', { cause: error });
      }
    }
  }

  const persist = async (next) => {
    if (!filePath) return;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
        encoding: 'utf8', mode: 0o600, flag: 'wx', flush: true,
      });
      await fs.rename(temporary, filePath);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
  };

  // A single queue keeps overlapping HTTP mutations from overwriting each other.
  let queue = Promise.resolve();
  const mutate = (change) => {
    const operation = queue.then(async () => {
      const next = copy(notes);
      const { changed, value } = change(next);
      if (changed) {
        await persist(next);
        notes = next;
      }
      return copy(value);
    });
    queue = operation.catch(() => {});
    return operation;
  };

  const checkInput = (input) => {
    const message = validateNotePayload(input);
    if (message) throw new TypeError(message);
    return copy(input);
  };

  return {
    list: () => copy(notes),
    find: (id) => copy(notes.find((note) => note.id === id)),
    add: (input) => {
      const payload = checkInput(input);
      return mutate((next) => {
        let id;
        do {
          id = randomBytes(12).toString('base64url');
        } while (next.some((note) => note.id === id));
        const createdAt = new Date().toISOString();
        const note = { ...payload, id, createdAt, updatedAt: createdAt };
        next.push(note);
        return { changed: true, value: note };
      });
    },
    update: (id, input) => {
      const payload = checkInput(input);
      return mutate((next) => {
        const index = next.findIndex((note) => note.id === id);
        if (index === -1) return { changed: false, value: undefined };
        const updatedAt = new Date(Math.max(Date.now(), Date.parse(next[index].updatedAt))).toISOString();
        next[index] = { ...next[index], ...payload, updatedAt };
        return { changed: true, value: next[index] };
      });
    },
    remove: (id) => mutate((next) => {
      const index = next.findIndex((note) => note.id === id);
      if (index === -1) return { changed: false, value: false };
      next.splice(index, 1);
      return { changed: true, value: true };
    }),
  };
};

module.exports = { createNoteStore };
