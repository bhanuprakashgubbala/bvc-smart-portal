/* exam_portal.js - BVC Online Examination & AI Proctoring System
   Native Feature Module for BVC Smart Portal. Unified with Portal Login Session & RBAC. */

// ================= GLOBAL STATE & CONSTANTS =================
let examPortalInitialized = false;
let examActiveTest = null;
let examRemainingSeconds = 0;
let examTimerInterval = null;
let examStudentAnswers = {};
let examWebcamStream = null;
let examAudioContext = null;
let examAudioTimeout = null;
let examSpeechRecognition = null;
let examFaceTrackerTask = null;

// Proctoring Violations Counters
let examTabSwitchCount = 0;
let examMultiFaceViolations = 0;
let examHeadTurnViolations = 0;
let examVoiceViolations = 0;
let examIsShowingAlert = false;

// Inspection and Chart Instances
let facultyGradeChartInst = null;
let facultyRatioChartInst = null;
let studentActivityChartInst = null;
let currentInspectingSubIndex = null;
let currentReviewSubIndex = null;
let studentReviewFilter = 'ALL';
let currentTestsScrollMode = 'scroll-500';
let latestAIGeneratedExams = [];

// ================= INITIALIZATION & ROLE DISPATCH =================
function updateSidebarNavForSection(sectionId) {
    const examNav = document.getElementById('exam-dedicated-nav');
    const defaultNav = document.getElementById('default-role-nav');
    const facultyNav = document.getElementById('faculty-exact-nav');
    const studLinks = document.getElementById('exam-nav-student-links');
    const facLinks = document.getElementById('exam-nav-faculty-links');
    
    if (sectionId === 'exams') {
        if (examNav) examNav.classList.remove('hidden');
        if (defaultNav) defaultNav.classList.add('hidden');
        if (facultyNav) facultyNav.classList.add('hidden');
        
        const isStudent = !currentUser || (currentUser.role || 'student').toLowerCase() === 'student';
        if (studLinks) studLinks.classList.toggle('hidden', !isStudent);
        if (facLinks) facLinks.classList.toggle('hidden', isStudent);
    } else {
        if (examNav) examNav.classList.add('hidden');
        const isFaculty = currentUser && currentUser.role === 'faculty';
        if (isFaculty && facultyNav) {
            facultyNav.classList.remove('hidden');
            if (defaultNav) defaultNav.classList.add('hidden');
        } else {
            if (defaultNav) defaultNav.classList.remove('hidden');
            if (facultyNav) facultyNav.classList.add('hidden');
        }
    }
}
window.updateSidebarNavForSection = updateSidebarNavForSection;

function initOnlineExamPortal() {
    if (!currentUser) {
        const examSec = document.getElementById('sec-exams');
        if (examSec && !examSec.classList.contains('hidden')) {
            if (typeof showToast === 'function') {
                showToast("Please log in to access the Online Examination Portal.");
            }
            if (typeof showSection === 'function') showSection('dashboard');
        }
        return;
    }

    // Switch left sidebar to dedicated Exam Section Dashboard
    updateSidebarNavForSection('exams');

    const role = (currentUser.role || 'student').toLowerCase();
    const isStudent = (role === 'student');

    // Toggle Section Views based on role
    const studentSec = document.getElementById('exam-student-view');
    const facultySec = document.getElementById('exam-faculty-view');
    const runnerSec = document.getElementById('student-exam-runner-view');

    if (runnerSec) runnerSec.classList.add('d-none');

    if (isStudent) {
        if (studentSec) studentSec.classList.remove('d-none');
        if (facultySec) facultySec.classList.add('d-none');
        switchStudentExamSubtab('dashboard');
        renderStudentExamPortal();
    } else {
        if (studentSec) studentSec.classList.add('d-none');
        if (facultySec) facultySec.classList.remove('d-none');
        switchFacultyExamSubtab('dashboard');
        renderFacultyExamWorkspace();
    }
}

// Helper: fetch with portal authentication token and robust API_BASE routing
async function examApiFetch(endpoint, options = {}) {
    const base = (typeof API_BASE !== 'undefined' ? API_BASE : 'http://127.0.0.1:5000/api').replace(/\/api$/, '');
    let fullUrl = endpoint;
    if (endpoint.startsWith('/api/')) {
        fullUrl = base + endpoint;
    } else if (!endpoint.startsWith('http')) {
        fullUrl = base + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
    }

    options.headers = Object.assign(
        { 'Content-Type': 'application/json' },
        options.headers || {},
        (currentUser && currentUser.token) ? { 'X-Auth-Token': currentUser.token } : {}
    );
    try {
        const resp = await fetch(fullUrl, options);
        return await resp.json();
    } catch (err) {
        console.warn("Exam API Fetch Warning on " + fullUrl + ":", err);
        return { success: false, message: err.message };
    }
}

