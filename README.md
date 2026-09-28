# Kuis Kustom dari Materi

## Menjalankan aplikasi

Pasang dependensi, lalu jalankan server API dan Vite bersama-sama:

```sh
npm install
npm run dev
```

Buka URL lokal yang ditampilkan Vite. Server API berjalan pada port 3000 dan Vite meneruskan request `/api` ke server tersebut.

## Kuis dari materi

Buat file `.env` berdasarkan `.env.example`, lalu isi `HF_TOKEN` dengan access token Hugging Face yang memiliki izin inference. Jangan gunakan prefix `VITE_` pada token ini karena nilainya hanya boleh tersedia di server. `HF_MODEL` dapat diganti ke model chat yang tersedia di Hugging Face Inference Providers.

Unggah PDF yang teksnya dapat dipilih, DOCX, TXT, atau Markdown berukuran maksimal 5 MB. PDF hasil scan gambar belum didukung. Pilih 5 sampai 20 soal; setelah model membuat kuis, soal pilihan ganda masuk ke alur kuis, timer, skor, dan hasil.

Untuk menjalankan server production setelah membangun frontend:

```sh
npm run build
npm start
```