import path from 'node:path';
import mammoth from 'mammoth';

export const runtime = 'nodejs';

const allowedExtensions = new Set(['.pdf', '.docx', '.txt', '.md']);
const letters = ['A', 'B', 'C', 'D'] as const;

type ValidInput = { file: File; questionCount: number };
type InputValidation = ValidInput | { error: string; status: number };
type QuizQuestion = {
    type: 'abcd';
    instruction: string;
    options: { letter: string; text: string }[];
    correctAnswer: string;
    explanation: string;
    points: number;
};

function jsonError(message: string, status: number): Response {
    return Response.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function validateInput(formData: FormData): InputValidation {
    const file = formData.get('material');
    if (!(file instanceof File) || file.size === 0) {
        return { error: 'Pilih file PDF, DOCX, TXT, atau Markdown terlebih dahulu.', status: 400 };
    }
    if (file.size > 5 * 1024 * 1024) return { error: 'Ukuran file maksimal 5 MB.', status: 413 };
    if (!allowedExtensions.has(path.extname(file.name).toLowerCase())) {
        return { error: 'Format file tidak didukung. Pilih PDF, DOCX, TXT, atau Markdown.', status: 400 };
    }
    if (!process.env.HF_TOKEN) return { error: 'HF_TOKEN belum diatur di environment server.', status: 503 };

    const questionCount = Number(formData.get('questionCount'));
    if (!Number.isInteger(questionCount) || questionCount < 5 || questionCount > 20) {
        return { error: 'Jumlah soal harus antara 5 dan 20.', status: 400 };
    }
    return { file, questionCount };
}

async function extractText(file: File, buffer: Buffer): Promise<string> {
    const extension = path.extname(file.name).toLowerCase();
    if (extension === '.pdf') {
        const pdfParser = await import('pdf-parse') as { default: (content: Buffer) => Promise<{ text: string }> };
        const pdfParse = pdfParser.default;
        return (await pdfParse(buffer)).text;
    }
    if (extension === '.docx') return (await mammoth.extractRawText({ buffer })).value;
    return buffer.toString('utf8');
}

function parseModelJson(content: string): unknown {
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
        const firstLineEnd = cleaned.indexOf('\n');
        const lastFence = cleaned.lastIndexOf('```');
        if (firstLineEnd >= 0 && lastFence > firstLineEnd) cleaned = cleaned.slice(firstLineEnd + 1, lastFence).trim();
    }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Model tidak mengembalikan JSON yang valid.');
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
}

function readModelError(result: unknown): string {
    if (!isRecord(result)) return 'Model Hugging Face gagal memproses materi.';
    if (typeof result.error === 'string') return result.error;
    if (isRecord(result.error) && typeof result.error.message === 'string') return result.error.message;
    return 'Model Hugging Face gagal memproses materi.';
}

function readMessageContent(result: unknown): string {
    if (!isRecord(result) || !Array.isArray(result.choices)) return '';
    const choice = result.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) return '';
    return typeof choice.message.content === 'string' ? choice.message.content : '';
}

function toQuizQuestion(value: unknown): QuizQuestion | null {
    if (!isRecord(value) || !isRecord(value.options) || typeof value.question !== 'string' || !value.question.trim()) return null;
    const options = value.options;
    if (!letters.every((letter) => typeof options[letter] === 'string' && (options[letter] as string).trim())) return null;
    const answer = typeof value.answer === 'string' ? value.answer.toUpperCase() : '';
    if (!letters.includes(answer as (typeof letters)[number])) return null;
    return {
        type: 'abcd',
        instruction: value.question.trim(),
        options: letters.map((letter) => ({ letter, text: (options[letter] as string).trim() })),
        correctAnswer: answer,
        explanation: typeof value.explanation === 'string' ? value.explanation : '',
        points: 10,
    };
}

function normalizeQuestions(content: string, questionCount: number): QuizQuestion[] {
    const generated = parseModelJson(content);
    if (!isRecord(generated) || !Array.isArray(generated.questions)) return [];
    return generated.questions.slice(0, questionCount).flatMap((question) => {
        const normalized = toQuizQuestion(question);
        return normalized ? [normalized] : [];
    });
}

async function requestModel(text: string, questionCount: number): Promise<Response> {
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.HF_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: process.env.HF_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
            temperature: 0.3,
            max_tokens: 3500,
            messages: [
                {
                    role: 'system',
                    content: 'Kamu adalah penyusun kuis edukasi berbahasa Indonesia. Buat soal hanya dari materi yang diberikan. Kembalikan JSON valid tanpa markdown dengan bentuk: {"questions":[{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A","explanation":"..."}]}. Setiap soal harus punya tepat empat opsi berbeda dan satu jawaban benar.',
                },
                {
                    role: 'user',
                    content: `Buat tepat ${questionCount} soal pilihan ganda yang menguji pemahaman konsep dari materi berikut. Buat pengecoh yang masuk akal dan variasikan posisi jawaban benar. Jangan menggunakan pengetahuan di luar materi.\n\nMATERI:\n${text.slice(0, 18000)}`,
                },
            ],
        }),
    });

    const result: unknown = await response.json();
    if (!response.ok) {
        console.error('Hugging Face API error:', result);
        return jsonError(readModelError(result), 502);
    }

    const questions = normalizeQuestions(readMessageContent(result), questionCount);
    if (questions.length < 3) return jsonError('Soal dari model tidak sesuai format. Coba file materi lain.', 502);
    return Response.json({ questions });
}

async function createQuiz(formData: FormData): Promise<Response> {
    const validation = validateInput(formData);
    if ('error' in validation) return jsonError(validation.error, validation.status);

    const buffer = Buffer.from(await validation.file.arrayBuffer());
    const text = (await extractText(validation.file, buffer)).replace(/\s+/g, ' ').trim();
    if (text.length < 100) {
        return jsonError('Teks materi terlalu sedikit atau tidak dapat dibaca. Pastikan PDF bukan hasil scan gambar.', 422);
    }
    return requestModel(text, validation.questionCount);
}

export async function POST(request: Request): Promise<Response> {
    try {
        return await createQuiz(await request.formData());
    } catch (error) {
        console.error('Gagal membuat kuis:', error);
        return jsonError(error instanceof Error ? error.message : 'Terjadi kesalahan saat membuat kuis.', 500);
    }
}
