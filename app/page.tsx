'use client';

import html2canvas from 'html2canvas';
import { useEffect, useRef, useState } from 'react';

type QuizOption = { letter: string; text: string };
type QuizQuestion = {
    type: 'abcd';
    instruction: string;
    options: QuizOption[];
    correctAnswer: string;
    explanation: string;
    points: number;
};
type QuizResponse = { questions?: QuizQuestion[]; error?: string };
type Screen = 'setup' | 'loading' | 'quiz' | 'result';

const allowedExtensions = new Set(['.pdf', '.docx', '.txt', '.md']);

function formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function shuffle<T>(items: T[]): T[] {
    return items
        .map((item) => ({ item, key: crypto.randomUUID() }))
        .sort((left, right) => left.key.localeCompare(right.key))
        .map(({ item }) => item);
}

export default function Home() {
    const [screen, setScreen] = useState<Screen>('setup');
    const [studentName, setStudentName] = useState('');
    const [resultName, setResultName] = useState('');
    const [material, setMaterial] = useState<File | null>(null);
    const [questionCount, setQuestionCount] = useState(10);
    const [status, setStatus] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(0);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [score, setScore] = useState(0);
    const [secondsElapsed, setSecondsElapsed] = useState(0);
    const [sharing, setSharing] = useState(false);
    const captureRef = useRef<HTMLDivElement>(null);
    const activeQuestion = questions[questionIndex];

    useEffect(() => {
        if (screen !== 'quiz') return;
        const interval = window.setInterval(() => setSecondsElapsed((seconds) => seconds + 1), 1000);
        return () => window.clearInterval(interval);
    }, [screen]);

    function acceptFile(file: File | undefined) {
        if (!file) return;
        const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!allowedExtensions.has(extension)) {
            setStatus('Format file tidak didukung. Pilih PDF, DOCX, TXT, atau Markdown.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setStatus('Ukuran file maksimal 5 MB.');
            return;
        }
        setMaterial(file);
        setStatus('');
    }

    function updateQuestionCount(value: number) {
        setQuestionCount(Math.min(20, Math.max(5, Number(value) || 5)));
    }

    async function generateQuiz() {
        const name = studentName.trim();
        if (!name) {
            setStatus('Isi nama lengkap terlebih dahulu.');
            return;
        }
        if (!material) {
            setStatus('Pilih file materi terlebih dahulu.');
            return;
        }
        if (!Number.isInteger(questionCount) || questionCount < 5 || questionCount > 20) {
            setStatus('Jumlah soal harus antara 5 dan 20.');
            return;
        }

        setStatus('');
        setUploadProgress(0);
        setScreen('loading');
        try {
            const formData = new FormData();
            formData.append('material', material);
            formData.append('questionCount', String(questionCount));
            const result = await new Promise<QuizResponse>((resolve, reject) => {
                const request = new XMLHttpRequest();
                request.open('POST', '/api/generate-quiz');
                request.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
                });
                request.upload.addEventListener('load', () => setUploadProgress(null));
                request.addEventListener('load', () => {
                    let response: QuizResponse;
                    try {
                        response = JSON.parse(request.responseText) as QuizResponse;
                    } catch {
                        reject(new Error('Server mengirim respons yang tidak valid.'));
                        return;
                    }
                    if (request.status >= 200 && request.status < 300) resolve(response);
                    else reject(new Error(response.error || 'Gagal membuat kuis.'));
                });
                request.addEventListener('error', () => reject(new Error('Koneksi ke server terputus. Coba lagi.')));
                request.send(formData);
            });
            if (!result.questions?.length) throw new Error('Server tidak mengirim soal kuis.');
            setResultName(name);
            setQuestions(shuffle(result.questions));
            setQuestionIndex(0);
            setSelectedAnswer(null);
            setScore(0);
            setSecondsElapsed(0);
            setScreen('quiz');
        } catch (error) {
            setScreen('setup');
            setStatus(error instanceof Error ? error.message : 'Terjadi kesalahan saat membuat kuis.');
        }
    }

    function submitAnswer() {
        const question = questions[questionIndex];
        if (!question || selectedAnswer === null) {
            setStatus('Pilih satu jawaban terlebih dahulu.');
            return;
        }
        setStatus('');
        if (selectedAnswer === question.correctAnswer) setScore((currentScore) => currentScore + (question.points || 10));
        if (questionIndex + 1 === questions.length) {
            setScreen('result');
            return;
        }
        setQuestionIndex((index) => index + 1);
        setSelectedAnswer(null);
    }

    async function shareResult() {
        if (!captureRef.current || sharing) return;
        setSharing(true);
        try {
            const canvas = await html2canvas(captureRef.current, { scale: 2, backgroundColor: '#ffffff', logging: false });
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((image) => image ? resolve(image) : reject(new Error('Gambar hasil tidak dapat dibuat.')), 'image/png');
            });
            const file = new File([blob], 'skor-kuis-kustom.png', { type: 'image/png' });
            if (navigator.share && navigator.canShare?.({ files: [file] })) {
                await navigator.share({
                    title: 'Skor Kuis Kustom',
                    text: `Saya menyelesaikan kuis dengan skor ${score} dalam waktu ${formatTime(secondsElapsed)}!`,
                    files: [file],
                });
            } else {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `skor-${resultName.replace(/\s+/g, '-').toLowerCase()}.png`;
                link.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            if (!(error instanceof Error && error.name === 'AbortError')) setStatus('Terjadi kesalahan saat membuat gambar hasil.');
        } finally {
            setSharing(false);
        }
    }

    function restartQuiz() {
        setScreen('setup');
        setStatus('');
        setQuestionIndex(0);
        setSelectedAnswer(null);
    }

    return (
        <div className="app-shell">
            <header className="topbar">
                <a className="wordmark" href="/" aria-label="Kuis Kustom, beranda">
                    <span className="wordmark-mark" aria-hidden="true">q</span>
                    <span>RUANG KUIS</span>
                </a>
                <span className="topbar-note"><span className="status-dot" /> BELAJAR DENGAN FOKUS</span>
            </header>

            <main className="quiz-app">
                {screen === 'quiz' && <div className="quiz-progress" aria-label="Kemajuan kuis"><div className="quiz-progress-bar" style={{ width: `${(questionIndex / questions.length) * 100}%` }} /></div>}

                {screen === 'setup' && <section className="setup-screen">
                    <div className="setup-intro">
                        <p className="eyebrow"><span>01</span> / PERSIAPAN</p>
                        <h1>Belajar, lalu <em>buktikan.</em></h1>
                        <p className="intro-copy">Ubah materi pilihanmu menjadi tantangan yang dirancang khusus untukmu.</p>
                        <div className="study-stamp" aria-hidden="true"><div className="stamp-ring"><span className="stamp-top">RUANG KUIS</span><span className="stamp-center">Q<span>+</span></span><span className="stamp-bottom">MULAI BELAJAR</span></div><span className="stamp-spark">✳</span></div>
                    </div>
                    <form className="setup-form" onSubmit={(event) => { event.preventDefault(); void generateQuiz(); }}>
                        <div className="form-heading"><span className="form-step">A</span><div><h2>Siapkan kuis</h2><p>Isi detail di bawah untuk memulai.</p></div></div>
                        <div className="field-group"><label htmlFor="student-name">Nama peserta</label><input id="student-name" type="text" autoComplete="name" placeholder="Contoh: Nadia Putri" value={studentName} onChange={(event) => setStudentName(event.target.value)} /></div>
                        <div className="field-group">
                            <label htmlFor="material-file">File materi</label>
                            <label className={`upload-zone${isDragging ? ' is-dragging' : ''}`} htmlFor="material-file" onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); if (event.dataTransfer.files.length !== 1) setStatus('Lepaskan satu file materi saja.'); else acceptFile(event.dataTransfer.files[0]); }}>
                                <input id="material-file" type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(event) => acceptFile(event.target.files?.[0])} />
                                <span className="upload-mark" aria-hidden="true">↑</span><span className="upload-copy"><strong>{material?.name || 'Seret file ke sini atau telusuri'}</strong><span>{material ? `${(material.size / (1024 * 1024)).toFixed(2)} MB · siap digunakan` : 'PDF, DOCX, TXT, atau Markdown · maks. 5 MB'}</span></span><span className="upload-browse">Telusuri</span>
                            </label>
                        </div>
                        <div className="form-actions">
                            <div className="field-group count-field"><label htmlFor="question-count">Jumlah soal</label><div className="number-control"><button type="button" aria-label="Kurangi jumlah soal" onClick={() => updateQuestionCount(questionCount - 1)}>−</button><input id="question-count" type="number" min="5" max="20" value={questionCount} onChange={(event) => updateQuestionCount(Number(event.target.value))} inputMode="numeric" /><button type="button" aria-label="Tambah jumlah soal" onClick={() => updateQuestionCount(questionCount + 1)}>+</button></div></div>
                            <button type="submit" className="primary-button"><span>Buat kuis</span><span className="button-arrow" aria-hidden="true">↗</span></button>
                        </div>
                        <output className={`form-status${status ? ' text-red-600' : ''}`} aria-live="polite">{status}</output>
                    </form>
                </section>}

                {screen === 'loading' && <section className="loading-screen" aria-live="polite" aria-busy="true"><div className="loading-content"><div className="loading-orbit" aria-hidden="true"><span>Q</span></div><p className="eyebrow"><span>01</span> / MENYIAPKAN KUIS</p><h2>{uploadProgress === null ? 'AI sedang menyusun kuis' : 'Mengirim materi'}</h2><p className="loading-message">{uploadProgress === null ? 'Unggahan selesai. Menunggu hasil dari server.' : 'Mengunggah file ke server.'}</p><div className="loading-progress-row"><progress className="loading-progress-accessible" aria-label="Progres unggah materi" max="100" value={uploadProgress ?? undefined}>Unggah materi</progress><div className={`loading-progress-track${uploadProgress === null ? ' is-indeterminate' : ''}`} aria-hidden="true"><div className="loading-progress-bar" style={uploadProgress === null ? undefined : { width: `${uploadProgress}%` }} /></div><span className="loading-percent">{uploadProgress === null ? 'Diproses' : `${uploadProgress}%`}</span></div><p className="loading-note">Persentase menunjukkan progres unggah. Penyusunan kuis berlangsung di server.</p></div></section>}

                {screen === 'quiz' && activeQuestion && <section className="question-screen">
                    <div className="question-topline"><span className="eyebrow"><span>02</span> / KUIS KUSTOM</span><div className="timer-chip"><span className="timer-pulse" /><span>{formatTime(secondsElapsed)}</span></div></div>
                    <div className="question-heading"><p className="question-count">PERTANYAAN <span>{questionIndex + 1}</span><span className="count-divider">/</span><span>{questions.length}</span></p><h2>{activeQuestion.instruction}</h2></div>
                    <div className="answer-section"><div className="answer-label"><span>PILIH JAWABAN</span><span className="answer-hint">Pilih satu opsi</span></div><div className="answer-grid">{activeQuestion.options.map((option) => <button key={option.letter} type="button" className={`answer-choice${selectedAnswer === option.letter ? ' is-selected' : ''}`} onClick={() => setSelectedAnswer(option.letter)}><span className="answer-letter">{option.letter}</span><span className="answer-text">{option.text}</span></button>)}</div></div>
                    <div className="question-footer"><p className="points-label"><span className="points-star">✳</span><span>{activeQuestion.points || 10}</span> poin</p><button type="button" className="primary-button next-button" onClick={submitAnswer}><span>{questionIndex + 1 === questions.length ? 'Selesaikan kuis' : 'Simpan & lanjut'}</span><span className="button-arrow" aria-hidden="true">→</span></button></div>
                    {status && <output className="form-status text-red-600" aria-live="polite">{status}</output>}
                </section>}

                {screen === 'result' && <section className="result-screen">
                    <div id="capture-area" ref={captureRef} className="result-capture"><p className="eyebrow"><span>03</span> / SELESAI</p><div className="result-title-row"><div><p className="result-kicker">HASIL KUIS</p><h2>Kerja bagus,<br /><em>{resultName}</em>.</h2></div><div className="result-seal" aria-hidden="true"><span>Q</span><small>DONE</small></div></div><div className="result-stats"><div className="result-stat score-stat"><span>SKOR AKHIR</span><strong>{score}</strong><small>poin</small></div><div className="result-stat time-stat"><span>WAKTU</span><strong>{formatTime(secondsElapsed)}</strong><small>menit : detik</small></div></div><p className="result-note">Setiap langkah kecil membangun pemahaman yang lebih kuat.</p></div>
                    <div className="result-actions"><button type="button" className="primary-button" onClick={() => void shareResult()} disabled={sharing}><span>{sharing ? 'Menyiapkan...' : 'Bagikan skor'}</span><span className="button-arrow" aria-hidden="true">↗</span></button><button type="button" className="secondary-button" onClick={restartQuiz}>Buat kuis baru <span aria-hidden="true">↻</span></button></div>
                    {status && <output className="form-status text-red-600" aria-live="polite">{status}</output>}
                </section>}
            </main>

            <footer className="site-footer"><span>RUANG KUIS</span><span>SESI BELAJAR <span className="footer-index">№ 01</span></span></footer>
        </div>
    );
}
