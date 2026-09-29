import './style.css';
import $ from 'jquery';
import html2canvas from 'html2canvas';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

$(document).ready(function() {
    let currentQuizSequence = [];
    let student = { name: '' };
    
    let currentQuestionIndex = 0;
    let score = 0;
    let selectedAnswer = null;
    let selectedMaterialFile = null;
    const allowedMaterialExtensions = new Set(['.pdf', '.docx', '.txt', '.md']);
    
    // Variabel Timer
    let timerInterval;
    let secondsElapsed = 0;

    // Helper: Format Detik menjadi MM:SS
    function formatTime(totalSeconds) {
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function shuffleArray(array) {
        let shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    function updateProgress() {
        const percentage = ((currentQuestionIndex) / currentQuizSequence.length) * 100;
        $('#progress-bar').css('width', `${percentage}%`);
    }

    // MULAI KUIS
    function beginQuiz(questions) {
        student.name = $('#student-name').val().trim();
        currentQuizSequence = shuffleArray(questions);
        currentQuestionIndex = 0;
        score = 0;
        secondsElapsed = 0;
        $('#total-q-num').text(currentQuizSequence.length);
        $('#progress-container').stop(true, true).show();
        $('#loading-screen').fadeOut(250, function() {
            $('#progress-container').removeClass('hidden');
            $('#quiz-screen').fadeIn(250);
            $('#timer-display').text('00:00');
            timerInterval = setInterval(() => {
                secondsElapsed++;
                $('#timer-display').text(formatTime(secondsElapsed));
            }, 1000);
            loadQuestion();
        });
    }

    function updateQuestionCount(value) {
        const questionCount = Math.min(20, Math.max(5, Number(value) || 5));
        $('#question-count').val(questionCount);
    }

    function setSelectedMaterial(file) {
        const status = $('#generation-status');
        const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

        if (!allowedMaterialExtensions.has(extension)) {
            status.text('Format file tidak didukung. Pilih PDF, DOCX, TXT, atau Markdown.').addClass('text-red-600');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            status.text('Ukuran file maksimal 5 MB.').addClass('text-red-600');
            return;
        }

        selectedMaterialFile = file;
        $('#file-name').text(file.name);
        $('#file-hint').text(`${(file.size / (1024 * 1024)).toFixed(2)} MB · siap digunakan`);
        status.empty().removeClass('text-red-600');
    }

    $('#decrease-question-count').click(function() {
        updateQuestionCount(Number($('#question-count').val()) - 1);
    });

    $('#increase-question-count').click(function() {
        updateQuestionCount(Number($('#question-count').val()) + 1);
    });

    $('#question-count').on('change blur', function() {
        updateQuestionCount($(this).val());
    });

    $('#material-file').on('change', function() {
        const file = this.files[0];
        if (file) setSelectedMaterial(file);
    });

    $('.upload-zone').on('dragenter dragover', function(event) {
        event.preventDefault();
        event.originalEvent.dataTransfer.dropEffect = 'copy';
        $(this).addClass('is-dragging');
    }).on('dragleave', function(event) {
        const relatedTarget = event.originalEvent.relatedTarget;
        if (!(relatedTarget instanceof Node) || !this.contains(relatedTarget)) $(this).removeClass('is-dragging');
    }).on('drop', function(event) {
        event.preventDefault();
        $(this).removeClass('is-dragging');
        const files = event.originalEvent.dataTransfer.files;
        if (files.length !== 1) {
            $('#generation-status').text('Lepaskan satu file materi saja.').addClass('text-red-600');
            return;
        }
        setSelectedMaterial(files[0]);
    });

    $('#generate-quiz-btn').click(async function() {
        const name = $('#student-name').val().trim();
        const file = selectedMaterialFile;
        const questionCount = Number($('#question-count').val());
        const status = $('#generation-status');

        if (!name) {
            status.text('Isi nama lengkap terlebih dahulu.').addClass('text-red-600');
            $('#student-name').trigger('focus');
            return;
        }
        if (!file) {
            status.text('Pilih file materi terlebih dahulu.').addClass('text-red-600');
            return;
        }
        if (!Number.isInteger(questionCount) || questionCount < 5 || questionCount > 20) {
            status.text('Jumlah soal harus antara 5 dan 20.').addClass('text-red-600');
            return;
        }

        const button = $(this);
        button.prop('disabled', true).text('Memproses...');
        status.empty().removeClass('text-red-600');
        $('#loading-title').text('Mengirim materi');
        $('#loading-message').text('Mengunggah file ke server.');
        $('#loading-progress').attr('value', 0).removeAttr('aria-valuetext');
        $('.loading-progress-track').removeClass('is-indeterminate');
        $('#loading-progress-bar').css('width', '0%');
        $('#loading-percent').text('0%');
        $('#login-container').hide();
        $('#loading-screen').removeClass('hidden').hide().fadeIn(220);

        try {
            const formData = new FormData();
            formData.append('material', file);
            formData.append('questionCount', String(questionCount));
            const result = await new Promise((resolve, reject) => {
                const request = new XMLHttpRequest();
                request.open('POST', `${apiBaseUrl}/api/generate-quiz`);
                request.upload.addEventListener('progress', (event) => {
                    if (!event.lengthComputable) return;
                    const percentage = Math.round((event.loaded / event.total) * 100);
                    $('#loading-progress').attr('value', percentage);
                    $('#loading-progress-bar').css('width', `${percentage}%`);
                    $('#loading-percent').text(`${percentage}%`);
                });
                request.upload.addEventListener('load', () => {
                    $('#loading-title').text('AI sedang menyusun kuis');
                    $('#loading-message').text('Unggahan selesai. Menunggu hasil dari server.');
                    $('#loading-progress').removeAttr('value').attr('aria-valuetext', 'Sedang diproses oleh server');
                    $('.loading-progress-track').addClass('is-indeterminate');
                    $('#loading-percent').text('Diproses');
                });
                request.addEventListener('load', () => {
                    let response;
                    try {
                        response = JSON.parse(request.responseText);
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
            beginQuiz(result.questions);
        } catch (error) {
            $('#loading-screen').fadeOut(180, function() {
                $(this).addClass('hidden');
                $('#login-container').fadeIn(180);
            });
            status.text(error.message).addClass('text-red-600');
        } finally {
            button.prop('disabled', false).text('Buat Kuis');
        }
    });

    function loadQuestion() {
        updateProgress();
        const q = currentQuizSequence[currentQuestionIndex];
        
        $('#current-q-num').text(currentQuestionIndex + 1);
        $('#instruction-text').text(q.instruction);
        $('#q-points').text(q.points || 10); // Menampilkan poin untuk soal tersebut
        $('#q-points').text(q.points || 10); // Menampilkan poin untuk soal tersebut

        $('#options-container').addClass('abcd-options').empty();
        q.options.forEach((option) => {
            const button = $('<button>', { type: 'button', class: 'answer-choice' })
                .attr('data-answer', option.letter)
                .append($('<span>', { class: 'answer-letter', text: option.letter }))
                .append($('<span>', { class: 'answer-text', text: option.text }));
            $('#options-container').append(button);
        });
        selectedAnswer = null;
        $('#options-container').off('click', '.answer-choice').on('click', '.answer-choice', function() {
            selectedAnswer = $(this).attr('data-answer');
            $('.answer-choice').removeClass('is-selected');
            $(this).addClass('is-selected');
        });
    }

    // NEXT BUTTON
    $('#next-btn').click(async function() {
        const q = currentQuizSequence[currentQuestionIndex];
        if (selectedAnswer === null) {
            $('#options-container').animate({opacity: 0.5}, 100).animate({opacity: 1}, 100);
            return;
        }

        if (selectedAnswer === q.correctAnswer) {
            score += (q.points || 10);
        }
        
        currentQuestionIndex++;
        
        if (currentQuestionIndex < currentQuizSequence.length) {
            loadQuestion();
        } else {
            // KUIS SELESAI
            clearInterval(timerInterval); // Hentikan timer
            $('#next-btn').prop('disabled', true).text('Menyimpan...');
            
            showResult();
        }
    });

    // TAMPILKAN HASIL
    function showResult() {
        $('#progress-bar').css('width', '100%');
        setTimeout(() => {
            $('#progress-container').slideUp(200);
            $('#quiz-screen').fadeOut(300, function() {
                
                $('#final-name').text(student.name);
                $('#final-time').text(formatTime(secondsElapsed)); // Tampilkan waktu total
                
                $({ Counter: 0 }).animate({ Counter: score }, {
                    duration: 1000, easing: 'swing',
                    step: function () { $('#final-score').text(Math.ceil(this.Counter)); },
                    complete: function() { $('#final-score').text(score); }
                });

                $('#result-screen').fadeIn(300);
                $('#next-btn').prop('disabled', false).text('Simpan & Lanjut');
            });
        }, 300);
    }

    // SHARE LOGIC
    $('#share-btn').click(async function() {
        const btn = $(this);
        const originalContent = btn.html();
        btn.html('Memproses...').prop('disabled', true).addClass('opacity-75');

        try {
            const captureArea = document.getElementById('capture-area');
            const canvas = await html2canvas(captureArea, { scale: 2, backgroundColor: '#ffffff', logging: false });
            
            canvas.toBlob(async function(blob) {
                const file = new File([blob], 'skor-js-quiz.png', { type: 'image/png' });
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            title: 'Skor Evaluasi JavaScript',
                            text: `Saya menyelesaikan kuis kustom dengan skor ${score} dalam waktu ${formatTime(secondsElapsed)}! Berani tantang?`,
                            files: [file]
                        });
                    } catch (err) { console.log('Share dibatalkan', err); }
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `skor-${student.name.replace(/\s+/g, '-').toLowerCase()}.png`;
                    document.body.appendChild(a);
                    a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                }
                btn.html(originalContent).prop('disabled', false).removeClass('opacity-75');
            }, 'image/png');
        } catch (error) {
            alert('Terjadi kesalahan saat membuat gambar.');
            btn.html(originalContent).prop('disabled', false).removeClass('opacity-75');
        }
    });

    // RESTART
    $('#restart-btn').click(function() {
        $('#progress-bar').css('width', '0%');
        $('#result-screen').fadeOut(300, function() {
            $('#login-container').fadeIn(300);
        });
    });
});