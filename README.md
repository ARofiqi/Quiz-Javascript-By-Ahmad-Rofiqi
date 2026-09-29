# Kuis Kustom dari Materi

Aplikasi untuk membuat dan memainkan kuis pilihan ganda dari materi belajar yang diunggah. Frontend dan API berjalan dalam satu aplikasi Next.js dengan TypeScript; pembuatan soal menggunakan Hugging Face Inference Providers.

## Fitur
- Membuat 5 sampai 20 soal pilihan ganda dari materi.
- Menerima PDF, DOCX, TXT, dan Markdown hingga 5 MB.
- Menampilkan kuis interaktif dengan timer, skor, dan hasil.
- Menyimpan token Hugging Face hanya di server.

PDF harus memiliki teks yang bisa dipilih; PDF hasil scan gambar belum didukung.

## Konfigurasi

Salin `.env.example` menjadi `.env` jika file `.env` belum ada, lalu atur `HF_TOKEN`. Jangan menimpa `.env` yang sudah berisi konfigurasi atau token.

PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

macOS/Linux:

```sh
test -f .env || cp .env.example .env
```

- `HF_TOKEN`: access token Hugging Face dengan izin inference; wajib untuk membuat kuis.
- `HF_MODEL`: model chat di Hugging Face Inference Providers; opsional, memakai nilai contoh jika kosong.

Jangan beri prefix `NEXT_PUBLIC_` pada `HF_TOKEN`, dan jangan commit file `.env`.

## Menjalankan dari Source

Gunakan Node.js 24 atau lebih baru:

```sh
npm ci
npm run dev
```

Buka <http://localhost:3000>. Untuk mode production lokal:

```sh
npm run build
npm start
```

Health check tersedia di `/api/health`.

## Docker

Pastikan Docker Desktop atau Docker Engine berjalan dan `HF_TOKEN` sudah diatur dalam `.env`:

```sh
docker compose up -d --build
```

Compose membangun image Next.js standalone dari source, lalu menjalankan frontend dan API pada <http://localhost:3000>.

```sh
docker compose logs -f
docker compose down
```

Untuk memperbarui image Docker Hub milik repository, login ke Docker Hub lalu jalankan `sh ./image.sh`. Nama image publik saat ini diatur di `compose.yaml`.

## Deploy di Render

Buat Blueprint dari repository ini. Render menggunakan `render.yaml` untuk build dan start Next.js; atur `HF_TOKEN` pada environment service Render. Health check API tersedia di `/api/health`.

## Deploy di Vercel

Hubungkan repository dengan Root Directory di root repo dan Framework Preset `Next.js`. Biarkan Output Directory kosong/default Next.js; jangan isi `public` atau `frontend/dist`, karena aplikasi memakai server Next.js untuk API. Atur `HF_TOKEN` dan, bila diperlukan, `HF_MODEL` di Environment Variables Vercel.
