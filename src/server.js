const Hapi = require('@hapi/hapi');
const { loadConfig } = require('./config');
const { createNoteStore } = require('./store');
const { createRoutes } = require('./routes');

const createServer = async ({ store, config = loadConfig() } = {}) => {
  const noteStore = store || await createNoteStore({ filePath: config.dataFile });
  const server = Hapi.server({
    port: config.port,
    host: config.host,
    routes: {
      cors: { origin: config.corsOrigins },
    },
  });

  server.route(createRoutes(noteStore));
  server.ext('onPreResponse', (request, h) => {
    const { response } = request;
    if (!response.isBoom) {
      return h.continue;
    }

    const statusCode = response.output.statusCode;
    const messages = {
      400: 'Payload JSON tidak valid',
      404: 'Rute tidak ditemukan',
      413: 'Ukuran payload melebihi batas 128 KiB',
      415: 'Content-Type harus application/json',
    };
    return h.response({
      status: statusCode >= 500 ? 'error' : 'fail',
      message: statusCode >= 500
        ? 'Terjadi kesalahan pada server'
        : messages[statusCode] || response.output.payload.error,
    }).code(statusCode);
  });

  await server.initialize();
  return server;
};

const start = async () => {
  const server = await createServer();
  await server.start();
  console.log(`Server berjalan pada ${server.info.uri}`);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await server.stop({ timeout: 10000 });
    } catch (error) {
      console.error('Server gagal dihentikan:', error.message);
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
};

if (require.main === module) {
  start().catch((error) => {
    console.error('Server gagal dimulai:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { createServer };
