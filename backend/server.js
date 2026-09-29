import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const app = express();
app.disable('x-powered-by');
const port = Number(process.env.PORT) || 3000;
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(projectDir, '../frontend/dist');
const allowedOrigins = new Set((process.env.FRONTEND_URL || '').split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean));
const allowedExtensions = new Set(['.pdf', '.docx', '.txt', '.md']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 100 },
    fileFilter(_request, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();
        const isAllowed = allowedExtensions.has(extension);
        callback(isAllowed ? null : new Error('Format file tidak didukung.'), isAllowed);
    },
});

app.use((request, response, next) => {
    const origin = request.get('Origin');
    if (origin && allowedOrigins.has(origin)) {
        response.set('Access-Control-Allow-Origin', origin);
        response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.set('Access-Control-Allow-Headers', 'Content-Type');
        response.vary('Origin');
    }
    if (request.method === 'OPTIONS') return response.sendStatus(204);
    next();
});

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

async function extractText(file) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension === '.pdf') {
        const result = await pdfParse(file.buffer);
        return result.text;
    }
    if (extension === '.docx') {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value;
    }
    return file.buffer.toString('utf8');
}

function parseModelJson(content) {
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
        const firstLineEnd = cleaned.indexOf('\n');
        const lastFence = cleaned.lastIndexOf('```');
        if (firstLineEnd >= 0 && lastFence > firstLineEnd) {
            cleaned = cleaned.slice(firstLineEnd + 1, lastFence).trim();
        }
    }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Model tidak mengembalikan JSON yang valid.');
    return JSON.parse(cleaned.slice(start, end + 1));
}

app.post('/api/generate-quiz', upload.single('material'), async (request, response) => {
    try {
        if (!request.file) return response.status(400).json({ error: 'Pilih file PDF, DOCX, atau TXT terlebih dahulu.' });
        if (!process.env.HF_TOKEN) return response.status(503).json({ error: 'HF_TOKEN belum diatur di file .env server.' });

        const questionCount = Number(request.body.questionCount);
        if (!Number.isInteger(questionCount) || questionCount < 5 || questionCount > 20) {
            return response.status(400).json({ error: 'Jumlah soal harus antara 5 dan 20.' });
        }

        const extractedText = (await extractText(request.file)).replace(/\s+/g, ' ').trim();
        if (extractedText.length < 100) {
            return response.status(422).json({ error: 'Teks materi terlalu sedikit atau tidak dapat dibaca. Pastikan PDF bukan hasil scan gambar.' });
        }

        const model = process.env.HF_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
        const hfResponse = await fetch('https://router.huggingface.co/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.HF_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                temperature: 0.3,
                max_tokens: 3500,
                messages: [
                    {
                        role: 'system',
                        content: 'Kamu adalah penyusun kuis edukasi berbahasa Indonesia. Buat soal hanya dari materi yang diberikan. Kembalikan JSON valid tanpa markdown dengan bentuk: {"questions":[{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A","explanation":"..."}]}. Setiap soal harus punya tepat empat opsi berbeda dan satu jawaban benar.',
                    },
                    {
                        role: 'user',
                        content: `Buat tepat ${questionCount} soal pilihan ganda yang menguji pemahaman konsep dari materi berikut. Buat pengecoh yang masuk akal dan variasikan posisi jawaban benar. Jangan menggunakan pengetahuan di luar materi.\n\nMATERI:\n${extractedText.slice(0, 18000)}`,
                    },
                ],
            }),
        });

        const result = await hfResponse.json();
        if (!hfResponse.ok) {
            console.error('Hugging Face API error:', result);
            return response.status(502).json({ error: result.error || 'Model Hugging Face gagal memproses materi.' });
        }

        const generated = parseModelJson(result.choices?.[0]?.message?.content || '');
        const questions = Array.isArray(generated.questions) ? generated.questions.slice(0, questionCount) : [];
        const validQuestions = questions.filter((question) => {
            const options = question.options;
            return typeof question.question === 'string'
                && question.question.trim()
                && options && ['A', 'B', 'C', 'D'].every((letter) => typeof options[letter] === 'string' && options[letter].trim())
                && ['A', 'B', 'C', 'D'].includes(String(question.answer).toUpperCase());
        }).map((question) => ({
            type: 'abcd',
            instruction: question.question.trim(),
            options: ['A', 'B', 'C', 'D'].map((letter) => ({ letter, text: question.options[letter].trim() })),
            correctAnswer: String(question.answer).toUpperCase(),
            explanation: typeof question.explanation === 'string' ? question.explanation : '',
            points: 10,
        }));

        if (validQuestions.length < 3) {
            return response.status(502).json({ error: 'Soal dari model tidak sesuai format. Coba file materi lain.' });
        }

        response.json({ questions: validQuestions });
    } catch (error) {
        console.error('Gagal membuat kuis:', error);
        response.status(500).json({ error: error.message || 'Terjadi kesalahan saat membuat kuis.' });
    }
});

app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    const isUploadError = error instanceof multer.MulterError;
    const status = isUploadError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    response.status(status).json({ error: error.message || 'File tidak dapat diproses.' });
});

if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get(/.*/, (_request, response) => {
        response.sendFile(path.join(frontendDist, 'index.html'));
    });
}

app.listen(port, () => console.log(`Quiz server listening on port ${port}`));
