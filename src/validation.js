const validateNotePayload = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'Payload harus berupa objek JSON';
  }

  const fields = ['title', 'tags', 'body'];
  const keys = Object.keys(value);
  if (keys.length !== fields.length || fields.some((field) => !keys.includes(field))) {
    return 'Payload harus memuat hanya title, tags, dan body';
  }

  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200) {
    return 'Title harus berupa teks tidak kosong dengan panjang maksimal 200 karakter';
  }

  if (typeof value.body !== 'string' || value.body.length > 100000) {
    return 'Body harus berupa teks dengan panjang maksimal 100000 karakter';
  }

  if (!Array.isArray(value.tags) || value.tags.length > 20
      || value.tags.some((tag) => typeof tag !== 'string' || tag.length > 50)) {
    return 'Tags harus berupa array maksimal 20 teks, masing-masing maksimal 50 karakter';
  }

  return null;
};

module.exports = { validateNotePayload };
