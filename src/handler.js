const createNoteHandlers = (store) => ({
  addNoteHandler: async (request, h) => {
    const note = await store.add(request.payload);
    return h.response({
      status: 'success',
      message: 'Catatan berhasil ditambahkan',
      data: { noteId: note.id },
    }).code(201);
  },

  getAllNotesHandler: () => ({
    status: 'success',
    data: { notes: store.list() },
  }),

  getNoteByIdHandler: (request, h) => {
    const note = store.find(request.params.id);
    if (note) {
      return { status: 'success', data: { note } };
    }
    return h.response({
      status: 'fail',
      message: 'Catatan tidak ditemukan',
    }).code(404);
  },

  editNoteByIdHandler: async (request, h) => {
    const note = await store.update(request.params.id, request.payload);
    if (note) {
      return {
        status: 'success',
        message: 'Catatan berhasil diperbarui',
      };
    }
    return h.response({
      status: 'fail',
      message: 'Gagal memperbarui catatan. Id tidak ditemukan',
    }).code(404);
  },

  deleteNoteByIdHandler: async (request, h) => {
    if (await store.remove(request.params.id)) {
      return {
        status: 'success',
        message: 'Catatan berhasil dihapus',
      };
    }
    return h.response({
      status: 'fail',
      message: 'Catatan gagal dihapus. Id tidak ditemukan',
    }).code(404);
  },
});

module.exports = { createNoteHandlers };
