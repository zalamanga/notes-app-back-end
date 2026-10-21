# Koleksi Postman

Import `notes-api.postman_collection.json` dan `local.postman_environment.json`, lalu pilih environment **Notes App Back End - Local**.

`baseUrl` memakai `http://localhost:5000` untuk `npm start`. Untuk Docker dengan port bawaan, ubah menjadi `http://localhost:18087`.

Jalankan lima request sesuai urutan melalui Collection Runner. POST membuat catatan contoh dan menyimpan `noteId`; request berikutnya membaca, memperbarui, lalu menghapus catatan tersebut. Koleksi ini memuat 30 tes, termasuk pemeriksaan request lanjutan setelah pembaruan dan penghapusan. Tidak perlu mengisi `noteId` secara manual.

Koleksi berasal dari pengujian lokal proyek ini. Alamat server dijadikan variabel dan kegagalan jaringan pada request lanjutan ikut menggagalkan tes.