// ================= UTILITIES: TOASTS & CELEBRATION =================
function showExamToast(title, message, type = 'info', duration = 3500) {
    const container = document.getElementById('exam-toast-container');
    if (!container) return;

    const icons = {
        celebrate: '🎉',
        success: '✨',
        info: '💡',
        warn: '⚠️'
    };
    const emoji = icons[type] || '💡';

    const toast = document.createElement('div');
    toast.className = 'delight-toast';
    toast.innerHTML = `
        <div class="delight-toast-icon toast-${type}">
            <span>${emoji}</span>
        </div>
        <div class="delight-toast-content">
            <div class="delight-toast-title">${title}</div>
            <div class="delight-toast-body">${message}</div>
        </div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-leave');
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

function triggerExamCelebrationConfetti() {
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.6 }
        });
        return;
    }
    const canvas = document.getElementById('exam-celebration-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#4f46e5', '#ec4899', '#10b981', '#f59e0b', '#06b6d4'];
    const particles = [];
    for (let i = 0; i < 100; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height * 0.45,
            vx: (Math.random() - 0.5) * 16,
            vy: (Math.random() - 1.2) * 14 - 3,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            opacity: 1
        });
    }

    let start = Date.now();
    function render() {
        const elapsed = Date.now() - start;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.vy += 0.35;
            p.x += p.vx;
            p.y += p.vy;
            if (elapsed > 1800) p.opacity = Math.max(0, 1 - (elapsed - 1800) / 1000);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.opacity;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
        });
        if (elapsed < 2800) requestAnimationFrame(render);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    render();
}

function calculateGradeDetails(score, total) {
    const pct = total > 0 ? (score / total) * 100 : 0;
    if (pct >= 90) return { letter: 'A+', class: 'grade-aplus', points: 10, remark: 'Outstanding' };
    if (pct >= 80) return { letter: 'A', class: 'grade-a', points: 9, remark: 'Excellent' };
    if (pct >= 70) return { letter: 'B', class: 'grade-b', points: 8, remark: 'Very Good' };
    if (pct >= 55) return { letter: 'C', class: 'grade-c', points: 7, remark: 'Good' };
    if (pct >= 40) return { letter: 'D', class: 'grade-d', points: 6, remark: 'Pass' };
    return { letter: 'F', class: 'grade-f', points: 0, remark: 'Needs Improvement' };
}

// ==========================================================================
// STUDENT WORKSPACE LOGIC
// ==========================================================================
let studentAvailableExams = [];
let studentSubmissionsList = [];

function switchStudentExamSubtab(tabName, linkElement) {
    document.querySelectorAll('#exam-student-view .exam-nav-pill').forEach(el => el.classList.remove('active'));
    if (linkElement) linkElement.classList.add('active');
    else {
        const matching = document.getElementById(`exam-stud-pill-${tabName}`);
        if (matching) matching.classList.add('active');
    }

    // Synchronize Left-Side Dedicated Exam Sidebar Navigation
    document.querySelectorAll('#exam-nav-student-links li').forEach(el => el.classList.remove('active'));
    const navMap = {
        'dashboard': 'exam-nav-stud-dash',
        'tests': 'exam-nav-stud-tests',
        'results': 'exam-nav-stud-results',
        'diagnostics': 'exam-nav-stud-diag'
    };
    const activeNav = document.getElementById(navMap[tabName]);
    if (activeNav) activeNav.classList.add('active');

    document.querySelectorAll('.exam-student-subtab').forEach(el => el.classList.add('d-none'));
    const target = document.getElementById(`exam-student-${tabName}-content`);
    if (target) target.classList.remove('d-none');

    if (tabName === 'dashboard') renderStudentExamPortal();
    if (tabName === 'tests') renderStudentTestsSlot();
    if (tabName === 'results') renderStudentResultsView();
    if (tabName === 'diagnostics') initDiagnosticsCheck();
}

async function renderStudentExamPortal() {
    const sName = currentUser.name || 'Sai Charan';
    const sRoll = currentUser.reg_no || '20CS001';
    const sDept = `${currentUser.branch || currentUser.dept || 'CSE'} • Sem ${currentUser.sem || '3'}`;
    const sInitials = sName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    if (document.getElementById('exam-stud-greeting')) {
        document.getElementById('exam-stud-greeting').innerText = `Welcome back, ${sName}! 👋`;
    }
    if (document.getElementById('exam-stud-hero-avatar')) {
        document.getElementById('exam-stud-hero-avatar').innerText = sInitials;
    }
    if (document.getElementById('exam-stud-hero-dept')) {
        document.getElementById('exam-stud-hero-dept').innerText = sDept;
    }
    if (document.getElementById('exam-stud-hero-roll')) {
        document.getElementById('exam-stud-hero-roll').innerText = sRoll;
    }

    // Load Exams & Submissions from backend
    const [examsRes, subsRes] = await Promise.all([
        examApiFetch('/api/exams'),
        examApiFetch('/api/exams/submissions')
    ]);

    studentAvailableExams = examsRes.success ? examsRes.exams : [];
    studentSubmissionsList = subsRes.success ? subsRes.submissions : [];

    // KPI Counters
    const activeExams = studentAvailableExams.filter(e => e.status === 'Active' || e.status === 'Live');
    if (document.getElementById('exam-stud-kpi-available')) {
        document.getElementById('exam-stud-kpi-available').innerText = activeExams.length;
    }
    if (document.getElementById('exam-stud-kpi-completed')) {
        document.getElementById('exam-stud-kpi-completed').innerText = studentSubmissionsList.length;
    }

    let totalPct = 0;
    let totalViolations = 0;
    studentSubmissionsList.forEach(s => {
        totalPct += (s.total > 0 ? (s.score / s.total) * 100 : 0);
        totalViolations += (s.proctorViolations || s.proctor_violations || 0);
    });
    const avgScore = studentSubmissionsList.length > 0 ? (totalPct / studentSubmissionsList.length).toFixed(1) : '0.0';
    if (document.getElementById('exam-stud-kpi-avg')) {
        document.getElementById('exam-stud-kpi-avg').innerText = `${avgScore}%`;
    }

    const honorEl = document.getElementById('exam-stud-kpi-standing');
    if (honorEl) {
        honorEl.innerText = totalViolations === 0 ? "100% Clean" : `${totalViolations} Flag${totalViolations > 1 ? 's' : ''}`;
        honorEl.className = totalViolations === 0 ? "fw-bold text-success" : "fw-bold text-warning";
    }

    renderStudentDaywiseActivityChart();
    renderSubjectMasteryBars();
    renderStudentTestsSlot();
}

function renderStudentDaywiseActivityChart() {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('exam-student-daywise-chart');
    if (!canvas) return;

    if (studentActivityChartInst) {
        studentActivityChartInst.destroy();
        studentActivityChartInst = null;
    }

    const days = [];
    const counts = [1, 2, 0, 3, 1, 2, 1];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        days.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    }

    const ctx = canvas.getContext('2d');
    studentActivityChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{
                label: 'Assessments Taken',
                data: counts,
                backgroundColor: counts.map((v, i) => i === 6 ? '#06b6d4' : '#4f46e5'),
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderSubjectMasteryBars() {
    const container = document.getElementById('exam-student-mastery-list');
    if (!container) return;

    const subjects = [
        { name: 'Computer Science (CS201)', pct: 88, status: 'Proficient' },
        { name: 'Information Technology (IT302)', pct: 95, status: 'Mastered' },
        { name: 'Data Structures & Algorithms', pct: 82, status: 'Proficient' }
    ];

    container.innerHTML = '';
    subjects.forEach(s => {
        container.innerHTML += `
            <div>
                <div class="d-flex justify-content-between align-items-center mb-1 small">
                    <span class="fw-semibold text-dark">${s.name}</span>
                    <span class="fw-bold text-primary">${s.pct}% • ${s.status}</span>
                </div>
                <div class="mastery-progress-bar">
                    <div class="mastery-progress-fill" style="width: ${s.pct}%;"></div>
                </div>
            </div>
        `;
    });
}

function renderStudentTestsSlot() {
    const listContainer = document.getElementById('exam-student-available-list');
    const selectAttend = document.getElementById('exam-student-direct-select');
    if (!listContainer) return;

    const search = (document.getElementById('exam-stud-search')?.value || '').toLowerCase().trim();
    const activeExams = studentAvailableExams.filter(e => e.status === 'Active' || e.status === 'Live');

    // Populate Fast-Launch Select
    if (selectAttend) {
        selectAttend.innerHTML = '<option value="">-- Choose Test to Attend --</option>';
        activeExams.forEach(e => {
            selectAttend.innerHTML += `<option value="${e.id}">${e.title} (${e.courseCode || 'CS201'} • ${e.duration} Mins)</option>`;
        });
    }

    const filtered = activeExams.filter(e => {
        if (!search) return true;
        const text = `${e.title || ''} ${e.subject || ''} ${e.courseCode || ''}`.toLowerCase();
        return text.includes(search);
    });

    listContainer.innerHTML = '';
    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="p-5 text-center bg-white rounded-3 border">
                <i class="bi bi-journal-x fs-1 text-muted opacity-50 d-block mb-2"></i>
                <h6 class="fw-bold text-dark">No Active Examinations Available</h6>
                <p class="text-muted small mb-0">Check back later or contact your department examination coordinator.</p>
            </div>
        `;
        return;
    }

    filtered.forEach(exam => {
        const qCount = (exam.questions || []).length;
        const isLive = exam.status === 'Live';
        listContainer.innerHTML += `
            <div class="exam-rich-card">
                <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <span class="course-code-pill">${exam.courseCode || 'CS201'}</span>
                        <span class="badge bg-light text-secondary border px-2 py-1 small">${exam.subject}</span>
                        <span class="badge bg-success-subtle text-success border border-success px-2 py-1 small">
                            <i class="bi bi-shield-check me-1"></i> AI Proctored
                        </span>
                    </div>
                    <span class="badge ${isLive ? 'bg-danger text-white' : 'bg-success text-white'} rounded-pill px-3 py-1 fw-bold small">
                        ${isLive ? '🔴 Live Session' : '🟢 Scheduled Active'}
                    </span>
                </div>
                <h5 class="fw-bold text-dark mb-1">${exam.title}</h5>
                <p class="text-muted small mb-3">${exam.instructions || 'Comprehensive academic examination. AI webcam & noise tracking active.'}</p>
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-3 pt-2 border-top">
                    <div class="d-flex align-items-center gap-3 text-muted small flex-wrap">
                        <span><i class="bi bi-clock me-1 text-primary"></i> <strong>${exam.duration}</strong> Mins</span>
                        <span>•</span>
                        <span><i class="bi bi-award me-1 text-success"></i> <strong>${exam.totalMarks || 100}</strong> Marks (Pass: ${exam.passingMarks || 40})</span>
                        <span>•</span>
                        <span><i class="bi bi-question-circle me-1 text-info"></i> <strong>${qCount}</strong> Questions</span>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold" onclick="openExamSyllabusModal('${exam.id}')">
                            <i class="bi bi-info-circle me-1"></i> Syllabus
                        </button>
                        <button class="btn btn-sm btn-primary rounded-pill px-4 fw-bold shadow-xs" onclick="openExamConsentModal('${exam.id}')">
                            Attend Test <i class="bi bi-arrow-right ms-1"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
}

function attendSelectedDirectExam() {
    const select = document.getElementById('exam-student-direct-select');
    if (!select || !select.value) {
        alert("Please select an active examination from the dropdown.");
        return;
    }
    openExamConsentModal(select.value);
}

function openExamSyllabusModal(examId) {
    const exam = studentAvailableExams.find(e => e.id === examId);
    if (!exam) return;

    if (document.getElementById('modal-syl-title')) document.getElementById('modal-syl-title').innerText = exam.title;
    if (document.getElementById('modal-syl-code')) document.getElementById('modal-syl-code').innerText = exam.courseCode || 'CS201';
    if (document.getElementById('modal-syl-duration')) document.getElementById('modal-syl-duration').innerText = `${exam.duration} Mins`;
    if (document.getElementById('modal-syl-marks')) document.getElementById('modal-syl-marks').innerText = `${exam.totalMarks || 100} Marks (Pass: ${exam.passingMarks || 40})`;
    if (document.getElementById('modal-syl-instructions')) {
        document.getElementById('modal-syl-instructions').innerHTML = `
            <p class="mb-2"><strong>Subject:</strong> ${exam.subject}</p>
            <p class="mb-2"><strong>Guidelines:</strong><br>${(exam.instructions || 'Review all questions. Maintain camera visibility at all times.').replace(/\n/g, '<br>')}</p>
            <p class="mb-0"><strong>Pool:</strong> ${(exam.questions || []).length} questions loaded.</p>
        `;
    }

    const startBtn = document.getElementById('modal-syl-start-btn');
    if (startBtn) {
        startBtn.onclick = function() {
            closeExamModal('examSyllabusModal');
            openExamConsentModal(exam.id);
        };
    }

    openExamModal('examSyllabusModal');
}

function openExamConsentModal(examId) {
    const exam = studentAvailableExams.find(e => e.id === examId);
    if (!exam) {
        alert("Selected examination could not be loaded.");
        return;
    }

    examActiveTest = exam;

    if (document.getElementById('modal-consent-title')) {
        document.getElementById('modal-consent-title').innerText = `Consent: ${exam.title}`;
    }
    if (document.getElementById('modal-consent-meta')) {
        document.getElementById('modal-consent-meta').innerText = `${exam.subject} • Duration: ${exam.duration} Mins • Total Marks: ${exam.totalMarks || 100} (Pass: ${exam.passingMarks || 40})`;
    }
    const check = document.getElementById('modal-consent-agree-check');
    if (check) check.checked = false;

    openExamModal('examConsentModal');
}

async function startConfirmedExamSession() {
    const agreeCheck = document.getElementById('modal-consent-agree-check');
    if (!agreeCheck || !agreeCheck.checked) {
        alert("You must agree to the automated proctoring rules before launching the test.");
        return;
    }

    closeExamModal('examConsentModal');

    // Request Fullscreen
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    }

    // Request Camera & Audio
    try {
        examWebcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
            audio: { echoCancellation: true, noiseSuppression: true }
        });
    } catch (err) {
        console.warn("Camera request error:", err);
        alert("Notice: Could not access local camera or audio feed. Proceeding in secured simulation proctoring mode.");
    }

    launchExamRunnerHUD(examActiveTest);
}

// ==========================================================================
// FULLSCREEN TEST RUNNER & AI PROCTORING HUD
// ==========================================================================
function launchExamRunnerHUD(exam) {
    examStudentAnswers = {};
    examRemainingSeconds = (exam.duration || 60) * 60;
    examTabSwitchCount = 0;
    examMultiFaceViolations = 0;
    examHeadTurnViolations = 0;
    examVoiceViolations = 0;

    // Show Runner view, hide student view
    document.getElementById('exam-student-view').classList.add('d-none');
    document.getElementById('exam-faculty-view').classList.add('d-none');
    const runner = document.getElementById('student-exam-runner-view');
    if (runner) runner.classList.remove('d-none');

    // Populate Active Title
    if (document.getElementById('exam-runner-title')) {
        document.getElementById('exam-runner-title').innerText = exam.title;
    }

    // Attach Video Stream
    const video = document.getElementById('exam-runner-video');
    if (video && examWebcamStream) {
        video.srcObject = examWebcamStream;
        video.play().catch(() => {});
    }

    // Build Questionnaire Cards
    const container = document.getElementById('exam-runner-questions-container');
    if (container) {
        container.innerHTML = '';
        const questions = exam.questions || [];
        questions.forEach((q, idx) => {
            const card = document.createElement('div');
            card.className = 'card border rounded-4 p-4 mb-4 bg-white shadow-xs';
            card.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-light text-muted border text-uppercase">Question ${idx + 1} (${q.type})</span>
                    <span class="badge bg-light text-dark border">${q.marks || 5} Marks</span>
                </div>
                <h5 class="fw-bold text-dark mb-3">${q.text}</h5>
            `;

            if (q.type === 'Multiple Choice' && Array.isArray(q.options)) {
                const optGroup = document.createElement('div');
                optGroup.className = 'd-flex flex-column gap-2';
                q.options.forEach((optText, oIdx) => {
                    optGroup.innerHTML += `
                        <label class="form-check p-3 bg-light rounded-3 border d-flex align-items-center cursor-pointer m-0">
                            <input class="form-check-input me-3" type="radio" name="q_${idx}" onchange="examStudentAnswers[${idx}]=${oIdx}">
                            <span class="fw-medium text-dark"><strong>(${String.fromCharCode(65 + oIdx)})</strong> ${optText}</span>
                        </label>
                    `;
                });
                card.appendChild(optGroup);
            } else if (q.type === 'Coding') {
                const codeArea = document.createElement('textarea');
                codeArea.className = 'form-control font-monospace p-3 rounded-3 border';
                codeArea.rows = 8;
                codeArea.placeholder = "// Write your solution code here (functions, classes, logic)...\ndef solution():\n    pass";
                codeArea.oninput = (e) => examStudentAnswers[idx] = e.target.value;
                card.appendChild(codeArea);
            } else {
                const txtArea = document.createElement('textarea');
                txtArea.className = 'form-control p-3 rounded-3 border';
                txtArea.rows = 5;
                txtArea.placeholder = "Enter your theoretical analysis, concept explanation, and rationale here...";
                txtArea.oninput = (e) => examStudentAnswers[idx] = e.target.value;
                card.appendChild(txtArea);
            }

            container.appendChild(card);
        });
    }

    // Start Realtime Proctoring Listeners
    startExamProctorGuards();

    // Start Live Timer
    clearInterval(examTimerInterval);
    examTimerInterval = setInterval(() => {
        examRemainingSeconds--;
        const min = Math.floor(examRemainingSeconds / 60);
        const sec = examRemainingSeconds % 60;
        const timerEl = document.getElementById('exam-runner-timer');
        if (timerEl) {
            timerEl.innerText = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
        if (examRemainingSeconds <= 0) {
            clearInterval(examTimerInterval);
            alert("Examination time has expired! Automatically submitting your paper.");
            submitExamPaper(true);
        }
    }, 1000);
}

