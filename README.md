# Notes App Back End

REST API catatan menggunakan Node.js dan Hapi. API menyediakan tambah, daftar, detail, ubah, dan hapus catatan melalui `/notes`. Project ini tidak memiliki halaman web atau endpoint `/books`; README lama tentang Bookshelf API telah dikoreksi.

Kontrak respons CRUD dan pesan bahasa Indonesia dari source awal dipertahankan. Perbaikan mencakup validasi input, penyimpanan JSON yang bertahan setelah restart, konfigurasi melalui environment, Docker, dan tes otomatis.

## Menjalankan dengan Docker

Gunakan Docker Desktop dengan Linux containers atau Docker Engine dan Compose:

```powershell
git clone https://github.com/zalamanga/notes-app-back-end.git
Set-Location -LiteralPath '.\notes-app-back-end'
docker compose up -d --build
docker compose ps
Invoke-RestMethod 'http://127.0.0.1:18087/health'
```

API tersedia di `http://127.0.0.1:18087`. `/health` mengembalikan `{"status":"success"}`; `/notes` menampilkan catatan. Membuka alamat utama `/` mengembalikan JSON 404 karena project ini hanya backend.

Nginx, MySQL, PHP, dan Java tidak diperlukan. Container menjalankan Node.js sebagai pengguna `node`, memakai filesystem baca saja, serta menyimpan catatan di named volume `notes-data` pada `/app/data/notes.json`. Port diikat ke komputer lokal. Image dasar dikunci dengan digest; hanya dependency produksi dan source runtime yang dimasukkan ke image.

Berhenti dengan `docker compose down`. Named volume tetap disimpan sehingga catatan tersedia saat project dijalankan kembali. Menghapus volume juga menghapus catatan di dalamnya. Perubahan kode memerlukan `docker compose up -d --build` lagi.

Port dan origin frontend dapat diatur sebelum menjalankan Compose:

```powershell
$env:APP_PORT = '18088'
$env:CORS_ORIGINS = 'http://localhost:8080'
docker compose up -d --build
```

Alternatifnya, salin `.env.example` menjadi `.env` dan sesuaikan nilainya. Compose membaca `.env` secara otomatis; `npm start` memakai environment shell dan tidak membaca file tersebut.

## Menjalankan tanpa Docker

Gunakan Node.js 22.13+ pada seri 22, atau Node.js 24+. Versi lokal yang dipakai untuk pengujian tercatat dalam laporan pengembangan; dependency dikunci di `package-lock.json`.

```powershell
npm ci
npm start
```

Alamat default: `http://127.0.0.1:5000`. Hentikan dengan `Ctrl+C`. `npm run start-dev` menggunakan watch mode bawaan Node.js; `npm run start-prod` merupakan alias perintah start yang juga bekerja di Windows.

| Environment | Default | Kegunaan |
| --- | --- | --- |
| `PORT` | `5000` | Port proses Node, angka 1-65535 |
| `HOST` | `127.0.0.1` | IP/hostname yang dipakai server; Docker memakai `0.0.0.0` |
| `DATA_FILE` | `data/notes.json` | Path JSON; path relatif dihitung dari root project |
| `CORS_ORIGINS` | `*` | Satu atau beberapa origin HTTP/HTTPS, dipisahkan koma |
| `APP_PORT` | `18087` | Port host Docker Compose; tidak dipakai `npm start` |

`DATA_FILE=:memory:` memakai penyimpanan sementara; seluruh catatan pada mode itu hilang saat proses berhenti. Konfigurasi yang tidak valid membuat server gagal mulai dengan pesan kesalahan. Contoh menjalankan penyimpanan lain di D:

```powershell
$env:DATA_FILE = 'D:\DevData\notes-app\notes.json'
$env:PORT = '5001'
npm start
```

## Endpoint

| Method | Path | Berhasil | Hasil |
| --- | --- | --- | --- |
| GET | `/health` | 200 | Status proses |
| POST | `/notes` | 201 | `data.noteId` |
| GET | `/notes` | 200 | `data.notes`, berisi objek catatan lengkap |
| GET | `/notes/{id}` | 200 | `data.note` |
| PUT | `/notes/{id}` | 200 | Mengganti title, tags, dan body |
| DELETE | `/notes/{id}` | 200 | Menghapus catatan |

GET detail, PUT, dan DELETE dengan ID tidak ditemukan mengembalikan 404. ID dibuat server, terdiri dari 16 karakter. `createdAt` tetap saat pembaruan; `updatedAt` mengikuti pembaruan. Tanggal memakai format ISO UTC.

POST dan PUT memerlukan `Content-Type: application/json` serta tepat tiga field berikut:

```json
{
  "title": "Catatan pertama",
  "tags": ["belajar", "backend"],
  "body": "Belajar membuat REST API."
}
```

