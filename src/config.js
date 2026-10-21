const path = require('node:path');
const { isIP } = require('node:net');

const projectRoot = path.resolve(__dirname, '..');

const loadConfig = (env = process.env) => {
  const portText = env.PORT ?? '5000';
  if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
    throw new Error('PORT harus berupa angka 1-65535');
  }

  const host = env.HOST ?? '127.0.0.1';
  const hostname = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i;
  if (typeof host !== 'string' || host.length > 253 || (!isIP(host) && !hostname.test(host))) {
    throw new Error('HOST harus berupa alamat IP atau hostname');
  }

  const dataFileText = env.DATA_FILE ?? 'data/notes.json';
  if (typeof dataFileText !== 'string' || !dataFileText.trim() || dataFileText.includes('\0')) {
    throw new Error('DATA_FILE harus berupa path file atau :memory:');
  }

  const originsText = env.CORS_ORIGINS ?? '*';
  if (typeof originsText !== 'string') throw new Error('CORS_ORIGINS harus berupa teks');
  const corsOrigins = originsText.split(',').map((origin) => origin.trim());
  if (corsOrigins.includes('*') && corsOrigins.length !== 1) {
    throw new Error('Wildcard CORS tidak dapat digabung dengan origin lain');
  }
  for (const origin of corsOrigins) {
    if (origin === '*') continue;
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGINS harus berisi origin HTTP/HTTPS yang dipisahkan koma');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('CORS_ORIGINS harus berupa origin tanpa path atau kredensial');
    }
  }

  return {
    port: Number(portText),
    host,
    dataFile: dataFileText === ':memory:' ? null : path.resolve(projectRoot, dataFileText),
    corsOrigins,
  };
};

module.exports = { loadConfig };