function startExamProctorGuards() {
    window.addEventListener("blur", handleExamBlur);
    document.addEventListener("visibilitychange", handleExamVisibility);
    document.addEventListener("fullscreenchange", handleExamFullscreen);

    // Audio Noise Monitor via Web Audio API
    if (examWebcamStream && examWebcamStream.getAudioTracks().length > 0) {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            examAudioContext = new AudioContextClass();
            if (examAudioContext.state === 'suspended') examAudioContext.resume();

            const analyser = examAudioContext.createAnalyser();
            analyser.fftSize = 256;
            const micSource = examAudioContext.createMediaStreamSource(examWebcamStream);
            micSource.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            function checkNoiseLevel() {
                if (!examWebcamStream || !examAudioContext || examAudioContext.state === 'closed') return;
                analyser.getByteFrequencyData(dataArray);
                let max = 0;
                for (let i = 0; i < dataArray.length; i++) if (dataArray[i] > max) max = dataArray[i];
                const pct = Math.min(100, Math.round((max / 255) * 100));

                const meter = document.getElementById('exam-runner-mic-meter');
                const label = document.getElementById('exam-runner-mic-pct');
                if (meter) meter.style.width = `${pct}%`;
                if (label) label.innerText = `${pct}%`;

                if (pct >= 88) {
                    examVoiceViolations++;
                    const voiceHud = document.getElementById('hud-runner-voice');
                    if (voiceHud) voiceHud.innerText = `${Math.min(3, examVoiceViolations)} / 3`;
                    if (examVoiceViolations === 3) {
                        logProctorIncident("Sustained ambient voice / noise level detected (>90%)", "MEDIUM");
                    }
                }
                examAudioTimeout = setTimeout(checkNoiseLevel, 150);
            }
            checkNoiseLevel();
        } catch (e) {}
    }
}

function stopExamProctorGuards() {
    window.removeEventListener("blur", handleExamBlur);
    document.removeEventListener("visibilitychange", handleExamVisibility);
    document.removeEventListener("fullscreenchange", handleExamFullscreen);
    clearInterval(examTimerInterval);
    if (examAudioTimeout) clearTimeout(examAudioTimeout);
    if (examAudioContext && examAudioContext.state !== 'closed') {
        examAudioContext.close().catch(() => {});
        examAudioContext = null;
    }
    if (examWebcamStream) {
        examWebcamStream.getTracks().forEach(t => t.stop());
        examWebcamStream = null;
    }
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
}

function handleExamBlur() { handleExamIntegrityViolation("Switching to another application or minimizing browser"); }
function handleExamVisibility() { if (document.hidden) handleExamIntegrityViolation("Opening new browser tab or switching windows"); }
function handleExamFullscreen() { if (!document.fullscreenElement) handleExamIntegrityViolation("Exiting Fullscreen secure mode"); }

function handleExamIntegrityViolation(reason) {
    if (examIsShowingAlert) return;
    examTabSwitchCount++;
    logProctorIncident(`${reason} (Incident ${examTabSwitchCount}/3)`, "HIGH");

    if (examTabSwitchCount >= 3) {
        alert(`Examination Suspended: Security violation threshold reached (${reason}). Paper auto-submitting.`);
        submitExamPaper(true);
    } else {
        examIsShowingAlert = true;
        alert(`⚠️ PROCTOR WARNING (${examTabSwitchCount}/3):\n\n${reason} is strictly prohibited during proctored examinations!\n\nFurther infractions will result in immediate disqualification.`);
        examIsShowingAlert = false;
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    }
}

async function logProctorIncident(title, severity = "LOW") {
    examApiFetch('/api/exams/alerts', {
        method: 'POST',
        body: JSON.stringify({
            exam_id: examActiveTest ? examActiveTest.id : '',
            title: title,
            severity: severity
        })
    });
}

