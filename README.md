# Kuis Kustom dari Materi

Aplikasi web untuk membuat dan memainkan kuis pilihan ganda berdasarkan materi belajar yang diunggah. Frontend menggunakan Vite, sedangkan API menggunakan Express dan Hugging Face Inference Providers untuk menyusun soal.

## Fitur

- Membuat 5 sampai 20 soal pilihan ganda dari materi.
- Menerima file PDF, DOCX, TXT, dan Markdown hingga 5 MB.
- Menampilkan kuis interaktif dengan timer, skor, dan hasil.
- Menyimpan token Hugging Face di backend, bukan di bundle frontend.

PDF harus memiliki teks yang bisa dipilih; PDF hasil scan gambar belum didukung.

## Konfigurasi

Salin `.env.example` menjadi `.env` jika file `.env` belum ada, lalu isi nilainya. Jangan menimpa `.env` yang sudah berisi konfigurasi atau token.

PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

macOS/Linux:

```sh
test -f .env || cp .env.example .env
```

Variabel:

- `HF_TOKEN`: access token Hugging Face dengan izin inference; wajib untuk membuat kuis.
- `HF_MODEL`: model chat di Hugging Face Inference Providers; opsional, memakai nilai contoh jika kosong.
- `DOCKERHUB_USERNAME`: username pemilik image `kuis-javascript` di Docker Hub; dibutuhkan untuk cara Docker.

Jangan beri prefix `VITE_` pada `HF_TOKEN`, dan jangan commit file `.env`.

## Menjalankan dari Source

Gunakan Node.js 22 atau lebih baru. Setelah mengisi `HF_TOKEN` di `.env`, jalankan dari folder proyek:

```sh
npm ci
npm run dev
```

Buka URL frontend yang ditampilkan Vite. Server API berjalan di port 3000 dan Vite meneruskan request `/api` ke server tersebut.

Untuk mencoba mode production lokal:

```sh
npm run build
npm start
```

Buka <http://localhost:3000>.

## Menjalankan dari Docker Hub

Pastikan Docker Desktop atau Docker Engine sedang berjalan. Image harus sudah dipublikasikan ke repository Docker Hub `DOCKERHUB_USERNAME/kuis-javascript`; repository publik dapat ditarik tanpa login. Untuk repository privat, jalankan `docker login` terlebih dahulu.

Simpan `compose.yaml` dan file `.env` di folder yang sama. Isi `.env` dengan `DOCKERHUB_USERNAME` dan `HF_TOKEN`, lalu jalankan:

```sh
docker compose up -d
```

Website tersedia di <http://localhost:3000>. Compose menarik image dari Docker Hub dan meneruskan `HF_TOKEN` serta `HF_MODEL` ke container sebagai environment variables.

Perintah berguna:

```sh
docker compose logs -f
docker compose down
```

Setelah image baru dipublikasikan, tarik dan jalankan versi terbaru:

```sh
docker compose pull
docker compose up -d
```

## Memperbarui Image Docker Hub

Bagian ini untuk pemilik repository image. Dari source proyek, login satu kali ke Docker Hub:

```sh
docker login -u NAMA_PENGGUNA_DOCKERHUB
```

Pastikan `DOCKERHUB_USERNAME` di `.env` sesuai akun, lalu jalankan dari Git Bash, WSL, macOS, atau Linux:

```sh
sh ./image.sh
```

Skrip membangun image dari Dockerfile, memberi tag `DOCKERHUB_USERNAME/kuis-javascript:latest`, lalu mengunggahnya ke Docker Hub. Pengguna container dapat mengambil versi terbaru dengan `docker compose pull`.