- `title`: string tidak kosong/whitespace, maksimal 200 unit karakter JavaScript.
- `tags`: array maksimal 20 string, masing-masing maksimal 50 unit karakter.
- `body`: string maksimal 100000 unit karakter; string kosong diperbolehkan.
- Field tambahan atau field wajib yang hilang ditolak dengan 400. PUT mengganti ketiga field, bukan pembaruan sebagian.
- Batas keseluruhan payload 128 KiB, termasuk JSON dan encoding UTF-8. Teks Unicode dapat mencapai batas byte sebelum batas panjang string.

JSON rusak mengembalikan 400, payload terlalu besar 413, dan tipe konten tidak sesuai 415. Kesalahan penyimpanan mengembalikan 500 tanpa membocorkan path file ke respons klien.

Contoh lengkap dengan PowerShell:

```powershell
$baseUrl = 'http://127.0.0.1:18087' # Ganti menjadi :5000 untuk npm start.
$note = @{ title = 'Catatan pertama'; tags = @('belajar'); body = 'Isi catatan.' }
$created = Invoke-RestMethod "$baseUrl/notes" -Method Post -ContentType 'application/json' -Body ($note | ConvertTo-Json)
$noteId = $created.data.noteId
Invoke-RestMethod "$baseUrl/notes/$noteId"
$note.title = 'Catatan diperbarui'
Invoke-RestMethod "$baseUrl/notes/$noteId" -Method Put -ContentType 'application/json' -Body ($note | ConvertTo-Json)
Invoke-RestMethod "$baseUrl/notes/$noteId" -Method Delete
```

Collection dan environment lokal tersedia di [docs/postman](docs/postman/README.md). Atur `baseUrl` sesuai port yang dipakai. Collection mempertahankan pemeriksaan CRUD dari sumber lokal dan tidak berisi kunci akses server lama.

## Penyimpanan dan cadangan

Penyimpanan default berupa array objek catatan dalam file JSON yang tidak dilacak Git. Setiap mutasi dalam satu proses diantrikan. Data ditulis ke file sementara, di-flush, kemudian diganti melalui rename; state memori baru berubah setelah penyimpanan berhasil. Kegagalan write tidak dilaporkan sebagai sukses. File JSON rusak, ID ganda, atau skema tidak sesuai membuat startup ditolak tanpa menimpa file tersebut.

Jalankan satu proses/container untuk satu file data. Penyimpanan ini belum memiliki koordinasi beberapa proses, transaksi database, atau jaminan pemulihan dari seluruh jenis kegagalan daya/perangkat. Untuk kebutuhan beberapa instance, gunakan database dan ubah lapisan store.

Hentikan server sebelum menyalin file untuk cadangan. Pada Docker, setelah setidaknya satu catatan dibuat:

```powershell
docker compose stop api
New-Item -ItemType Directory -Path 'D:\Cadangan-Proyek\notes-app-back-end-data' -Force
docker compose cp api:/app/data/notes.json 'D:\Cadangan-Proyek\notes-app-back-end-data\notes.json'
docker compose start api
```

Untuk pemulihan, hentikan server, simpan salinan data saat ini, lalu kembalikan JSON cadangan ke lokasi data dan jalankan server kembali. Pertahankan kepemilikan file agar pengguna `node` dapat menulis ke volume.

## Pengujian dan struktur

```powershell
npm ci
npm run lint
npm test
```

Tes menggunakan `node:test`, Hapi `server.inject()`, dan direktori sementara dalam `test-results/` pada project. Tes tidak memerlukan service eksternal. Pengujian mencakup CRUD, payload rusak/batas ukuran, CORS, konfigurasi, persistensi/reload, mutasi bersamaan, serta kegagalan write dan percobaan ulang.

```text
src/server.js       Factory server dan entry point CLI
src/config.js       Pembacaan dan validasi environment
src/routes.js       Endpoint serta validasi HTTP
src/handler.js      Respons CRUD
src/validation.js   Kontrak input catatan
src/store.js        Store memori/JSON dan antrean penyimpanan
test/               Tes API, store, dan konfigurasi
docs/postman/       Collection CRUD dan environment lokal
Dockerfile          Image produksi Node.js
compose.yaml        Port lokal dan volume data
```

## Cakupan

API ini merupakan latihan backend untuk satu koleksi catatan bersama. Tidak ada login, pemisahan pengguna, atau otorisasi; CORS bukan autentikasi. Gunakan data latihan pada komputer lokal. Layanan publik memerlukan rancangan autentikasi, pembatasan akses dan kapasitas, serta penyimpanan sesuai kebutuhan.

Dua salinan lokal lama sudah dibandingkan dengan riwayat remote. Source, metadata Git, dan kunci deployment lama dicadangkan secara privat di luar repo; kunci `.pem` tidak digunakan aplikasi dan tidak dimasukkan ke image atau Git. Proyek Bookshelf API tetap merupakan project terpisah.

Rujukan implementasi: [API Hapi 21](https://hapi.dev/api/21.x.x) dan [filesystem Node.js 22](https://nodejs.org/docs/latest-v22.x/api/fs.html).
