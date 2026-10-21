const { createNoteHandlers } = require('./handler');
const { validateNotePayload } = require('./validation');

const notePayloadOptions = {
  payload: {
    allow: 'application/json',
    maxBytes: 128 * 1024,
  },
  validate: {
    payload: async (value) => {
      const message = validateNotePayload(value);
      if (message) {
        throw new Error(message);
      }
      return value;
    },
    failAction: (request, h) => h.response({
      status: 'fail',
      message: validateNotePayload(request.payload) || 'Payload catatan tidak valid',
    }).code(400).takeover(),
  },
};

const createRoutes = (store) => {
  const handlers = createNoteHandlers(store);
  return [
    {
      method: 'GET',
      path: '/health',
      handler: () => ({ status: 'success' }),
    },
    {
      method: 'POST',
      path: '/notes',
      handler: handlers.addNoteHandler,
      options: notePayloadOptions,
    },
    {
      method: 'GET',
      path: '/notes',
      handler: handlers.getAllNotesHandler,
    },
    {
      method: 'GET',
      path: '/notes/{id}',
      handler: handlers.getNoteByIdHandler,
    },
    {
      method: 'PUT',
      path: '/notes/{id}',
      handler: handlers.editNoteByIdHandler,
      options: notePayloadOptions,
    },
    {
      method: 'DELETE',
      path: '/notes/{id}',
      handler: handlers.deleteNoteByIdHandler,
    },
  ];
};

module.exports = { createRoutes };