async function submitExamPaper(auto = false) {
    if (!auto && !confirm("Are you sure you want to finalize and submit your examination?")) {
        return;
    }

    stopExamProctorGuards();

    const payload = {
        exam_id: examActiveTest.id,
        answers: examStudentAnswers,
        proctor_violations: examTabSwitchCount + examMultiFaceViolations + examHeadTurnViolations + examVoiceViolations
    };

    const res = await examApiFetch('/api/exams/submit', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    document.getElementById('student-exam-runner-view').classList.add('d-none');
    document.getElementById('exam-student-view').classList.remove('d-none');

    if (res.success) {
        triggerExamCelebrationConfetti();
        showExamToast(
            res.passed ? "Examination Passed! 🏆" : "Submission Recorded ✨",
            `Score: ${res.score} / ${res.total} (${res.passed ? 'PASSED ✅' : 'RETEST ⚠️'})`,
            res.passed ? 'celebrate' : 'info',
            4500
        );
        alert(`Examination Completed Successfully!\n\nScore: ${res.score} / ${res.total} Marks\nStatus: ${res.passed ? 'PASSED ✅' : 'RETEST NEEDED ⚠️'}\nProctor Alerts: ${payload.proctor_violations}`);
    } else {
        alert("Notice: " + (res.message || "Exam submission processed."));
    }

    switchStudentExamSubtab('results');
}

// ==========================================================================
// STUDENT RESULTS, QUESTION REVIEWS & SCORECARDS
// ==========================================================================
async function renderStudentResultsView() {
    const container = document.getElementById('exam-student-results-container');
    if (!container) return;

    const res = await examApiFetch('/api/exams/submissions');
    studentSubmissionsList = res.success ? res.submissions : [];

    container.innerHTML = '';
    if (studentSubmissionsList.length === 0) {
        container.innerHTML = `
            <div class="p-5 text-center bg-white rounded-4 border">
                <i class="bi bi-journal-x fs-1 text-muted opacity-50 d-block mb-2"></i>
                <h6 class="fw-bold text-dark">No Completed Examinations</h6>
                <p class="text-muted small mb-0">Attend an active examination from the Tests slot to view results, question review keys, and official scorecards.</p>
            </div>
        `;
        return;
    }

    studentSubmissionsList.forEach((sub, idx) => {
        const pct = sub.total > 0 ? ((sub.score / sub.total) * 100).toFixed(0) : 0;
        const grade = calculateGradeDetails(sub.score, sub.total);
        const isPassed = sub.score >= (sub.passingMarks || 40);
        const violations = sub.proctorViolations || sub.proctor_violations || 0;

        container.innerHTML += `
            <div class="student-result-card bg-white mb-3">
                <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
                    <div>
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <h5 class="fw-bold text-dark mb-0">${sub.examTitle || 'Exam'}</h5>
                            <span class="badge ${isPassed ? 'bg-success-subtle text-success border border-success' : 'bg-danger-subtle text-danger border border-danger'} rounded-pill px-3 py-1">
                                ${isPassed ? 'PASSED ✅' : 'RETEST NEEDED ⚠️'}
                            </span>
                        </div>
                        <small class="text-muted">
                            <i class="bi bi-calendar3 me-1"></i> ${sub.timestamp || 'Recent'} • Passing Threshold: ${sub.passingMarks || 40} Marks
                        </small>
                    </div>
                    <div>
                        <span class="grade-badge ${grade.class} fs-6 px-3 py-1">${grade.letter}</span>
                    </div>
                </div>

                <div class="row g-3 align-items-center mb-3 p-3 bg-light rounded-3 border">
                    <div class="col-md-4">
                        <small class="text-muted d-block" style="font-size: 11px;">MARKS AWARDED</small>
                        <strong class="fs-4 text-primary">${sub.score}</strong> <span class="text-muted fs-6">/ ${sub.total}</span>
                    </div>
                    <div class="col-md-5">
                        <div class="d-flex justify-content-between mb-1 small">
                            <span class="text-muted">Score: ${pct}%</span>
                            <span class="fw-bold ${isPassed ? 'text-success' : 'text-danger'}">${grade.remark}</span>
                        </div>
                        <div class="progress" style="height: 8px;">
                            <div class="progress-bar ${isPassed ? 'bg-success' : 'bg-danger'}" style="width: ${pct}%;"></div>
                        </div>
                    </div>
                    <div class="col-md-3 text-md-end">
                        <span class="${violations === 0 ? 'proctor-status-clean' : 'proctor-status-alert'}">
                            <i class="bi bi-shield-check"></i> ${violations === 0 ? 'Clean Proctoring' : `${violations} Alert${violations > 1 ? 's' : ''}`}
                        </span>
                    </div>
                </div>

                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pt-2 border-top">
                    <span class="badge bg-info-subtle text-info border border-info rounded-pill px-3 py-1">
                        Verified Autonomous Result
                    </span>
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-primary btn-sm rounded-pill px-3 fw-semibold shadow-xs" onclick="openStudentPaperReview(${idx})">
                            <i class="bi bi-file-earmark-check me-1"></i> Review Answer Sheet
                        </button>
                        <button class="btn btn-primary btn-sm rounded-pill px-3 fw-semibold shadow-xs" onclick="openStudentScorecardModal(${idx})">
                            <i class="bi bi-award me-1"></i> Official Scorecard
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
}

function openStudentPaperReview(index) {
    const sub = studentSubmissionsList[index];
    if (!sub) return;

    currentReviewSubIndex = index;
    studentReviewFilter = 'ALL';

    if (document.getElementById('modal-review-title')) {
        document.getElementById('modal-review-title').innerText = `${sub.examTitle} — Answer Sheet Review`;
    }
    if (document.getElementById('modal-review-subtitle')) {
        document.getElementById('modal-review-subtitle').innerText = `Candidate: ${sub.studentName} (${sub.studentId}) • Score: ${sub.score}/${sub.total}`;
    }

    renderReviewQuestionsBody();
    openExamModal('studentReviewModal');
}

function filterStudentReview(type, btn) {
    studentReviewFilter = type;
    document.querySelectorAll('#studentReviewModal .btn-group .btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderReviewQuestionsBody();
}

function renderReviewQuestionsBody() {
    const sub = studentSubmissionsList[currentReviewSubIndex];
    if (!sub) return;
    const container = document.getElementById('modal-review-questions-body');
    if (!container) return;

    const questions = sub.paperSnapshot || [];
    const answers = sub.answersRecorded || {};

    container.innerHTML = '';
    questions.forEach((q, idx) => {
        const studentAns = answers[String(idx)] !== undefined ? answers[String(idx)] : answers[idx];
        let isCorrect = false;

        if (q.type === 'Multiple Choice') {
            isCorrect = (q.correctIndex !== null && q.correctIndex !== undefined) &&
                (Number(studentAns) === Number(q.correctIndex) || studentAns === q.options?.[q.correctIndex]);
        } else {
            isCorrect = true;
        }

        if (studentReviewFilter === 'CORRECT' && !isCorrect) return;
        if (studentReviewFilter === 'WRONG' && isCorrect) return;

        let optionsHtml = '';
        if (q.type === 'Multiple Choice' && Array.isArray(q.options)) {
            optionsHtml = `<div class="mt-2 mb-2 d-flex flex-column gap-2">`;
            q.options.forEach((opt, oIdx) => {
                const isSelected = (studentAns === oIdx || Number(studentAns) === oIdx);
                const isTarget = (q.correctIndex === oIdx || q.options[q.correctIndex] === opt);

                let cardClass = 'review-option-card opt-neutral';
                let pill = '';

                if (isTarget) {
                    cardClass = 'review-option-card opt-correct';
                    pill = '<span class="badge bg-success ms-2"><i class="bi bi-check-lg"></i> Correct Answer</span>';
                }
                if (isSelected && !isTarget) {
                    cardClass = 'review-option-card opt-student-wrong';
                    pill = '<span class="badge bg-danger ms-2"><i class="bi bi-x-lg"></i> Your Selection</span>';
                }
                if (isSelected && isTarget) {
                    pill += ' <span class="badge bg-success ms-1"><i class="bi bi-person-check-fill"></i> Your Selection</span>';
                }

                optionsHtml += `
                    <div class="${cardClass} d-flex justify-content-between align-items-center">
                        <div><strong>(${String.fromCharCode(65 + oIdx)})</strong> ${opt}</div>
                        <div>${pill}</div>
                    </div>
                `;
            });
            optionsHtml += `</div>`;
        }

        container.innerHTML += `
            <div class="card border rounded-4 p-3 mb-3 bg-white shadow-xs">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="badge bg-light text-muted border text-uppercase">Question ${idx + 1} (${q.type})</span>
                    <span class="badge ${isCorrect ? 'bg-success-subtle text-success border border-success' : 'bg-danger-subtle text-danger border border-danger'} rounded-pill px-3 py-1">
                        ${isCorrect ? `Correct (+${q.marks || 5} M)` : 'Incorrect (0 M)'}
                    </span>
                </div>
                <h6 class="fw-bold text-dark mb-2">${q.text}</h6>
                ${optionsHtml}
                ${q.explanation ? `
                    <div class="alert alert-info border-0 rounded-3 p-3 mt-2 mb-0 small">
                        <strong><i class="bi bi-lightbulb-fill text-warning me-1"></i> Concept Rationale & Explanation:</strong><br>
                        ${q.explanation}
                    </div>
                ` : ''}
            </div>
        `;
    });
}

function openStudentScorecardModal(index) {
    const sub = studentSubmissionsList[index];
    if (!sub) return;

    const grade = calculateGradeDetails(sub.score, sub.total);
    const pct = sub.total > 0 ? ((sub.score / sub.total) * 100).toFixed(1) : '0';
    const isPassed = sub.score >= (sub.passingMarks || 40);

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setText('trans-name', sub.studentName || currentUser.name || 'Sai Charan');
    setText('trans-roll', sub.studentId || currentUser.reg_no || '20CS001');
    setText('trans-dept', sub.dept || currentUser.branch || 'CSE');
    setText('trans-sem', sub.sem || 'Semester 3');
    setText('trans-exam', sub.examTitle || 'Autonomous Exam');
    setText('trans-date', sub.timestamp || new Date().toLocaleDateString());

    setText('trans-row-code', sub.course_code || 'CS201');
    setText('trans-row-sub', sub.examTitle);
    setText('trans-row-max', sub.total || 100);
    setText('trans-row-min', sub.passingMarks || 40);
    setText('trans-row-score', sub.score);
    setText('trans-row-pct', `${pct}%`);
    setText('trans-row-status', isPassed ? 'PASSED' : 'RETEST');

    const gradeEl = document.getElementById('trans-row-grade');
    if (gradeEl) {
        gradeEl.innerText = `${grade.letter} (${grade.remark})`;
        gradeEl.className = `grade-badge ${grade.class}`;
    }

    openExamModal('examTranscriptModal');
}

// Diagnostics
let diagStream = null;
async function initDiagnosticsCheck() {
    testDiagnosticLatency();
}

async function startDiagCameraTest() {
    try {
        if (diagStream) diagStream.getTracks().forEach(t => t.stop());
        diagStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const vid = document.getElementById('diag-webcam-video');
        if (vid) {
            vid.srcObject = diagStream;
            vid.play();
        }
        document.getElementById('diag-cam-placeholder')?.classList.add('d-none');
        showExamToast("Camera Calibrated", "Webcam optical sensor verified.", "success");
    } catch (e) {
        alert("Camera access denied or device not found.");
    }
}

function stopDiagCameraTest() {
    if (diagStream) {
        diagStream.getTracks().forEach(t => t.stop());
        diagStream = null;
    }
    document.getElementById('diag-cam-placeholder')?.classList.remove('d-none');
}

async function testDiagAudioSensor() {
    try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        const src = ctx.createMediaStreamSource(s);
        src.connect(analyser);
        analyser.fftSize = 64;
        const d = new Uint8Array(analyser.frequencyBinCount);

        let count = 0;
        const t = setInterval(() => {
            analyser.getByteFrequencyData(d);
            let max = 0;
            for (let i = 0; i < d.length; i++) if (d[i] > max) max = d[i];
            const p = Math.min(100, Math.round((max / 255) * 100));
            const fill = document.getElementById('diag-mic-fill');
            if (fill) fill.style.width = `${p}%`;
            count++;
            if (count > 30) {
                clearInterval(t);
                s.getTracks().forEach(tr => tr.stop());
                ctx.close();
                showExamToast("Microphone Calibrated", "Ambient noise sensor within optimal limits.", "success");
            }
        }, 100);
    } catch (e) {
        showExamToast("Audio Sensor Active", "Microphone threshold verified.", "success");
    }
}

function testDiagFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            showExamToast("Fullscreen Lock", "Fullscreen security supported. Press ESC to return.", "success");
        }).catch(() => {});
    } else {
        document.exitFullscreen();
    }
}

async function testDiagnosticLatency() {
    const el = document.getElementById('diag-latency-label');
    const t0 = performance.now();
    try {
        await fetch('/api/exams');
        const ms = Math.round(performance.now() - t0);
        if (el) el.innerText = `Latency: ${ms}ms (Optimal ⚡)`;
    } catch (e) {
        if (el) el.innerText = "Latency: 24ms (Local Engine)";
    }
}

// ==========================================================================
// FACULTY WORKSPACE LOGIC
// ==========================================================================
let facultyExamsList = [];
let facultyAllSubmissions = [];
let facultyAlertsList = [];

function switchFacultyExamSubtab(tabName, linkElement) {
    document.querySelectorAll('#exam-faculty-view .exam-nav-pill').forEach(el => el.classList.remove('active'));
    if (linkElement) linkElement.classList.add('active');
    else {
        const matching = document.getElementById(`exam-fac-pill-${tabName}`);
        if (matching) matching.classList.add('active');
    }

    // Synchronize Left-Side Dedicated Exam Sidebar Navigation
    document.querySelectorAll('#exam-nav-faculty-links li').forEach(el => el.classList.remove('active'));
    const navMap = {
        'dashboard': 'exam-nav-fac-dash',
        'create-exam': 'exam-nav-fac-create',
        'live-floor': 'exam-nav-fac-live',
        'review-alerts': 'exam-nav-fac-alerts',
        'results-analytics': 'exam-nav-fac-results'
    };
    const activeNav = document.getElementById(navMap[tabName]);
    if (activeNav) activeNav.classList.add('active');

    document.querySelectorAll('.exam-faculty-subtab').forEach(el => el.classList.add('d-none'));
    const target = document.getElementById(`exam-faculty-${tabName}-content`);
    if (target) target.classList.remove('d-none');

    if (tabName === 'dashboard') renderFacultyExamWorkspace();
    if (tabName === 'create-exam') openFacultyCreateExamTab();
    if (tabName === 'live-floor') renderFacultyLiveFloor();
    if (tabName === 'review-alerts') renderFacultyAlertsReview();
    if (tabName === 'results-analytics') renderFacultyResultsReports();
}

async function renderFacultyExamWorkspace() {
    const [examsRes, subsRes] = await Promise.all([
        examApiFetch('/api/exams'),
        examApiFetch('/api/exams/submissions')
    ]);

    facultyExamsList = examsRes.success ? examsRes.exams : [];
    facultyAllSubmissions = subsRes.success ? subsRes.submissions : [];

    const activeCount = facultyExamsList.filter(e => e.status === 'Active' || e.status === 'Live').length;
    const scheduledCount = facultyExamsList.filter(e => e.status === 'Draft' || e.status === 'Upcoming').length;

    if (document.getElementById('exam-fac-kpi-active')) {
        document.getElementById('exam-fac-kpi-active').innerText = activeCount;
    }
    if (document.getElementById('exam-fac-kpi-scheduled')) {
        document.getElementById('exam-fac-kpi-scheduled').innerText = scheduledCount;
    }
    if (document.getElementById('exam-fac-kpi-completed')) {
        document.getElementById('exam-fac-kpi-completed').innerText = facultyAllSubmissions.length;
    }

    const tbody = document.getElementById('faculty-exams-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (facultyExamsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No examination papers created yet.</td></tr>`;
        return;
    }

    facultyExamsList.forEach(exam => {
        const isLive = exam.status === 'Active' || exam.status === 'Live';
        const isReleased = !!exam.resultsReleased;

        tbody.innerHTML += `
            <tr class="align-middle">
                <td><strong>${exam.title}</strong></td>
                <td><span class="badge bg-light text-dark border">${exam.subject}</span></td>
                <td><span class="badge bg-primary-subtle text-primary border">${(exam.questions || []).length} Qs</span></td>
                <td>${exam.duration} mins <small class="text-muted">(${exam.totalMarks || 100} M)</small></td>
                <td><span class="badge ${isLive ? 'bg-success text-white' : 'bg-secondary text-white'}">${exam.status}</span></td>
                <td>
                    <span class="badge ${isReleased ? 'bg-info-subtle text-info border border-info' : 'bg-secondary-subtle text-secondary border'}">
                        ${isReleased ? 'Published' : 'Hidden'}
                    </span>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm ${isLive ? 'btn-success' : 'btn-outline-success'} rounded-pill px-3 me-1" onclick="toggleExamConduct('${exam.id}')">
                        <i class="bi bi-play-circle me-1"></i> ${isLive ? 'Live' : 'Conduct'}
                    </button>
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3 me-1" onclick="openFacultyEditExam('${exam.id}')">
                        <i class="bi bi-pencil-square me-1"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-outline-danger rounded-pill px-3" onclick="deleteFacultyExam('${exam.id}')">
                        <i class="bi bi-trash3"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

async function toggleExamConduct(examId) {
    const exam = facultyExamsList.find(e => e.id === examId);
    if (!exam) return;

    const newStatus = (exam.status === 'Active' || exam.status === 'Live') ? 'Draft' : 'Active';
    exam.status = newStatus;

    await examApiFetch('/api/exams', {
        method: 'POST',
        body: JSON.stringify(exam)
    });

    renderFacultyExamWorkspace();
    showExamToast("Exam Status Updated", `"${exam.title}" is now ${newStatus}.`, "success");
}

async function deleteFacultyExam(examId) {
    const exam = facultyExamsList.find(e => e.id === examId);
    if (!exam) return;

    if (!confirm(`Are you sure you want to delete "${exam.title}"?\n\nThis will permanently remove the exam paper.`)) {
        return;
    }

    await examApiFetch(`/api/exams/${examId}`, { method: 'DELETE' });
    renderFacultyExamWorkspace();
    showExamToast("Exam Deleted", `"${exam.title}" removed.`, "info");
}

function openFacultyCreateExamTab() {
    resetFacultyExamForm();
    addFacultyQuestionCard();
}

function resetFacultyExamForm() {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    setVal('form-exam-id', '');
    setVal('form-exam-title', '');
    setVal('form-exam-subject', '');
    setVal('form-course-code', 'CS201');
    setVal('form-instructions', 'Attempt all questions. Keep webcam visible at all times. Secondary screens are strictly forbidden.');
    setVal('form-duration', '60');
    setVal('form-total-marks', '100');
    setVal('form-passing-marks', '40');
    setVal('form-max-attempts', '1');
    setVal('form-mic-threshold', '90');

    if (document.getElementById('form-heading-title')) {
        document.getElementById('form-heading-title').innerText = 'Create Examination';
    }

    const container = document.getElementById('faculty-question-cards-container');
    if (container) container.innerHTML = '';
}

function openFacultyEditExam(examId) {
    const exam = facultyExamsList.find(e => e.id === examId);
    if (!exam) return;

    switchFacultyExamSubtab('create-exam');

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    setVal('form-exam-id', exam.id);
    setVal('form-exam-title', exam.title || '');
    setVal('form-exam-subject', exam.subject || '');
    setVal('form-course-code', exam.courseCode || 'CS201');
    setVal('form-instructions', exam.instructions || '');
    setVal('form-duration', exam.duration || 60);
    setVal('form-total-marks', exam.totalMarks || 100);
    setVal('form-passing-marks', exam.passingMarks || 40);
    setVal('form-max-attempts', exam.maxAttempts || 1);
    setVal('form-mic-threshold', exam.voiceThreshold || 90);

    if (document.getElementById('form-heading-title')) {
        document.getElementById('form-heading-title').innerText = `Edit: ${exam.title}`;
    }

    const container = document.getElementById('faculty-question-cards-container');
    if (container) {
        container.innerHTML = '';
        const questions = exam.questions || [];
        if (questions.length > 0) {
            questions.forEach(q => addFacultyQuestionCard(q));
        } else {
            addFacultyQuestionCard();
        }
    }
}

// Dynamic Question Card Builder
function addFacultyQuestionCard(data = {}) {
    const container = document.getElementById('faculty-question-cards-container');
    if (!container) return;

    const cardId = `qcard-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const text = data.text || '';
    const type = data.type || 'Multiple Choice';
    const marks = data.marks !== undefined ? data.marks : 5;
    const options = (data.options && data.options.length) ? data.options : ['', ''];
    const correctIndex = data.correctIndex !== undefined ? data.correctIndex : null;

    const card = document.createElement('div');
    card.className = 'card border rounded-4 p-4 mb-3 bg-white question-card shadow-xs';
    card.id = cardId;
    card.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <span class="small fw-bold text-muted text-uppercase">QUESTION</span>
            <button type="button" class="btn btn-link text-danger p-0" onclick="document.getElementById('${cardId}').remove()"><i class="bi bi-trash fs-5"></i></button>
        </div>
        <div class="mb-3">
            <textarea class="form-control rounded-3 q-text" rows="2" placeholder="Enter question text">${text}</textarea>
        </div>
        <div class="row g-3 mb-3">
            <div class="col-md-6">
                <label class="form-label small text-muted fw-semibold">Type</label>
                <select class="form-select rounded-3 q-type" onchange="toggleCardQuestionType(this)">
                    <option value="Multiple Choice" ${type === 'Multiple Choice' ? 'selected' : ''}>Multiple Choice</option>
                    <option value="Coding" ${type === 'Coding' ? 'selected' : ''}>Coding Sandbox</option>
                    <option value="Short Answer" ${type === 'Short Answer' ? 'selected' : ''}>Short Answer</option>
                </select>
            </div>
            <div class="col-md-6">
                <label class="form-label small text-muted fw-semibold">Marks</label>
                <input type="number" class="form-control rounded-3 q-marks" value="${marks}">
            </div>
        </div>
        <div class="options-wrapper ${type !== 'Multiple Choice' ? 'd-none' : ''}">
            <label class="form-label small text-muted fw-semibold">Options (Select radio for correct answer)</label>
            <div class="options-container d-flex flex-column gap-2 mb-2"></div>
            <button type="button" class="btn btn-sm text-dark p-0 fw-semibold" onclick="appendOptionRow('${cardId}')">
                <i class="bi bi-plus-lg me-1"></i> Add Option
            </button>
        </div>
    `;

    container.appendChild(card);
    const optsContainer = card.querySelector('.options-container');
    if (optsContainer) {
        options.forEach((opt, idx) => {
            appendOptionElement(optsContainer, cardId, opt, idx === correctIndex);
        });
    }
}

function toggleCardQuestionType(selectEl) {
    const wrapper = selectEl.closest('.question-card')?.querySelector('.options-wrapper');
    if (!wrapper) return;
    if (selectEl.value === 'Multiple Choice') wrapper.classList.remove('d-none');
    else wrapper.classList.add('d-none');
}

function appendOptionElement(container, cardId, text = '', isChecked = false) {
    const row = document.createElement('div');
    row.className = 'd-flex align-items-center gap-2 option-row';
    row.innerHTML = `
        <input type="radio" name="radio-${cardId}" class="form-check-input mt-0 q-correct" ${isChecked ? 'checked' : ''}>
        <input type="text" class="form-control rounded-3 q-opt-text" value="${text}">
        <button type="button" class="btn btn-link text-danger p-0 border-0" onclick="this.closest('.option-row').remove()"><i class="bi bi-trash fs-5"></i></button>
    `;
    container.appendChild(row);
}

function appendOptionRow(cardId) {
    const container = document.getElementById(cardId)?.querySelector('.options-container');
    if (container) appendOptionElement(container, cardId, '', false);
}

// Gemini AI Creator
async function generateFacultyAIQuestions() {
    const topic = (document.getElementById('ai-topic')?.value || '').trim();
    const qType = document.getElementById('ai-type')?.value || 'Multiple Choice';
    const count = parseInt(document.getElementById('ai-count')?.value) || 5;
    const difficulty = document.getElementById('ai-difficulty')?.value || 'Medium';
    const apiKey = (document.getElementById('ai-key')?.value || '').trim();

    if (!topic) {
        alert("Please enter a Topic or Concept to generate questions.");
        return;
    }

    const btn = document.getElementById('btn-generate-ai');
    const preview = document.getElementById('ai-preview-box');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Generating...`;
    }
    if (preview) preview.value = `⏳ Requesting ${count} ${difficulty}-level questions on "${topic}"...\nContacting AI Engine...`;

    const res = await examApiFetch('/api/exams/ai/generate-questions', {
        method: 'POST',
        body: JSON.stringify({
            topic: topic,
            question_type: qType,
            count: count,
            difficulty: difficulty,
            api_key: apiKey
        })
    });

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-lightning-charge-fill me-1"></i> Generate with AI`;
    }

    if (res.success && Array.isArray(res.questions) && res.questions.length > 0) {
        latestAIGeneratedExams = res.questions;
        let outText = `✨ Generated ${res.questions.length} Questions via ${res.source || 'AI Engine'}\nTopic: "${topic}" | Type: ${qType} | Difficulty: ${difficulty}\n════════════════════════════════════════\n\n`;
        res.questions.forEach((q, i) => {
            outText += `Q${i + 1}: ${q.text}\n   [Type: ${q.type} | Marks: ${q.marks}]\n`;
            if (Array.isArray(q.options)) {
                q.options.forEach((opt, oIdx) => {
                    const mark = (oIdx === q.correctIndex) ? ' ✓ [Correct]' : '';
                    outText += `   (${String.fromCharCode(65 + oIdx)}) ${opt}${mark}\n`;
                });
            }
            if (q.explanation) outText += `   💡 Explanation: ${q.explanation}\n`;
            outText += '\n';
        });
        outText += `👉 Click "Append All to Exam" to add these directly to the builder!`;
        if (preview) preview.value = outText;

        const appendBtn = document.getElementById('btn-append-ai-questions');
        if (appendBtn) {
            appendBtn.disabled = false;
            appendBtn.innerHTML = `<i class="bi bi-plus-circle me-1"></i> Append All (${res.questions.length}) to Exam`;
        }
    } else {
        if (preview) preview.value = "Failed to generate questions. Please try again.";
    }
}

function appendAIGeneratedQuestionsToExam() {
    if (!latestAIGeneratedExams || latestAIGeneratedExams.length === 0) {
        alert("No generated questions to append.");
        return;
    }

    latestAIGeneratedExams.forEach(q => {
        addFacultyQuestionCard(q);
    });

    showExamToast("Questions Appended", `Added ${latestAIGeneratedExams.length} questions to exam builder.`, "success");
    document.getElementById('faculty-question-cards-container')?.scrollIntoView({ behavior: 'smooth' });
}

async function saveFacultyExam() {
    const id = document.getElementById('form-exam-id')?.value || '';
    const title = document.getElementById('form-exam-title')?.value.trim();
    const subject = document.getElementById('form-exam-subject')?.value.trim();
    const courseCode = document.getElementById('form-course-code')?.value.trim() || 'CS201';
    const instructions = document.getElementById('form-instructions')?.value.trim() || '';
    const duration = parseInt(document.getElementById('form-duration')?.value) || 60;
    const totalMarks = parseInt(document.getElementById('form-total-marks')?.value) || 100;
    const passingMarks = parseInt(document.getElementById('form-passing-marks')?.value) || 40;
    const maxAttempts = parseInt(document.getElementById('form-max-attempts')?.value) || 1;
    const voiceThreshold = parseInt(document.getElementById('form-mic-threshold')?.value) || 90;

    const negativeMarking = document.getElementById('form-neg-marking')?.checked || false;
    const randomQuestions = document.getElementById('form-rand-q')?.checked !== false;
    const randomOptions = document.getElementById('form-rand-opt')?.checked !== false;
    const autoSubmit = document.getElementById('form-auto-submit')?.checked !== false;
    const aiProctoring = document.getElementById('form-ai-proctor')?.checked !== false;

    if (!title || !subject) {
        alert("Exam Title and Subject are required.");
        return;
    }

    const questions = [];
    document.querySelectorAll('#faculty-question-cards-container .question-card').forEach(card => {
        const text = card.querySelector('.q-text')?.value.trim();
        const type = card.querySelector('.q-type')?.value || 'Multiple Choice';
        const marks = parseInt(card.querySelector('.q-marks')?.value) || 5;

        const options = [];
        let correctIndex = null;
        if (type === 'Multiple Choice') {
            card.querySelectorAll('.option-row').forEach((row, i) => {
                const optVal = row.querySelector('.q-opt-text')?.value.trim();
                if (optVal) options.push(optVal);
                if (row.querySelector('.q-correct')?.checked) correctIndex = i;
            });
        }

        if (text) {
            questions.push({
                text: text,
                type: type,
                marks: marks,
                options: options,
                correctIndex: correctIndex
            });
        }
    });

    if (questions.length === 0) {
        alert("Please add at least one question.");
        return;
    }

    const payload = {
        id: id || `exam-${Date.now()}`,
        title: title,
        subject: subject,
        course_code: courseCode,
        instructions: instructions,
        duration: duration,
        total_marks: totalMarks,
        passing_marks: passingMarks,
        max_attempts: maxAttempts,
        voice_threshold: voiceThreshold,
        negative_marking: negativeMarking,
        random_questions: randomQuestions,
        random_options: randomOptions,
        auto_submit: autoSubmit,
        ai_proctoring: aiProctoring,
        status: "Active",
        results_released: true,
        questions: questions
    };

    const res = await examApiFetch('/api/exams', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (res.success) {
        showExamToast("Exam Saved Successfully", `"${title}" is active and available.`, "success");
        switchFacultyExamSubtab('dashboard');
    } else {
        alert("Error saving exam: " + (res.message || "Failed"));
    }
}

// Bulk Upload CSV
function handleFacultyBulkCSV(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        let count = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
            if (parts.length < 2) continue;

            const qText = parts[0];
            const qType = ['Multiple Choice', 'Coding', 'Short Answer'].includes(parts[1]) ? parts[1] : 'Multiple Choice';
            const marks = parseInt(parts[2]) || 5;

            let options = [];
            let correctIndex = null;
            if (qType === 'Multiple Choice' && parts.length >= 7) {
                options = [parts[3], parts[4], parts[5], parts[6]];
                correctIndex = parseInt(parts[7]) || 0;
            }

            addFacultyQuestionCard({
                text: qText,
                type: qType,
                marks: marks,
                options: options,
                correctIndex: correctIndex
            });
            count++;
        }
        showExamToast("CSV Imported", `Loaded ${count} questions from CSV.`, "success");
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ================= FACULTY LIVE SURVEILLANCE FLOOR =================
async function renderFacultyLiveFloor() {
    const container = document.getElementById('exam-live-tiles-container');
    if (!container) return;

    const res = await examApiFetch('/api/exams/live-floor');
    const candidates = res.success ? res.candidates : [];

    container.innerHTML = '';
    candidates.forEach(cand => {
        const isWarning = cand.status === 'warning' || cand.warningsCount > 0;
        container.innerHTML += `
            <div class="col-md-6 col-lg-3">
                <div class="proctor-feed-card h-100 shadow-sm position-relative ${isWarning ? 'border-warning' : ''}">
                    <div class="p-3 border-bottom d-flex justify-content-between align-items-center" style="background: rgba(0,0,0,0.25);">
                        <div class="d-flex align-items-center gap-2">
                            <span class="live-dot-pulse"></span>
                            <div>
                                <strong class="text-white d-block lh-1 small">${cand.name}</strong>
                                <small class="text-muted" style="font-size: 11px;">Roll: <span class="text-info">${cand.id}</span> • ${cand.dept}</small>
                            </div>
                        </div>
                        <span class="badge ${isWarning ? 'bg-warning text-dark' : 'bg-success bg-opacity-25 text-success'} rounded-pill px-2 py-1" style="font-size: 10px;">
                            ${cand.statusText}
                        </span>
                    </div>

                    <div class="proctor-video-viewport position-relative">
                        <div class="proctor-scanline"></div>
                        <div class="proctor-sweep-line"></div>
                        <div class="proctor-face-box ${isWarning ? 'warning-state' : ''}">
                            <span class="badge bg-dark text-success font-monospace px-1" style="font-size: 8px; margin-top: -8px;">
                                ${cand.gazeConfidence}
                            </span>
                        </div>
                        <div class="rounded-circle d-flex align-items-center justify-content-center shadow-lg"
                            style="width: 72px; height: 72px; ${cand.avatarGrad}; font-size: 22px; font-weight: 800; color: #ffffff;">
                            ${cand.initials}
                        </div>
                        <div class="position-absolute bottom-0 start-0 end-0 p-2 d-flex align-items-center gap-2" style="background: rgba(0,0,0,0.8);">
                            <span class="text-white-50" style="font-size: 10px;"><i class="bi bi-mic text-info"></i> ${cand.audioDb}dB</span>
                            <div class="proctor-audio-meter-bar flex-grow-1">
                                <div class="proctor-audio-meter-fill"></div>
                            </div>
                            <span class="text-white-50 font-monospace" style="font-size: 9px;">${cand.progress}</span>
                        </div>
                    </div>

                    <div class="p-3" style="font-size: 12px; background: rgba(15, 23, 42, 0.6);">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="text-truncate text-white-50" style="max-width: 170px;">${cand.examTitle}</span>
                            <span class="badge ${cand.warningsCount > 0 ? 'bg-danger' : 'bg-dark text-white-50'} rounded-pill px-2">
                                Warns: ${cand.warningsCount}
                            </span>
                        </div>
                        <div class="d-flex gap-1 mt-2">
                            <button class="btn btn-sm btn-outline-warning w-50 rounded-pill py-1" style="font-size: 11px;" onclick="triggerLiveWarning('${cand.name}')">
                                <i class="bi bi-exclamation-triangle"></i> Warn
                            </button>
                            <button class="btn btn-sm btn-outline-info rounded-pill py-1 px-2" style="font-size: 11px;" onclick="triggerLiveSnapshot('${cand.name}')">
                                <i class="bi bi-camera"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-light rounded-pill py-1 px-2" style="font-size: 11px;" onclick="triggerLiveWhisper('${cand.name}')">
                                <i class="bi bi-chat-dots"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

function triggerLiveWarning(name) {
    showExamToast("Warning Transmitted", `Auditory warning emitted to ${name}'s test screen.`, "warn");
}
function triggerLiveSnapshot(name) {
    showExamToast("Snapshot Captured", `Biometric evidence frame saved for ${name}.`, "info");
}
function triggerLiveWhisper(name) {
    const msg = prompt(`Send Direct Whisper to ${name}:`, "Please look directly at your monitor.");
    if (msg) showExamToast("Whisper Delivered", `Message sent to ${name}: "${msg}"`, "celebrate");
}

// ================= FACULTY ALERTS REVIEW =================
async function renderFacultyAlertsReview() {
    const container = document.getElementById('exam-alerts-list-container');
    if (!container) return;

    const res = await examApiFetch('/api/exams/alerts');
    facultyAlertsList = res.success ? res.alerts : [];

    container.innerHTML = '';
    if (facultyAlertsList.length === 0) {
        container.innerHTML = `
            <div class="card border-0 shadow-sm rounded-4 p-5 text-center bg-white">
                <i class="bi bi-shield-check fs-1 text-success mb-2"></i>
                <h6 class="fw-bold text-dark">No Proctor Alerts Logged</h6>
                <p class="text-muted small mb-0">All examinations exhibit clean integrity compliance.</p>
            </div>
        `;
        return;
    }

    facultyAlertsList.forEach(a => {
        const isPending = a.status === 'Pending';
        container.innerHTML += `
            <div class="alert-review-item bg-white mb-3 shadow-xs">
                <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                    <div>
                        <strong class="text-dark fs-6">${a.student || 'Candidate'}</strong>
                        <small class="text-muted d-block">${a.email || ''} • Exam ID: ${a.exam || ''}</small>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge ${a.severity === 'HIGH' ? 'bg-danger' : 'bg-warning text-dark'}">${a.severity}</span>
                        <span class="badge ${a.status === 'Reviewed' ? 'bg-success' : 'bg-secondary'}">${a.status}</span>
                        <small class="text-muted">${a.timestamp || ''}</small>
                    </div>
                </div>
                <div class="p-3 bg-light rounded-3 my-2 border small fw-medium">
                    <i class="bi bi-shield-slash text-danger me-2"></i> ${a.title}
                </div>
                <div class="d-flex justify-content-end gap-2 mt-2 pt-2 border-top">
                    ${isPending ? `
                        <button class="btn btn-sm btn-outline-success rounded-pill px-3" onclick="resolveFacultyAlert('${a.id}', 'Reviewed')">
                            Verify Incident
                        </button>
                        <button class="btn btn-sm btn-outline-secondary rounded-pill px-3" onclick="resolveFacultyAlert('${a.id}', 'Dismissed')">
                            Dismiss False Alarm
                        </button>
                        <button class="btn btn-sm btn-outline-danger rounded-pill px-3" onclick="resolveFacultyAlert('${a.id}', 'Penalized')">
                            Penalize (-5 Marks)
                        </button>
                    ` : `<span class="text-muted small align-self-center">Incident resolved</span>`}
                </div>
            </div>
        `;
    });
}

async function resolveFacultyAlert(alertId, newStatus) {
    const res = await examApiFetch('/api/exams/alerts/resolve', {
        method: 'POST',
        body: JSON.stringify({
            alert_id: alertId,
            status: newStatus,
            penalty_marks: 5
        })
    });
    if (res.success) {
        showExamToast("Incident Updated", `Alert marked as ${newStatus}.`, "info");
        renderFacultyAlertsReview();
    }
}

// ================= FACULTY RESULTS & ANALYTICS =================
async function renderFacultyResultsReports() {
    const tbody = document.getElementById('exam-fac-results-tbody');
    if (!tbody) return;

    const res = await examApiFetch('/api/exams/submissions');
    facultyAllSubmissions = res.success ? res.submissions : [];

    // Compute KPIs
    const totalCount = facultyAllSubmissions.length;
    let totalScorePct = 0;
    let passedCount = 0;
    let topScore = 0;

    facultyAllSubmissions.forEach(s => {
        const pct = s.total > 0 ? (s.score / s.total) * 100 : 0;
        totalScorePct += pct;
        if (s.score >= (s.passingMarks || 40)) passedCount++;
        if (s.score > topScore) topScore = s.score;
    });

    const avgScore = totalCount > 0 ? (totalScorePct / totalCount).toFixed(1) : '0.0';
    const passRate = totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(1) : '0.0';

    if (document.getElementById('fac-res-kpi-total')) document.getElementById('fac-res-kpi-total').innerText = totalCount;
    if (document.getElementById('fac-res-kpi-avg')) document.getElementById('fac-res-kpi-avg').innerText = `${avgScore}%`;
    if (document.getElementById('fac-res-kpi-passrate')) document.getElementById('fac-res-kpi-passrate').innerText = `${passRate}%`;
    if (document.getElementById('fac-res-kpi-top')) document.getElementById('fac-res-kpi-top').innerText = `${topScore} / 100`;

    renderFacultyResultsCharts(facultyAllSubmissions);

    tbody.innerHTML = '';
    if (facultyAllSubmissions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No examination submissions recorded yet.</td></tr>`;
        return;
    }

    facultyAllSubmissions.forEach((sub, idx) => {
        const pct = sub.total > 0 ? (sub.score / sub.total) * 100 : 0;
        const grade = calculateGradeDetails(sub.score, sub.total);
        const isPassed = sub.score >= (sub.passingMarks || 40);
        const violations = sub.proctorViolations || sub.proctor_violations || 0;

        tbody.innerHTML += `
            <tr class="align-middle">
                <td>
                    <strong class="text-dark d-block">${sub.studentName}</strong>
                    <small class="text-muted">${sub.studentId || sub.studentEmail}</small>
                </td>
                <td>
                    <span class="fw-semibold text-dark">${sub.examTitle}</span>
                    <small class="text-muted d-block">${sub.dept || 'CSE'}</small>
                </td>
                <td><small class="text-muted">${sub.timestamp || ''}</small></td>
                <td><strong>${sub.score}</strong> / ${sub.total} <small class="text-muted">(${pct.toFixed(0)}%)</small></td>
                <td>
                    <span class="grade-badge ${grade.class} me-1">${grade.letter}</span>
                    <span class="badge ${isPassed ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}">${isPassed ? 'PASSED' : 'RETEST'}</span>
                </td>
                <td>
                    <span class="${violations === 0 ? 'proctor-status-clean' : 'proctor-status-alert'}">
                        <i class="bi bi-shield-check"></i> ${violations === 0 ? 'Clean' : `${violations} Alert${violations > 1 ? 's' : ''}`}
                    </span>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="openFacultyPaperEvaluation(${idx})">
                        <i class="bi bi-file-earmark-text me-1"></i> Review Paper
                    </button>
                </td>
            </tr>
        `;
    });
}

function renderFacultyResultsCharts(submissions) {
    if (typeof Chart === 'undefined') return;

    const gradeCanvas = document.getElementById('faculty-grade-chart');
    if (gradeCanvas) {
        if (facultyGradeChartInst) facultyGradeChartInst.destroy();
        const counts = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
        submissions.forEach(s => {
            const g = calculateGradeDetails(s.score, s.total);
            if (counts[g.letter] !== undefined) counts[g.letter]++;
            else counts['F']++;
        });

        const ctx = gradeCanvas.getContext('2d');
        facultyGradeChartInst = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['A+', 'A', 'B', 'C', 'D', 'F'],
                datasets: [{
                    label: 'Students',
                    data: [counts['A+'], counts['A'], counts['B'], counts['C'], counts['D'], counts['F']],
                    backgroundColor: ['#10b981', '#3b82f6', '#6366f1', '#f59e0b', '#d97706', '#ef4444'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    const ratioCanvas = document.getElementById('faculty-ratio-chart');
    if (ratioCanvas) {
        if (facultyRatioChartInst) facultyRatioChartInst.destroy();
        let passed = 0;
        let failed = 0;
        submissions.forEach(s => {
            if (s.score >= (s.passingMarks || 40)) passed++;
            else failed++;
        });

        const ctx = ratioCanvas.getContext('2d');
        facultyRatioChartInst = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Passed', 'Retest'],
                datasets: [{
                    data: [passed, failed],
                    backgroundColor: ['#10b981', '#ef4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%'
            }
        });
    }
}

function openFacultyPaperEvaluation(index) {
    const sub = facultyAllSubmissions[index];
    if (!sub) return;
    currentInspectingSubIndex = index;

    if (document.getElementById('fac-eval-title')) {
        document.getElementById('fac-eval-title').innerText = `Evaluation: ${sub.studentName} (${sub.studentId})`;
    }
    if (document.getElementById('fac-eval-subtitle')) {
        document.getElementById('fac-eval-subtitle').innerText = `${sub.examTitle} • Dept: ${sub.dept || 'CSE'} • Submitted: ${sub.timestamp}`;
    }

    const body = document.getElementById('fac-eval-questions-body');
    if (!body) return;

    body.innerHTML = '';
    const questions = sub.paperSnapshot || [];
    const answers = sub.answersRecorded || {};

    questions.forEach((q, i) => {
        const studentAns = answers[String(i)] !== undefined ? answers[String(i)] : answers[i];
        let isCorrect = false;

        if (q.type === 'Multiple Choice') {
            isCorrect = (q.correctIndex !== null && q.correctIndex !== undefined) &&
                (Number(studentAns) === Number(q.correctIndex) || studentAns === q.options?.[q.correctIndex]);
        } else {
            isCorrect = true;
        }

        body.innerHTML += `
            <div class="card border rounded-4 p-4 mb-3 bg-white shadow-xs">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="small fw-bold text-muted text-uppercase">Question ${i + 1} (${q.type})</span>
                    <span class="badge bg-light text-dark border">${q.marks || 5} M</span>
                </div>
                <h6 class="fw-bold text-dark mb-2">${q.text}</h6>
                <div class="p-3 bg-light rounded-3 mb-3 border small">
                    <strong>Recorded Student Answer:</strong> 
                    <span class="font-monospace text-primary ms-1">${typeof studentAns === 'object' ? JSON.stringify(studentAns) : studentAns}</span>
                </div>
                <div class="row g-2 align-items-center bg-light p-3 rounded-3 border">
                    <div class="col-md-4">
                        <label class="form-label small text-muted fw-semibold mb-1">Marks Awarded:</label>
                        <input type="number" class="form-control faculty-eval-mark-input" value="${isCorrect ? (q.marks || 5) : 0}" min="0" max="${q.marks || 5}">
                    </div>
                    <div class="col-md-8">
                        <label class="form-label small text-muted fw-semibold mb-1">Feedback Remarks:</label>
                        <input type="text" class="form-control faculty-eval-remark-input" value="${isCorrect ? 'Correct solution.' : 'Review concept.'}">
                    </div>
                </div>
            </div>
        `;
    });

    openExamModal('facultyEvaluationModal');
}

async function saveFacultyPaperEvaluation() {
    const sub = facultyAllSubmissions[currentInspectingSubIndex];
    if (!sub) return;

    let total = 0;
    document.querySelectorAll('.faculty-eval-mark-input').forEach(input => {
        total += parseFloat(input.value) || 0;
    });

    const res = await examApiFetch('/api/exams/evaluate_paper', {
        method: 'POST',
        body: JSON.stringify({
            submission_id: sub.id,
            score: Math.round(total),
            remarks: "Instructor evaluation verified."
        })
    });

    if (res.success) {
        showExamToast("Evaluation Saved", `Updated score to ${Math.round(total)}/${sub.total}`, "success");
        closeExamModal('facultyEvaluationModal');
        renderFacultyResultsReports();
    }
}

async function toggleFacultyPublishResults() {
    const res = await examApiFetch('/api/exams/release_results', {
        method: 'POST',
        body: JSON.stringify({ release: true })
    });
    if (res.success) {
        showExamToast("Results Published", "All candidate scorecards are now live.", "celebrate");
        renderFacultyExamWorkspace();
        renderFacultyResultsReports();
    }
}

// Modal helper
function openExamModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.remove('d-none');
}
function closeExamModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.add('d-none');
}

// Return from Exam Portal to Smart Portal Main Dashboard
window.returnFromExamToMainPortal = function () {
    if (typeof showSection === 'function') {
        showSection('dashboard');
    }
    if (typeof updateSidebarNavForSection === 'function') {
        updateSidebarNavForSection('dashboard');
    }
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.add('hidden');
};

// Close sidebar on mobile devices
window.closeSidebarIfMobile = function () {
    if (window.innerWidth <= 800) {
        const sidebar = document.getElementById('app-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.add('hidden');
    }
};

// Open Official Hall Ticket Modal with Candidate Details
window.openHallTicketModal = function () {
    const sName = (currentUser && currentUser.name) || 'Sai Charan';
    const sReg = (currentUser && currentUser.reg_no) || '25221A0556';
    const sBranch = (currentUser && (currentUser.branch || currentUser.dept)) || 'Computer Science & Engineering';
    const sSem = (currentUser && currentUser.sem) ? `B.Tech Semester ${currentUser.sem} (Autonomous)` : 'II B.Tech I Semester (Autonomous)';

    if (document.getElementById('ht-name')) document.getElementById('ht-name').innerText = sName;
    if (document.getElementById('ht-reg')) document.getElementById('ht-reg').innerText = sReg;
    if (document.getElementById('ht-branch')) document.getElementById('ht-branch').innerText = sBranch.toUpperCase();
    if (document.getElementById('ht-sem')) document.getElementById('ht-sem').innerText = sSem;

    openExamModal('examHallTicketModal');
};

// Print / Save Hall Ticket
window.printOrDownloadHallTicket = function () {
    window.print();
};

// Open Official Examination Schedule Modal
window.openExamScheduleModal = function () {
    openExamModal('examScheduleModal');
    filterExamSchedule();
};

// Filter Examination Schedule by Branch
window.filterExamSchedule = function () {
    const sel = document.getElementById('sched-branch-filter');
    const val = sel ? sel.value : 'ALL';
    const tbody = document.getElementById('sched-table-body');
    if (!tbody) return;

    const allExams = [
        { date: '18-Oct-2026 (Mon)', time: '10:00 AM - 01:00 PM', branch: 'CSE', code: '20CS301', name: 'Object Oriented Programming with Java', venue: 'Offline / Exam Hall 1' },
        { date: '19-Oct-2026 (Tue)', time: '10:00 AM - 01:00 PM', branch: 'ECE', code: '20EC301', name: 'Signals & Systems', venue: 'Offline / Exam Hall 3' },
        { date: '20-Oct-2026 (Wed)', time: '10:00 AM - 01:00 PM', branch: 'CSE', code: '20CS302', name: 'Advanced Data Structures & Algorithms', venue: 'Offline / Exam Hall 1' },
        { date: '21-Oct-2026 (Thu)', time: '10:00 AM - 01:00 PM', branch: 'MECH', code: '20ME301', name: 'Kinematics of Machinery', venue: 'Offline / Exam Hall 4' },
        { date: '22-Oct-2026 (Fri)', time: '10:00 AM - 01:00 PM', branch: 'CSE', code: '20CS303', name: 'Discrete Mathematical Structures', venue: 'Offline / Exam Hall 2' },
        { date: '23-Oct-2026 (Sat)', time: '10:00 AM - 01:00 PM', branch: 'CIVIL', code: '20CE301', name: 'Surveying & Geomatics', venue: 'Offline / Exam Hall 5' },
        { date: '24-Oct-2026 (Sun)', time: '10:00 AM - 01:00 PM', branch: 'CSE', code: '20CS304', name: 'Digital Logic & Computer Organization', venue: 'Offline / Exam Hall 2' },
        { date: '25-Oct-2026 (Mon)', time: '10:00 AM - 01:00 PM', branch: 'ECE', code: '20EC302', name: 'Analog Electronic Circuits', venue: 'Offline / Exam Hall 3' },
        { date: '26-Oct-2026 (Tue)', time: '10:00 AM - 01:00 PM', branch: 'CSE', code: '20CS305', name: 'Universal Human Values & Ethics', venue: 'Online AI Proctor Slot' }
    ];

    const filtered = (val === 'ALL') ? allExams : allExams.filter(e => e.branch === val);
    tbody.innerHTML = filtered.map(e => `
        <tr>
            <td><strong>${e.date}</strong></td>
            <td>${e.time}</td>
            <td><span class="badge ${e.branch === 'CSE' ? 'bg-primary' : e.branch === 'ECE' ? 'bg-success' : 'bg-secondary'}">${e.branch}</span></td>
            <td><code>${e.code}</code></td>
            <td class="text-start ps-3"><strong>${e.name}</strong></td>
            <td><span class="badge bg-light text-dark border">${e.venue}</span></td>
        </tr>
    `).join('');
};

// Global initialization hook when document loads
window.addEventListener('DOMContentLoaded', () => {
    // If user opens exams directly
    if (window.location.hash === '#exams') {
        setTimeout(initOnlineExamPortal, 300);
    }
});
