'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadConfig } = require('../src/config');

test('configuration defaults keep the server local and persist inside the project', () => {
  assert.deepEqual(loadConfig({}), {
    port: 5000,
    host: '127.0.0.1',
    dataFile: path.resolve(__dirname, '..', 'data', 'notes.json'),
    corsOrigins: ['*'],
  });
});

test('configuration supports explicit ports, hosts, D-drive storage, memory mode, and origins', () => {
  const absoluteFile = path.resolve(__dirname, '..', 'test-results', 'notes.json');
  assert.deepEqual(loadConfig({
    PORT: '65535', HOST: '0.0.0.0', DATA_FILE: absoluteFile,
    CORS_ORIGINS: 'https://notes.example,http://localhost:8080',
  }), {
    port: 65535,
    host: '0.0.0.0',
    dataFile: absoluteFile,
    corsOrigins: ['https://notes.example', 'http://localhost:8080'],
  });
  assert.equal(loadConfig({ DATA_FILE: ':memory:' }).dataFile, null);
  assert.equal(loadConfig({ DATA_FILE: 'custom/notes.json' }).dataFile,
    path.resolve(__dirname, '..', 'custom', 'notes.json'));
  assert.equal(loadConfig({ HOST: 'localhost', PORT: '1' }).host, 'localhost');
  assert.equal(loadConfig({ HOST: '::1' }).host, '::1');
});

test('invalid environment settings fail before the server starts', () => {
  const invalid = [
    { PORT: '0' }, { PORT: '65536' }, { PORT: '-1' }, { PORT: '3.5' }, { PORT: '5000abc' }, { PORT: '' },
    { HOST: '' }, { HOST: 'http://localhost' }, { HOST: 'has space' }, { HOST: 'a'.repeat(254) },
    { DATA_FILE: '' }, { DATA_FILE: '  ' }, { DATA_FILE: 'notes\0.json' },
    { CORS_ORIGINS: '' }, { CORS_ORIGINS: '*,https://notes.example' },
    { CORS_ORIGINS: 'https://notes.example/' }, { CORS_ORIGINS: 'https://notes.example/path' },
    { CORS_ORIGINS: 'https://user:password@notes.example' }, { CORS_ORIGINS: 'file:///notes' },
  ];
  for (const environment of invalid) {
    assert.throws(() => loadConfig(environment), undefined, JSON.stringify(environment));
  }
});
