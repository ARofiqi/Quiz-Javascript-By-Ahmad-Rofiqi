import './style.css';
import $ from 'jquery';
import html2canvas from 'html2canvas';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

$(document).ready(function() {
    let fullQuizData = {}; // Menyimpan seluruh file JSON
    let currentQuizSequence = []; // Soal untuk level yang dipilih
    let student = { name: '', level: '' };
    
    let currentQuestionIndex = 0;
    let score = 0;
    
    // Variabel Timer
    let timerInterval;
    let secondsElapsed = 0;

    // Helper: Format Detik menjadi MM:SS
    function formatTime(totalSeconds) {
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // Mengambil dan Menampilkan Leaderboard
    async function fetchLeaderboard() {
        try {
            // Urutkan: Skor Tertinggi DULU, jika skor sama, Waktu Tercepat (ascending) yang menang
            const { data, error } = await supabaseClient
                .from('leaderboard')
                .select('name, score, level, time_taken, created_at')
                .order('score', { ascending: false })
                .order('time_taken', { ascending: true }) 
                .limit(10);

            if (error) throw error;

            const listContainer = $('#leaderboard-list');
            listContainer.empty();

            if (data.length === 0) {
                listContainer.html('<div class="text-center text-gray-400 text-sm py-8 px-4">Belum ada data. Jadilah yang pertama!</div>');
                return;
            }

            data.forEach((item, index) => {
                let rankStyle = "text-gray-500";
                let bgStyle = "hover:bg-gray-50";
                let crown = "";

                if (index === 0) {
                    rankStyle = "text-yellow-500 font-bold text-lg";
                    bgStyle = "bg-yellow-50/50 border border-yellow-100";
                    crown = "👑";
                } else if (index === 1) { rankStyle = "text-gray-400 font-bold"; }
                  else if (index === 2) { rankStyle = "text-orange-400 font-bold"; }

                const row = `
                    <div class="grid grid-cols-12 gap-1 p-3 rounded-xl items-center transition ${bgStyle}">
                        <div class="col-span-1 text-center ${rankStyle}">${index + 1}</div>
                        <div class="col-span-4 truncate font-medium text-gray-800 text-[13px] pl-1" title="${item.name}">${item.name} ${crown}</div>
                        <div class="col-span-2 text-xs text-gray-500 capitalize truncate">${item.level}</div>
                        <div class="col-span-2 text-center font-bold text-gray-900 text-sm">${item.score}</div>
                        <div class="col-span-3 text-right text-xs font-mono text-gray-600 pr-2">${formatTime(item.time_taken)}</div>
                    </div>
                `;
                listContainer.append(row);
            });
        } catch (error) {
            console.error("Gagal memuat leaderboard:", error);
            $('#leaderboard-list').html('<div class="text-center text-red-400 text-sm py-8">Gagal memuat peringkat.</div>');
        }
    }

    // Menyimpan Skor ke DB
    async function saveScoreToDB(name, finalScore, level, timeTaken) {
        try {
            const { error } = await supabaseClient
                .from('leaderboard')
                .insert([{ 
                    name: name, 
                    score: finalScore, 
                    level: level, 
                    time_taken: timeTaken 
                }]);
            
            if (error) throw error;
            fetchLeaderboard(); 
        } catch (error) {
            console.error("Gagal menyimpan skor:", error);
        }
    }

    fetchLeaderboard();
    
    // Memuat file JSON
    fetch('/quiz-data.json')
        .then(response => response.json())
        .then(data => {
            fullQuizData = data;
            $('#start-btn').prop('disabled', false).text('Mulai Mengerjakan');
        })
        .catch(error => {
            console.error('Error memuat soal:', error);
            $('#start-btn').text('Gagal Memuat Data');
        });

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
    $('#start-btn').click(function() {
        const name = $('#student-name').val().trim();
        const level = $('#level-select').val();

        if (name === '') {
            $('#student-name').addClass('border-red-500').animate({marginLeft: '-10px'}, 50).animate({marginLeft: '10px'}, 50).animate({marginLeft: '0'}, 50);
            setTimeout(() => $('#student-name').removeClass('border-red-500'), 1000);
            return;
        }

        // Ambil array soal sesuai level yang dipilih
        const levelQuestions = fullQuizData[level];
        
        if (!levelQuestions || levelQuestions.length === 0) {
            alert('Soal untuk level ini belum tersedia di file JSON.');
            return;
        }

        student.name = name;
        student.level = level;
        currentQuizSequence = shuffleArray(levelQuestions);
        
        // Reset state
        currentQuestionIndex = 0;
        score = 0;
        secondsElapsed = 0;
        $('#total-q-num').text(currentQuizSequence.length);
        $('#display-level').text(level);
        
        $('#login-container').fadeOut(250, function() {
            $('#progress-container').removeClass('hidden');
            $('#quiz-screen').fadeIn(250);
            
            // Mulai Timer
            $('#timer-display').text("00:00");
            timerInterval = setInterval(() => {
                secondsElapsed++;
                $('#timer-display').text(formatTime(secondsElapsed));
            }, 1000);

            loadQuestion();
        });
    });

    function loadQuestion() {
        updateProgress();
        const q = currentQuizSequence[currentQuestionIndex];
        
        $('#current-q-num').text(currentQuestionIndex + 1);
        $('#instruction-text').text(q.instruction);
        $('#q-points').text(q.points || 10); // Menampilkan poin untuk soal tersebut

        let htmlString = q.codeHtml;
        for (let i = 0; i < q.answers.length; i++) {
            htmlString = htmlString.replace(`DROP${i}`, `<div class="drop-zone drop-zone-empty" data-index="${i}" title="Drop jawaban ke sini"></div>`);
        }
        $('#code-content').html(htmlString);

        const shuffledOptions = [...q.options].sort(() => 0.5 - Math.random());
        $('#options-container').empty().css('opacity', 0).animate({opacity: 1}, 300);
        
        shuffledOptions.forEach(opt => {
            $('#options-container').append(`
                <div class="draggable-item bg-gray-900 text-gray-100 font-mono text-sm px-4 py-2 rounded-lg border border-gray-700" draggable="true" data-value="${opt}">
                    ${opt}
                </div>
            `);
        });

        setupDragAndDrop();
    }

    // SETUP DRAG AND DROP LOGIC
    function setupDragAndDrop() {
        let draggedText = '';
        let draggedElement = null;

        $('.draggable-item').on('dragstart', function(e) {
            draggedText = $(this).attr('data-value');
            draggedElement = $(this);
            e.originalEvent.dataTransfer.setData('text/plain', draggedText);
            $(this).css('opacity', '0.5');
        });

        $('.draggable-item').on('dragend', function() { $(this).css('opacity', '1'); });
        $('.drop-zone').on('dragover', function(e) {
            e.preventDefault();
            if($(this).hasClass('drop-zone-empty')) $(this).addClass('drop-zone-dragover');
        });
        $('.drop-zone').on('dragleave', function() { $(this).removeClass('drop-zone-dragover'); });
        $('.drop-zone').on('drop', function(e) {
            e.preventDefault();
            $(this).removeClass('drop-zone-dragover');
            if($(this).hasClass('drop-zone-filled')) return;
            
            let text = e.originalEvent.dataTransfer.getData('text/plain') || draggedText;
            $(this).text(text).removeClass('drop-zone-empty').addClass('drop-zone-filled').attr('data-filled', text);
            if(draggedElement) draggedElement.hide();
        });

        $('.drop-zone').on('click', function() {
            if ($(this).hasClass('drop-zone-filled')) {
                let val = $(this).attr('data-filled');
                $(this).text('').removeClass('drop-zone-filled').addClass('drop-zone-empty').removeAttr('data-filled');
                $(`.draggable-item[data-value="${val}"]`).fadeIn(200);
            }
        });
    }

    // NEXT BUTTON
    $('#next-btn').click(async function() {
        const q = currentQuizSequence[currentQuestionIndex];
        let allFilled = true;
        let isCorrect = true;

        $('.drop-zone').each(function() {
            let index = $(this).data('index');
            let val = $(this).attr('data-filled');
            if (!val) allFilled = false;
            else if (val !== q.answers[index]) isCorrect = false;
        });

        if (!allFilled) {
            $('#options-container').animate({opacity: 0.5}, 100).animate({opacity: 1}, 100);
            return;
        }

        // Kalkulasi Skor Berdasarkan Poin JSON
        if (isCorrect) {
            score += (q.points || 10);
        }
        
        currentQuestionIndex++;
        
        if (currentQuestionIndex < currentQuizSequence.length) {
            loadQuestion();
        } else {
            // KUIS SELESAI
            clearInterval(timerInterval); // Hentikan timer
            $('#next-btn').prop('disabled', true).text('Menyimpan...');
            
            await saveScoreToDB(student.name, score, student.level, secondsElapsed);
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
                $('#final-level').text(student.level);
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
                            text: `Saya menyelesaikan soal JavaScript Level ${student.level.toUpperCase()} dengan skor ${score} dalam waktu ${formatTime(secondsElapsed)}! Berani tantang?`,
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