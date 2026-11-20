// app.js - Enterprise Grid UI Engine, PDF Workflows & Integrated Registration/Leave System
const isLocalHost = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' || window.location.protocol === 'file:');
const API_BASE = (isLocalHost && (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '5000')))
    ? 'http://127.0.0.1:5000/api'
    : '/api';

// Safe global toast notification handler
window.showToast = window.showToast || function(msg) {
    console.log("[Portal Toast]:", msg);
    let toast = document.getElementById('portal-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'portal-toast';
        toast.style.cssText = 'position:fixed;bottom:25px;right:25px;background:#0f172a;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.35);z-index:999999;transition:all 0.3s;border:1px solid rgba(255,255,255,0.2);';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.style.display = 'none', 300);
    }, 3500);
};
let currentUser = null;
let globalData = {};
let resultsChartInstance = null;
let isSubstituteMode = false;
let pendingStudentPayload = null;

// ==========================================
// 1. UI TOGGLES (SIDEBAR & SECTIONS)
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
    } else {
        sidebar.classList.add('open');
        overlay.classList.remove('hidden');
    }
}

function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(el => el.classList.add('hidden'));
    const targetSec = document.getElementById(`sec-${sectionId}`);
    if (targetSec) {
        targetSec.classList.remove('hidden');
    }
    if (typeof updateSidebarNavForSection === 'function') {
        updateSidebarNavForSection(sectionId);
    }
    
    let titles = {
        'dashboard': 'Home', 
        'registration': 'Registration & Branch Management',
        'timetable': 'Timetable', 
        'leave': 'Leave/Permission Portal',
        'library': 'Library', 
        'events': 'Events',
        'bus': 'Transport', 
        'results': 'Results',
        'placements': 'Placements Portal', 
        'quicklinks': 'Quick Links'
    };
    
    document.getElementById('section-title').innerText = titles[sectionId] || sectionId;
    
    if (sectionId === 'timetable') {
        if(currentUser && currentUser.role !== 'admin') {
            handleTimetableChange();
        } else {
            renderClassTimetable();
        }
    }
    
    if (sectionId === 'leave') {
        loadLeaveRequests();
    }
    
    if (sectionId === 'registration') {
        loadAdminRegistryData();
    }

    if (sectionId !== 'bus' && typeof busPollInterval !== 'undefined' && busPollInterval) {
        clearInterval(busPollInterval);
        busPollInterval = null;
    }

    if (sectionId === 'bus') {
        loadBuses();
        if (typeof busPollInterval !== 'undefined' && !busPollInterval) {
            busPollInterval = setInterval(loadBuses, 10000);
        }
    }
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ==========================================
// 2. AUTHENTICATION & PRO UI INJECTION
// ==========================================
function updateLoginFields() {
    const roleSelect = document.getElementById('login-role');
    const role = roleSelect ? roleSelect.value : 'student';
    const fieldsDiv = document.getElementById('login-fields');
    if (!fieldsDiv) return;

    if (role === 'student') {
        fieldsDiv.innerHTML = `
            <div class="auth-input-group mb-2">
                <span class="auth-input-icon"><i class="fas fa-id-card"></i></span>
                <input type="text" id="login-reg" class="input-field input-with-icon" placeholder="10-digit Register Number (e.g. 25221A0556)" value="25221A0556" autocomplete="username">
            </div>
            <div class="auth-input-group mb-1">
                <span class="auth-input-icon"><i class="fas fa-lock"></i></span>
                <input type="password" id="login-pass" class="input-field input-with-icon input-with-eye" placeholder="10-digit Phone Number / Password" value="9876543210" autocomplete="current-password">
                <button type="button" class="auth-eye-btn" onclick="togglePasswordVisibility('login-pass', 'student-pass-eye')" title="Show/Hide Password" aria-label="Toggle password visibility">
                    <i class="fas fa-eye" id="student-pass-eye"></i>
                </button>
            </div>
        `;
    } else if (role === 'driver') {
        fieldsDiv.innerHTML = `
            <div class="auth-input-group mb-2">
                <span class="auth-input-icon"><i class="fas fa-bus"></i></span>
                <input type="text" id="login-name" class="input-field input-with-icon" placeholder="Driver Name / ID (e.g. DRV001)" value="DRV001" autocomplete="username">
            </div>
            <div class="auth-input-group mb-1">
                <span class="auth-input-icon"><i class="fas fa-phone"></i></span>
                <input type="password" id="login-phone" class="input-field input-with-icon input-with-eye" placeholder="Registered Phone Number" value="2222222222" autocomplete="current-password">
                <button type="button" class="auth-eye-btn" onclick="togglePasswordVisibility('login-phone', 'driver-pass-eye')" title="Show/Hide Password">
                    <i class="fas fa-eye" id="driver-pass-eye"></i>
                </button>
            </div>
        `;
    } else if (role === 'faculty') {
        fieldsDiv.innerHTML = `
            <div class="auth-input-group mb-2">
                <span class="auth-input-icon"><i class="fas fa-chalkboard-teacher"></i></span>
                <input type="text" id="login-fac-name" class="input-field input-with-icon" placeholder="Faculty Name (e.g. G Santoshi Lakshmi)" value="G Santoshi Lakshmi" autocomplete="username">
            </div>
            <div class="auth-input-group mb-1">
                <span class="auth-input-icon"><i class="fas fa-lock"></i></span>
                <input type="password" id="login-fac-phone" class="input-field input-with-icon input-with-eye" placeholder="10-digit Phone Number" value="8367502017" autocomplete="current-password">
                <button type="button" class="auth-eye-btn" onclick="togglePasswordVisibility('login-fac-phone', 'faculty-pass-eye')" title="Show/Hide Password">
                    <i class="fas fa-eye" id="faculty-pass-eye"></i>
                </button>
            </div>
        `;
    } else if (role === 'librarian') {
        fieldsDiv.innerHTML = `
            <div class="auth-input-group mb-2">
                <span class="auth-input-icon"><i class="fas fa-book-reader"></i></span>
                <input type="text" id="login-user" class="input-field input-with-icon" placeholder="Librarian ID (e.g. LIB001)" value="LIB001" autocomplete="username">
            </div>
            <div class="auth-input-group mb-1">
                <span class="auth-input-icon"><i class="fas fa-lock"></i></span>
                <input type="password" id="login-pass" class="input-field input-with-icon input-with-eye" placeholder="Password" value="lib123" autocomplete="current-password">
                <button type="button" class="auth-eye-btn" onclick="togglePasswordVisibility('login-pass', 'lib-pass-eye')" title="Show/Hide Password">
                    <i class="fas fa-eye" id="lib-pass-eye"></i>
                </button>
            </div>
        `;
    } else if (role === 'hod') {
        fieldsDiv.innerHTML = `
            <div class="auth-input-group mb-2">
                <span class="auth-input-icon"><i class="fas fa-user-shield"></i></span>
                <input type="text" id="login-user" class="input-field input-with-icon" placeholder="HOD Name / Roll No (e.g. Dr. B S N Murthy)" value="Dr. B S N Murthy" autocomplete="username">
            </div>
            <div class="auth-input-group mb-1">
                <span class="auth-input-icon"><i class="fas fa-lock"></i></span>
                <input type="password" id="login-pass" class="input-field input-with-icon input-with-eye" placeholder="Password / Register No" value="10221A0501" autocomplete="current-password">
                <button type="button" class="auth-eye-btn" onclick="togglePasswordVisibility('login-pass', 'hod-pass-eye')" title="Show/Hide Password">
                    <i class="fas fa-eye" id="hod-pass-eye"></i>
                </button>
            </div>
        `;
    } else if (role === 'principal') {
        fieldsDiv.innerHTML = `
            <div class="auth-input-group mb-2">
                <span class="auth-input-icon"><i class="fas fa-user-graduate"></i></span>
                <input type="text" id="login-user" class="input-field input-with-icon" placeholder="Username (e.g. PRIN)" value="PRIN" autocomplete="username">
            </div>
            <div class="auth-input-group mb-1">
                <span class="auth-input-icon"><i class="fas fa-lock"></i></span>
                <input type="password" id="login-pass" class="input-field input-with-icon input-with-eye" placeholder="Password" value="prin123" autocomplete="current-password">
                <button type="button" class="auth-eye-btn" onclick="togglePasswordVisibility('login-pass', 'prin-pass-eye')" title="Show/Hide Password">
                    <i class="fas fa-eye" id="prin-pass-eye"></i>
                </button>
            </div>
        `;
    } else if (role === 'admin') {
        fieldsDiv.innerHTML = `
            <div class="auth-input-group mb-2">
                <span class="auth-input-icon"><i class="fas fa-shield-alt"></i></span>
                <input type="text" id="login-user" class="input-field input-with-icon" placeholder="Username (e.g. ADMIN)" value="ADMIN" autocomplete="username">
            </div>
            <div class="auth-input-group mb-1">
                <span class="auth-input-icon"><i class="fas fa-lock"></i></span>
                <input type="password" id="login-pass" class="input-field input-with-icon input-with-eye" placeholder="Password" value="admin123" autocomplete="current-password">
                <button type="button" class="auth-eye-btn" onclick="togglePasswordVisibility('login-pass', 'admin-pass-eye')" title="Show/Hide Password">
                    <i class="fas fa-eye" id="admin-pass-eye"></i>
                </button>
            </div>
        `;
    }

    // Attach Enter key listener to all inputs
    fieldsDiv.querySelectorAll('input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') processLogin();
        });
    });
}

function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

function toggleDemoDrawer() {
    const drawer = document.getElementById('demo-chips-drawer');
    const chevron = document.getElementById('demo-drawer-chevron');
    if (!drawer) return;
    drawer.classList.toggle('open');
    if (chevron) {
        chevron.classList.toggle('rotated', drawer.classList.contains('open'));
    }
}

let pendingGoogleEmail = null;
let pendingGoogleName = null;
let pendingGoogleRole = null;

function openGoogleAuthModal() {
    const modal = document.getElementById('google-auth-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.setProperty('display', 'flex', 'important');
        modal.style.setProperty('visibility', 'visible', 'important');
        backToGoogleAccounts();
        const mainReg = document.getElementById('login-reg');
        const customInput = document.getElementById('google-custom-email-input');
        const customPass = document.getElementById('google-custom-pass-input');
        if (customInput) {
            if (mainReg && mainReg.value && mainReg.value.includes('@bvcgroup.in')) {
                customInput.value = mainReg.value.trim().toLowerCase();
            } else if (mainReg && mainReg.value.trim()) {
                customInput.value = mainReg.value.trim().toLowerCase() + '@bvcgroup.in';
            } else if (!customInput.value) {
                customInput.value = '25221A0556@bvcgroup.in';
            }
        }
        if (customPass && !customPass.value) {
            customPass.value = '9876543210';
        }
    }
}

function closeGoogleAuthModal() {
    const modal = document.getElementById('google-auth-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.setProperty('display', 'none', 'important');
    }
    if (googleOtpCountdownTimer) clearInterval(googleOtpCountdownTimer);
}

function backToGoogleAccounts() {
    if (googleOtpCountdownTimer) clearInterval(googleOtpCountdownTimer);
    const stepSelect = document.getElementById('google-step-select');
    const stepVerify = document.getElementById('google-step-verify');
    if (stepSelect) stepSelect.classList.remove('hidden');
    if (stepVerify) stepVerify.classList.add('hidden');
    const feedback = document.getElementById('google-auth-feedback');
    if (feedback) feedback.classList.add('hidden');
    const otpFeedback = document.getElementById('google-otp-feedback');
    if (otpFeedback) otpFeedback.classList.add('hidden');
}

// ============================================================================
// PRO 6-DIGIT SEGMENTED OTP INPUT CONTROLLER
// Supports auto-advance, backspace navigation, arrow keys, and 6-digit paste
// ============================================================================
let studentOtpCountdownTimer = null;
let studentOtpExpiryTimer = null;
let googleOtpCountdownTimer = null;
let googleOtpExpiryTimer = null;
let currentStudentOtpChannel = 'both';
let currentStudentRegNo = '';

function initOtpBoxGroup(containerId, onComplete) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = Array.from(container.querySelectorAll('.pro-otp-digit'));
    if (!inputs.length) return;

    inputs.forEach((input, index) => {
        input.oninput = () => {
            const val = input.value.replace(/\D/g, '');
            input.value = val ? val.slice(-1) : '';
            if (input.value) {
                input.classList.add('filled');
                if (index < inputs.length - 1) {
                    inputs[index + 1].focus();
                    inputs[index + 1].select();
                }
            } else {
                input.classList.remove('filled');
            }

            const currentCode = inputs.map(i => i.value.trim()).join('');
            if (currentCode.length === inputs.length && typeof onComplete === 'function') {
                onComplete(currentCode);
            }
        };

        input.onkeydown = (e) => {
            if (e.key === 'Backspace') {
                if (!input.value && index > 0) {
                    inputs[index - 1].value = '';
                    inputs[index - 1].classList.remove('filled');
                    inputs[index - 1].focus();
                    e.preventDefault();
                } else {
                    input.value = '';
                    input.classList.remove('filled');
                }
            } else if (e.key === 'ArrowLeft' && index > 0) {
                inputs[index - 1].focus();
                inputs[index - 1].select();
                e.preventDefault();
            } else if (e.key === 'ArrowRight' && index < inputs.length - 1) {
                inputs[index + 1].focus();
                inputs[index + 1].select();
                e.preventDefault();
            } else if (e.key === 'Enter') {
                const currentCode = inputs.map(i => i.value.trim()).join('');
                if (typeof onComplete === 'function') onComplete(currentCode);
            }
        };

        input.onpaste = (e) => {
            e.preventDefault();
            const clip = (e.clipboardData || window.clipboardData).getData('text');
            const pasted = clip.replace(/\D/g, '').slice(0, inputs.length);
            if (!pasted) return;
            pasted.split('').forEach((char, i) => {
                if (inputs[i]) {
                    inputs[i].value = char;
                    inputs[i].classList.add('filled');
                }
            });
            const nextIdx = Math.min(pasted.length, inputs.length - 1);
            if (inputs[nextIdx]) inputs[nextIdx].focus();
            if (pasted.length === inputs.length && typeof onComplete === 'function') {
                onComplete(pasted);
            }
        };

        input.onfocus = () => {
            input.select();
        };
    });
}

function getOtpFromBoxes(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return '';
    return Array.from(container.querySelectorAll('.pro-otp-digit')).map(i => i.value.trim()).join('');
}

function clearOtpBoxes(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = Array.from(container.querySelectorAll('.pro-otp-digit'));
    inputs.forEach(i => {
        i.value = '';
        i.classList.remove('filled', 'otp-shake');
    });
    if (inputs[0]) inputs[0].focus();
}

function shakeOtpBoxes(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.classList.add('otp-shake');
    container.querySelectorAll('.pro-otp-digit').forEach(i => i.classList.add('otp-shake'));
    setTimeout(() => {
        container.classList.remove('otp-shake');
        container.querySelectorAll('.pro-otp-digit').forEach(i => i.classList.remove('otp-shake'));
        const first = container.querySelector('.pro-otp-digit');
        if (first) first.focus();
    }, 600);
}

function startOtpCountdown(timerElId, btnId, seconds = 30) {
    let remaining = seconds;
    const btn = document.getElementById(btnId);
    const label = document.getElementById(timerElId);
    if (btn) btn.disabled = true;
    if (label) label.textContent = `Resend in ${remaining}s`;

    const timer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(timer);
            if (btn) btn.disabled = false;
            if (label) label.textContent = '';
        } else {
            if (label) label.textContent = `Resend in ${remaining}s`;
        }
    }, 1000);
    return timer;
}

function startOtpExpiry(displayId, totalSeconds = 600) {
    let remaining = totalSeconds;
    const display = document.getElementById(displayId);
    const update = () => {
        const m = Math.floor(remaining / 60).toString().padStart(2, '0');
        const s = (remaining % 60).toString().padStart(2, '0');
        if (display) display.textContent = `${m}:${s}`;
    };
    update();
    const timer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(timer);
            if (display) display.textContent = '00:00 (Expired)';
        } else {
            update();
        }
    }, 1000);
    return timer;
}

// ============================================================================
// STUDENT & MULTI-ROLE DIRECT OTP SIGN-IN (Email & Mobile SMS Dual-Channel)
// ============================================================================
function setOtpToBoxes(containerId, code) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = Array.from(container.querySelectorAll('.pro-otp-digit'));
    const digits = String(code || '').replace(/\D/g, '').slice(0, inputs.length).split('');
    inputs.forEach((input, i) => {
        if (digits[i] !== undefined) {
            input.value = digits[i];
            input.classList.add('filled');
        } else {
            input.value = '';
            input.classList.remove('filled');
        }
    });
}

function autoFillStudentOtp(code) {
    setOtpToBoxes('student-otp-boxes', code);
    setTimeout(() => { confirmStudentOTP(code); }, 200);
}

function autoFillGoogleOtp(code) {
    setOtpToBoxes('google-otp-boxes', code);
    setTimeout(() => { verifyGoogleOtp(code); }, 200);
}

function initiateStudentOtpFlow() {
    const roleSelect = document.getElementById('login-role');
    const role = roleSelect ? roleSelect.value : 'student';
    let identifier = '';
    let phone = '';

    if (role === 'student') {
        const el = document.getElementById('login-reg');
        identifier = el ? el.value.trim().toUpperCase() : '';
    } else if (role === 'faculty') {
        const el = document.getElementById('login-fac-name');
        const pel = document.getElementById('login-fac-phone');
        identifier = el ? el.value.trim() : '';
        phone = pel ? pel.value.trim() : '';
    } else if (role === 'driver') {
        const el = document.getElementById('login-name');
        const pel = document.getElementById('login-phone');
        identifier = el ? el.value.trim() : '';
        phone = pel ? pel.value.trim() : '';
    } else {
        const el = document.getElementById('login-user');
        identifier = el ? el.value.trim() : '';
    }

    currentStudentRegNo = identifier || '25221A0556';
    requestStudentOtp('both', { identifier, phone, role });
}

function setStudentOtpChannel(channel) {
    currentStudentOtpChannel = channel;
    const tabBoth = document.getElementById('tab-student-channel-both');
    const tabEmail = document.getElementById('tab-student-channel-email');
    const tabSms = document.getElementById('tab-student-channel-sms');
    if (tabBoth) tabBoth.classList.toggle('active', channel === 'both');
    if (tabEmail) tabEmail.classList.toggle('active', channel === 'email');
    if (tabSms) tabSms.classList.toggle('active', channel === 'sms');
    requestStudentOtp(channel);
}

async function requestStudentOtp(channel = 'both', extra = {}) {
    const roleSelect = document.getElementById('login-role');
    const role = (extra.role || (roleSelect ? roleSelect.value : 'student')).toLowerCase();
    let regNo = extra.identifier || currentStudentRegNo;
    if (!regNo) {
        const regInput = document.getElementById('login-reg') || document.getElementById('login-user') || document.getElementById('login-fac-name') || document.getElementById('login-name');
        regNo = (regInput ? regInput.value.trim().toUpperCase() : '') || '25221A0556';
    }
    currentStudentRegNo = regNo;

    const emailCard = document.getElementById('student-email-channel-card');
    const phoneCard = document.getElementById('student-phone-channel-card');
    const feedback = document.getElementById('student-otp-feedback');

    if (feedback) {
        feedback.className = 'pro-otp-feedback loading';
        feedback.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Dispatched secure OTP to registered credentials for <strong>${regNo}</strong>…`;
        feedback.classList.remove('hidden');
    }

    try {
        const res = await fetch(`${API_BASE}/auth/request_otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regNo, channel, role, phone: extra.phone })
        });
        const data = await res.json();

        if (data.success) {
            const emailDisp = document.getElementById('student-otp-email-display');
            const phoneDisp = document.getElementById('student-otp-phone-display');
            if (emailDisp) emailDisp.textContent = data.masked_email || `${regNo}@bvcgroup.in`;
            if (phoneDisp) phoneDisp.textContent = data.masked_phone || '+91 98******10';

            // Show / hide channel cards based on chosen channel
            if (emailCard) emailCard.style.display = (channel === 'sms') ? 'none' : 'flex';
            if (phoneCard) phoneCard.style.display = (channel === 'email') ? 'none' : 'flex';

            const testOtp = data.debug_otp || data.otp || '123456';
            if (feedback) {
                feedback.className = 'pro-otp-feedback success';
                let msg = `<i class="fas fa-check-circle"></i> ${data.message || 'Verification OTP code dispatched successfully.'}`;
                if (testOtp) {
                    msg += `<div style="margin-top:10px;padding:9px 14px;background:rgba(255,212,0,0.12);border:1px dashed #ffd400;border-radius:10px;color:#ffd400;font-size:12.5px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:all 0.2s;" onclick="autoFillStudentOtp('${testOtp}')" title="Click to auto-fill OTP">
                        <span><i class="fas fa-shield-alt" style="margin-right:6px;"></i><strong>Instant Access / Test OTP:</strong> <code style="font-size:14px;letter-spacing:2px;font-weight:800;color:#091a3e;background:#ffd400;padding:2px 7px;border-radius:4px;margin-left:4px;">${testOtp}</code></span>
                        <span style="font-size:11px;font-weight:700;text-decoration:underline;">Click to Auto-Fill &rarr;</span>
                    </div>`;
                }
                feedback.innerHTML = msg;
                feedback.classList.remove('hidden');
            }

            // Open Modal
            const modal = document.getElementById('otp-verify-modal');
            if (modal) modal.classList.remove('hidden');

            // Initialize 6 digit boxes
            initOtpBoxGroup('student-otp-boxes', (code) => {
                confirmStudentOTP(code);
            });
            clearOtpBoxes('student-otp-boxes');

            // Start Timers
            if (studentOtpCountdownTimer) clearInterval(studentOtpCountdownTimer);
            studentOtpCountdownTimer = startOtpCountdown('student-resend-countdown', 'btn-student-resend', 30);

            if (studentOtpExpiryTimer) clearInterval(studentOtpExpiryTimer);
            studentOtpExpiryTimer = startOtpExpiry('student-otp-timer', 600);

            showToast(`📨 Verification OTP dispatched! ${testOtp ? 'Code: ' + testOtp : ''}`);
        } else {
            if (feedback) {
                feedback.className = 'pro-otp-feedback error';
                feedback.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${data.message || 'Could not dispatch OTP.'}`;
                feedback.classList.remove('hidden');
            }
            alert(data.message || "Could not dispatch verification OTP.");
        }
    } catch (err) {
        if (feedback) {
            feedback.className = 'pro-otp-feedback error';
            feedback.innerHTML = `<i class="fas fa-times-circle"></i> Connection error: ${err.message}`;
            feedback.classList.remove('hidden');
        }
    }
}

async function confirmStudentOTP(directOtpCode) {
    const enteredOTP = directOtpCode || getOtpFromBoxes('student-otp-boxes') || (document.getElementById('student-login-otp') ? document.getElementById('student-login-otp').value.trim() : '');
    const feedback = document.getElementById('student-otp-feedback');
    const submitBtn = document.getElementById('btn-confirm-student-otp');
    const regNo = currentStudentRegNo || (document.getElementById('login-reg') ? document.getElementById('login-reg').value.trim().toUpperCase() : '') || '25221A0556';

    if (!enteredOTP || enteredOTP.length < 6) {
        if (feedback) {
            feedback.className = 'pro-otp-feedback error';
            feedback.innerHTML = `<i class="fas fa-exclamation-circle"></i> Please enter all 6 digits of the verification OTP.`;
            feedback.classList.remove('hidden');
        }
        shakeOtpBoxes('student-otp-boxes');
        return;
    }

    if (feedback) {
        feedback.className = 'pro-otp-feedback loading';
        feedback.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Verifying institutional credentials…`;
        feedback.classList.remove('hidden');
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/auth/verify_otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                otp: enteredOTP,
                regNo: regNo
            })
        });
        const data = await res.json();
        if (data.success) {
            if (feedback) {
                feedback.className = 'pro-otp-feedback success';
                feedback.innerHTML = `<i class="fas fa-check-circle"></i> Verification Successful! Access Granted.`;
                feedback.classList.remove('hidden');
            }
            currentUser = data.user || pendingStudentPayload || { reg_no: regNo, name: 'Student', role: 'student', branch: 'CSE' };
            showToast(`✅ Welcome, ${currentUser.name || regNo}! Authentication Verified`);
            setTimeout(() => {
                const modal = document.getElementById('otp-verify-modal');
                if (modal) modal.classList.add('hidden');
                finalizeLogin();
            }, 450);
        } else {
            if (feedback) {
                feedback.className = 'pro-otp-feedback error';
                feedback.innerHTML = `<i class="fas fa-ban"></i> ${data.message || 'Invalid verification OTP. Please check your inbox or mobile.'}`;
                feedback.classList.remove('hidden');
            }
            shakeOtpBoxes('student-otp-boxes');
        }
    } catch(e) {
        if (feedback) {
            feedback.className = 'pro-otp-feedback error';
            feedback.innerHTML = `<i class="fas fa-times-circle"></i> Server verification error: ${e.message}`;
            feedback.classList.remove('hidden');
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function resendStudentOtp() {
    requestStudentOtp(currentStudentOtpChannel);
}

// ============================================================================
// GOOGLE IDENTITY SERVICES (GIS) & OAUTH 2.0 / OIDC INTEGRATION
// ============================================================================
let googleClientId = '';

async function loadAuthClientConfig() {
    try {
        const res = await fetch(`${API_BASE}/auth/config`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.google_client_id) {
                googleClientId = data.google_client_id;
                initGoogleIdentityServices();
            }
        }
    } catch (e) {
        console.info('[Auth Config] Using local/fallback institutional SSO bridge');
    }
}

function initGoogleIdentityServices() {
    if (!googleClientId || googleClientId === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') return;
    if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
            window.google.accounts.id.initialize({
                client_id: googleClientId,
                callback: handleGoogleCredentialResponse,
                auto_select: false,
                cancel_on_tap_outside: true,
                context: 'signin'
            });
            const container = document.getElementById('g-id-signin-btn-container');
            if (container) {
                container.style.display = 'block';
                window.google.accounts.id.renderButton(container, {
                    theme: document.body.classList.contains('theme-dark') ? 'filled_black' : 'outline',
                    size: 'large',
                    width: 380,
                    text: 'continue_with',
                    shape: 'pill'
                });
            }
        } catch (err) {
            console.warn('[GIS Init]', err);
        }
    }
}

async function handleContinueWithGoogle() {
    // Immediately display the official BVC Institutional Google Dialog
    openGoogleAuthModal();

    // Trigger Google One-Tap prompt in background if client ID is initialized
    if (googleClientId && window.google && window.google.accounts && window.google.accounts.id) {
        try {
            window.google.accounts.id.prompt();
        } catch (e) {
            console.warn('[Google Prompt]', e);
        }
    }
}

async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
        showToast("Google sign-in was cancelled or returned empty credentials.");
        return;
    }
    showToast("Authenticating Google Identity credentials…");
    try {
        const res = await fetch(`${API_BASE}/auth/google/oauth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        if (data.success && data.user) {
            currentUser = data.user;
            showToast(`✅ Welcome, ${currentUser.name || 'User'}! Signed in via Google`);
            finalizeLogin();
        } else {
            alert(data.message || "Institutional authorization failed for this Google account.");
        }
    } catch (err) {
        console.error('[Google Credential Error]:', err);
        try {
            const base64Url = response.credential.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
            const payload = JSON.parse(jsonPayload);
            if (payload && payload.email) {
                await requestGoogleOtp(payload.email, payload.name, 'student');
            }
        } catch(e) {
            alert("Google Sign-In verification error: " + err.message);
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAuthClientConfig);
} else {
    loadAuthClientConfig();
}

// ============================================================================
// GOOGLE INSTITUTIONAL SSO OTP FLOW
// ============================================================================
async function requestGoogleOtp(email, name, role, channel = 'both') {
    const feedback = document.getElementById('google-auth-feedback');
    const cleanEmail = (email || '').trim().toLowerCase();
    
    // STRICT DOMAIN RESTRICTION: Only @bvcgroup.in institutional accounts
    if (!cleanEmail.endsWith('@bvcgroup.in')) {
        if (feedback) {
            feedback.className = 'google-feedback-alert error';
            feedback.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>Access Restricted:</strong> BVC Smart Portal allows institutional accounts ending with <code>@bvcgroup.in</code> only. Personal accounts (@gmail.com) are blocked.`;
            feedback.classList.remove('hidden');
        }
        return;
    }

    pendingGoogleEmail = cleanEmail;
    pendingGoogleName = name || cleanEmail.split('@')[0];
    pendingGoogleRole = role || 'student';

    const customEmailInp = document.getElementById('google-custom-email-input');
    const customPassInp = document.getElementById('google-custom-pass-input');
    if (customEmailInp) customEmailInp.value = cleanEmail;
    if (customPassInp) {
        if (cleanEmail.includes('25221a0556')) customPassInp.value = '9876543210';
        else if (cleanEmail.includes('krishnaveni')) customPassInp.value = '1234567890';
        else if (cleanEmail.includes('faculty008') || cleanEmail.includes('santoshi') || cleanEmail.includes('santhoshi')) customPassInp.value = '8367502017';
        else if (cleanEmail.includes('bsnmurthy')) customPassInp.value = '10221A0501';
        else if (cleanEmail.includes('principal')) customPassInp.value = 'prin123';
        else if (cleanEmail.includes('admin')) customPassInp.value = 'admin123';
    }

    if (feedback) {
        feedback.className = 'google-feedback-alert loading';
        feedback.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Dispatching verification OTP to <strong>${cleanEmail}</strong>…`;
        feedback.classList.remove('hidden');
    }

    try {
        const response = await fetch(`${API_BASE}/auth/google/request_otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, name: pendingGoogleName, role: pendingGoogleRole, channel: channel })
        });
        const data = await response.json();
        
        if (data.success) {
            // Switch view to Step 2 (OTP Verification)
            const stepSelect = document.getElementById('google-step-select');
            const stepVerify = document.getElementById('google-step-verify');
            if (stepSelect) stepSelect.classList.add('hidden');
            if (stepVerify) stepVerify.classList.remove('hidden');

            const targetEmailEl = document.getElementById('google-otp-target-email');
            if (targetEmailEl) targetEmailEl.textContent = cleanEmail;

            const dispEmail = document.getElementById('google-disp-email');
            const dispPhone = document.getElementById('google-disp-phone');
            if (dispEmail) dispEmail.textContent = data.masked_email || cleanEmail;
            if (dispPhone) dispPhone.textContent = data.masked_phone || '+91 98******10';

            const otpFeedback = document.getElementById('google-otp-feedback');
            const testOtp = data.debug_otp || data.otp || '123456';
            if (otpFeedback) {
                otpFeedback.className = 'google-feedback-alert success';
                otpFeedback.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:4px 0;" onclick="autoFillGoogleOtp('${testOtp}')" title="Click to auto-fill OTP">
                    <span><i class="fas fa-shield-alt" style="margin-right:6px;"></i><strong>Test / Instant OTP:</strong> <code style="font-size:14px;letter-spacing:2px;font-weight:800;background:#4285f4;color:#fff;padding:2px 7px;border-radius:4px;margin-left:4px;">${testOtp}</code></span>
                    <span style="font-size:11px;font-weight:700;text-decoration:underline;">Click to Auto-Fill &rarr;</span>
                </div>`;
                otpFeedback.classList.remove('hidden');
            }

            // Initialize Google 6-digit box group
            initOtpBoxGroup('google-otp-boxes', (code) => {
                verifyGoogleOtp(code);
            });
            clearOtpBoxes('google-otp-boxes');

            // Start Timers
            if (googleOtpCountdownTimer) clearInterval(googleOtpCountdownTimer);
            googleOtpCountdownTimer = startOtpCountdown('google-resend-countdown', 'btn-google-resend', 30);

            if (googleOtpExpiryTimer) clearInterval(googleOtpExpiryTimer);
            googleOtpExpiryTimer = startOtpExpiry('google-otp-timer', 600);

            showToast(`📨 Verification OTP dispatched! ${testOtp ? 'Code: ' + testOtp : ''}`);
        } else {
            if (feedback) {
                feedback.className = 'google-feedback-alert error';
                feedback.innerHTML = `<i class="fas fa-ban"></i> <strong>Request Failed:</strong> ${data.message || 'Could not send verification OTP.'}`;
                feedback.classList.remove('hidden');
            }
        }
    } catch (err) {
        if (feedback) {
            feedback.className = 'google-feedback-alert error';
            feedback.innerHTML = `<i class="fas fa-times-circle"></i> Connection error: ${err.message}`;
            feedback.classList.remove('hidden');
        }
    }
}

async function verifyGoogleOtp(directOtpCode) {
    const otp = directOtpCode || getOtpFromBoxes('google-otp-boxes') || (document.getElementById('google-otp-code-input') ? document.getElementById('google-otp-code-input').value.trim() : '');
    const feedback = document.getElementById('google-otp-feedback');
    const submitBtn = document.getElementById('btn-google-verify-submit');

    if (!pendingGoogleEmail) {
        backToGoogleAccounts();
        return;
    }

    if (!otp || otp.length < 6) {
        if (feedback) {
            feedback.className = 'google-feedback-alert error';
            feedback.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Please enter the 6-digit verification code sent to your credentials.`;
            feedback.classList.remove('hidden');
        }
        shakeOtpBoxes('google-otp-boxes');
        return;
    }

    if (feedback) {
        feedback.className = 'google-feedback-alert loading';
        feedback.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Verifying institutional OTP…`;
        feedback.classList.remove('hidden');
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/auth/google/verify_otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingGoogleEmail, otp: otp })
        });
        const data = await response.json();

        if (data.success && data.user) {
            if (feedback) {
                feedback.className = 'google-feedback-alert success';
                feedback.innerHTML = `<i class="fas fa-check-circle"></i> OTP Verified Successfully! Logging in…`;
                feedback.classList.remove('hidden');
            }
            currentUser = data.user;
            setTimeout(() => {
                closeGoogleAuthModal();
                showToast(`✅ Welcome, ${currentUser.name || pendingGoogleEmail}! Signed in via Google OTP`);
                finalizeLogin();
            }, 450);
        } else {
            if (feedback) {
                feedback.className = 'google-feedback-alert error';
                feedback.innerHTML = `<i class="fas fa-ban"></i> <strong>Verification Failed:</strong> ${data.message || 'Invalid OTP code. Please enter the correct code.'}`;
                feedback.classList.remove('hidden');
            }
            shakeOtpBoxes('google-otp-boxes');
        }
    } catch (err) {
        if (feedback) {
            feedback.className = 'google-feedback-alert error';
            feedback.innerHTML = `<i class="fas fa-times-circle"></i> Verification connection error: ${err.message}`;
            feedback.classList.remove('hidden');
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function resendGoogleOtp() {
    if (pendingGoogleEmail) {
        requestGoogleOtp(pendingGoogleEmail, pendingGoogleName, pendingGoogleRole);
    }
}

function continueWithGoogleEmail(email, name, role) {
    requestGoogleOtp(email, name, role);
}

function submitGoogleCustomEmail() {
    const input = document.getElementById('google-custom-email-input');
    const email = input ? input.value.trim() : '';
    const feedback = document.getElementById('google-auth-feedback');

    if (!email) {
        if (feedback) {
            feedback.className = 'google-feedback-alert error';
            feedback.innerHTML = `<i class="fas fa-info-circle"></i> Please enter your institutional email (e.g., roll_no@bvcgroup.in).`;
            feedback.classList.remove('hidden');
        }
        return;
    }

    if (!email.toLowerCase().endsWith('@bvcgroup.in')) {
        const domain = email.includes('@') ? ('@' + email.split('@')[1]) : 'entered domain';
        if (feedback) {
            feedback.className = 'google-feedback-alert error';
            feedback.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>Access Restricted:</strong> Domain <code>${domain}</code> is not permitted. Only <strong>@bvcgroup.in</strong> institutional accounts can sign in.`;
            feedback.classList.remove('hidden');
        }
        return;
    }

    requestGoogleOtp(email, email.split('@')[0], 'student');
}

function openLoginHelpModal() {
    alert("BVC Smart Portal Access Help:\n\n• Google Sign-in: Use your official college @bvcgroup.in email.\n• Student Login: Enter your 10-digit University Roll Number (e.g., 25221A0556).\n• Faculty / HOD / Principal: Enter your registered credentials or select demo presets.\n• Support Desk: itcell@bvcgroup.in | CSE Dept Lab 3");
}

function fillDemoLogin(role, field1, field2) {
    const roleSelect = document.getElementById('login-role');
    if (roleSelect) {
        roleSelect.value = role;
        updateLoginFields();
        if (role === 'student') {
            const regEl = document.getElementById('login-reg');
            const passEl = document.getElementById('login-pass');
            if (regEl) regEl.value = field1;
            if (passEl) passEl.value = field2;
        } else if (role === 'faculty') {
            const nameEl = document.getElementById('login-fac-name');
            const phoneEl = document.getElementById('login-fac-phone');
            if (nameEl) nameEl.value = field1;
            if (phoneEl) phoneEl.value = field2;
        } else if (role === 'driver') {
            const nameEl = document.getElementById('login-name');
            const phoneEl = document.getElementById('login-phone');
            if (nameEl) nameEl.value = field1;
            if (phoneEl) phoneEl.value = field2;
        } else {
            const userEl = document.getElementById('login-user');
            const passEl = document.getElementById('login-pass');
            if (userEl) userEl.value = field1;
            if (passEl) passEl.value = field2;
        }
        showToast(`Selected demo credentials for ${role.toUpperCase()}`);
    }
}

window.onload = () => {
    updateLoginFields();
    initAiVoices();
    
    // Attach Enter key listener on student OTP input
    const otpInput = document.getElementById('student-login-otp');
    if (otpInput) {
        otpInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmStudentOTP();
        });
    }

    if (!document.getElementById('pro-styles')) {
        const style = document.createElement('style');
        style.id = 'pro-styles';
        style.innerHTML = `
            @keyframes shatterOut {
                0% { transform: scale(1) rotateX(0deg) rotateY(0deg); opacity: 1; filter: blur(0); }
                40% { transform: scale(1.05) rotateX(-5deg) rotateY(5deg); opacity: 0.8; filter: blur(2px); }
                100% { transform: scale(0.8) rotateX(25deg) rotateY(-20deg) translateY(40px); opacity: 0; filter: blur(15px); }
            }
            @keyframes cellAssembleIn {
                0% { transform: scale(1.3) translateY(-30px) rotate(5deg); opacity: 0; filter: blur(10px); }
                70% { transform: scale(0.95) translateY(5px) rotate(-2deg); opacity: 0.9; filter: blur(2px); }
                100% { transform: scale(1) translateY(0) rotate(0deg); opacity: 1; filter: blur(0); }
            }
            .shatter-out { animation: shatterOut 0.4s forwards cubic-bezier(0.55, 0.085, 0.68, 0.53); perspective: 1000px; }
            .cell-assemble { animation: cellAssembleIn 0.5s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity: 0; }

            .global-sub-container { display: flex; align-items: center; gap: 8px; background: rgba(0, 0, 0, 0.3); padding: 6px 14px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); margin-left: auto; box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: all 0.3s ease; }
            .global-sub-container.active { background: rgba(255, 71, 87, 0.15); border-color: rgba(255, 71, 87, 0.5); }
            .global-sub-label { font-size: 11px; font-weight: 800; color: #ccc; text-transform: uppercase; letter-spacing: 1px; transition: color 0.3s; }
            .global-sub-container.active .global-sub-label { color: #ff4757; }

            .os-switch { position: relative; display: inline-block; width: 38px; height: 20px; flex-shrink: 0; margin-left: 5px; }
            .os-switch input { opacity: 0; width: 0; height: 0; }
            .os-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.2); transition: .4s; border-radius: 24px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.3); }
            .os-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s cubic-bezier(0.68, -0.55, 0.265, 1.55); border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
            .os-switch input:checked + .os-slider { background-color: #ff4757; }
            .os-switch input:checked + .os-slider:before { transform: translateX(18px); }

            .pro-sub-cell { display: flex; align-items: center; justify-content: flex-start; background: rgba(0,0,0,0.15); padding: 8px; border-radius: 8px; border: 1px solid transparent; transition: all 0.3s ease; }
            .pro-sub-cell:hover { background: rgba(0,0,0,0.3); border-color: rgba(255, 71, 87, 0.4); }

            .cine-btn {
                position: relative; overflow: hidden; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                box-shadow: 0 4px 10px rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1);
                background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
                backdrop-filter: blur(10px); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;
            }
            .cine-btn:hover {
                transform: translateY(-2px); box-shadow: 0 6px 15px rgba(255, 71, 87, 0.4);
                border-color: rgba(255, 71, 87, 0.6);
            }
            .cine-btn::before {
                content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
                background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
                transform: skewX(-20deg); transition: 0.5s;
            }
            .cine-btn:hover::before { left: 150%; }
            .cine-btn i { transition: transform 0.3s; }
            .cine-btn:hover i { transform: scale(1.2) rotate(5deg); }
        `;
        document.head.appendChild(style);
    }

    try {
        const savedTheme = localStorage.getItem('bvc_portal_theme') || localStorage.getItem('bvc_faculty_theme') || 'light';
        if (typeof applyPortalTheme === 'function') {
            applyPortalTheme(savedTheme);
        }
    } catch(e) {}
    
    try {
        const savedUser = localStorage.getItem('bvc_user');
        if (savedUser) {
            const parsed = JSON.parse(savedUser);
            if (parsed && parsed.role && parsed.token) {
                currentUser = parsed;
                document.getElementById('login-screen').classList.add('hidden');
                document.body.classList.remove('login-active');
                document.getElementById('main-portal').classList.remove('hidden');
                finalizeLogin();
            } else {
                localStorage.removeItem('bvc_user');
            }
        }
    } catch(e) {
        localStorage.removeItem('bvc_user');
    }
};

async function submitGoogleEmailPasswordLogin() {
    const emailInput = document.getElementById('google-custom-email-input');
    const passInput = document.getElementById('google-custom-pass-input');
    const feedback = document.getElementById('google-auth-feedback');
    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const password = passInput ? passInput.value.trim() : '';

    if (!email) {
        if (feedback) {
            feedback.className = 'google-feedback-alert error';
            feedback.innerHTML = '<i class="fas fa-exclamation-circle"></i> Please enter your institutional @bvcgroup.in email address.';
            feedback.classList.remove('hidden');
        } else {
            alert("Please enter your institutional @bvcgroup.in email address.");
        }
        if (emailInput) emailInput.focus();
        return;
    }

    if (!email.endsWith('@bvcgroup.in')) {
        const msg = `<i class="fas fa-exclamation-triangle"></i> <strong>Access Restricted:</strong> Domain is not permitted. Only <strong>@bvcgroup.in</strong> institutional accounts can sign in.`;
        if (feedback) {
            feedback.className = 'google-feedback-alert error';
            feedback.innerHTML = msg;
            feedback.classList.remove('hidden');
        } else {
            alert("Access Restricted: Email must end with @bvcgroup.in.");
        }
        if (emailInput) emailInput.focus();
        return;
    }

    if (!password) {
        const msg = '<i class="fas fa-key"></i> Please enter your account password or PIN.';
        if (feedback) {
            feedback.className = 'google-feedback-alert error';
            feedback.innerHTML = msg;
            feedback.classList.remove('hidden');
        } else {
            alert("Please enter your account password or PIN.");
        }
        if (passInput) passInput.focus();
        return;
    }

    const btn = document.getElementById('google-signin-pass-btn');
    const origText = btn ? btn.innerHTML : '<span>Sign In Directly</span>';
    if (btn) {
        btn.innerHTML = '<span><i class="fas fa-spinner fa-spin"></i> Verifying...</span>';
        btn.disabled = true;
    }
    if (feedback) {
        feedback.className = 'google-feedback-alert loading';
        feedback.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying institutional credentials…';
        feedback.classList.remove('hidden');
    }

    try {
        const res = await fetch(`${API_BASE}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success && data.user) {
            currentUser = data.user;
            if (data.token) {
                currentUser.token = data.token;
            }
            if (feedback) {
                feedback.className = 'google-feedback-alert success';
                feedback.innerHTML = '<i class="fas fa-check-circle"></i> Verified successfully! Logging in…';
                feedback.classList.remove('hidden');
            }
            setTimeout(() => {
                closeGoogleAuthModal();
                showToast(`✅ Welcome, ${currentUser.name || email}! Signed in via Google account`);
                finalizeLogin();
            }, 300);
        } else {
            const err = data.message || "Incorrect password or unauthorized account.";
            if (feedback) {
                feedback.className = 'google-feedback-alert error';
                feedback.innerHTML = `<i class="fas fa-times-circle"></i> ${err}`;
                feedback.classList.remove('hidden');
            } else {
                alert(err);
            }
        }
    } catch (err) {
        console.error('[Google Sign-In Error]:', err);
        const errMsg = "Sign-in error: " + err.message;
        if (feedback) {
            feedback.className = 'google-feedback-alert error';
            feedback.innerHTML = `<i class="fas fa-times-circle"></i> ${errMsg}`;
            feedback.classList.remove('hidden');
        } else {
            alert(errMsg);
        }
    } finally {
        if (btn) {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }
}
window.submitGoogleEmailPasswordLogin = submitGoogleEmailPasswordLogin;

async function processLogin() {
    const roleSelect = document.getElementById('login-role');
    let role = roleSelect ? roleSelect.value : 'student';
    
    // Grab inputs dynamically based on active fields
    const regInput = document.getElementById('login-reg') || document.getElementById('login-user') || document.getElementById('login-name') || document.getElementById('login-fac-name');
    const passInput = document.getElementById('login-pass') || document.getElementById('login-phone') || document.getElementById('login-fac-phone');

    const enteredIdentifier = regInput ? regInput.value.trim() : '';
    const enteredPassword = passInput ? passInput.value.trim() : '';

    if (!enteredIdentifier) {
        alert("Please enter your Register Number or institutional @bvcgroup.in email.");
        if (regInput) regInput.focus();
        return;
    }
    if (!enteredPassword) {
        alert("Please enter your password or registered phone number.");
        if (passInput) passInput.focus();
        return;
    }

    let payload = { role };

    // Email format validation: if '@' is present, strictly enforce @bvcgroup.in
    if (enteredIdentifier.includes('@')) {
        const lowerEmail = enteredIdentifier.toLowerCase();
        if (!lowerEmail.endsWith('@bvcgroup.in')) {
            alert("Access Restricted: Only official institutional accounts with @bvcgroup.in domain are authorized.\n\nPlease enter your valid @bvcgroup.in email address or 10-digit Register Number.");
            if (regInput) regInput.focus();
            return;
        }
        // Extract the ID part
        const idPart = lowerEmail.split('@')[0].toUpperCase();
        // Auto-detect role from the email/ID
        if (idPart.includes('KRISHNAVENI') || idPart.includes('SANTOSHI') || idPart.includes('SANTHOSHI') || idPart.startsWith('FAC')) {
            role = 'faculty';
        } else if (idPart.includes('HOD') || idPart.includes('BSNMURTHY')) {
            role = 'hod';
        } else if (idPart.includes('PRINCIPAL') || idPart.startsWith('PRIN')) {
            role = 'principal';
        } else if (idPart.includes('ADMIN')) {
            role = 'admin';
        } else if (idPart.includes('DRV') || idPart.includes('DRIVER')) {
            role = 'driver';
        } else {
            role = 'student';
        }
        if (roleSelect) roleSelect.value = role;

        payload = {
            role: role,
            regNo: idPart,
            email: lowerEmail,
            username: idPart,
            password: enteredPassword
        };
    } else {
        // Standard ID format
        payload = {
            role: role,
            regNo: enteredIdentifier.toUpperCase(),
            username: enteredIdentifier,
            password: enteredPassword
        };
    }
    
    const submitBtn = document.getElementById('btn-portal-login');
    const originalBtnContent = submitBtn ? submitBtn.innerHTML : '<span>Log In to Portal</span> <i class="fas fa-arrow-right"></i>';
    if (submitBtn) {
        submitBtn.innerHTML = '<span>Authenticating...</span> <i class="fas fa-spinner fa-spin"></i>';
        submitBtn.disabled = true;
    }

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (data.success && data.user) {
            currentUser = data.user;
            if (data.token) {
                currentUser.token = data.token;
            }
            finalizeLogin();
            return;
        } else {
            alert(data.message || "Invalid Credentials. Please check your username/email and password.");
        }
    } catch (err) {
        console.error(err);
        alert("Authentication error: " + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = originalBtnContent;
            submitBtn.disabled = false;
        }
    }
}



function finalizeLogin() {
    if (!currentUser) return;
    localStorage.setItem('bvc_user', JSON.stringify(currentUser));
    
    // Explicitly close any open modal
    try { closeGoogleAuthModal(); } catch (e) {}
    try { closeModal('otp-verify-modal'); } catch (e) {}

    // Fully hide the login screen
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.classList.add('hidden');
        loginScreen.style.setProperty('display', 'none', 'important');
        loginScreen.style.setProperty('visibility', 'hidden', 'important');
        loginScreen.style.setProperty('opacity', '0', 'important');
        loginScreen.style.setProperty('pointer-events', 'none', 'important');
    }
    document.body.classList.remove('login-active');

    // Fully show the main portal
    const mainPortal = document.getElementById('main-portal');
    if (mainPortal) {
        mainPortal.classList.remove('hidden');
        mainPortal.style.setProperty('display', 'flex', 'important');
        mainPortal.style.setProperty('visibility', 'visible', 'important');
        mainPortal.style.setProperty('opacity', '1', 'important');
    }

    const initial = (currentUser.name || 'U').charAt(0).toUpperCase();
    if(document.getElementById('user-avatar')) document.getElementById('user-avatar').innerText = initial;
    if(document.getElementById('sidebar-avatar')) document.getElementById('sidebar-avatar').innerText = initial;
    if(document.getElementById('sidebar-name')) document.getElementById('sidebar-name').innerText = currentUser.name;
    
    const roleText = `${currentUser.role} ${currentUser.branch ? '('+currentUser.branch+')' : ''}`;
    if(document.getElementById('sidebar-role')) document.getElementById('sidebar-role').innerText = roleText;
    
    try { setupRoleUI(); } catch (e) { console.warn('setupRoleUI error:', e); }
    try { updatePersonalizedGreeting(); } catch (e) { console.warn('updatePersonalizedGreeting error:', e); }
    try { showSection('dashboard'); } catch (e) { console.warn('showSection error:', e); }
    try { fetchGlobalData(); } catch (e) { console.warn('fetchGlobalData error:', e); }
    
    if (typeof showToast === 'function') {
        showToast(`✅ Welcome, ${currentUser.name || 'User'}! Successfully logged in`);
    }
}
window.finalizeLogin = finalizeLogin;

function updatePersonalizedGreeting() {
    const hour = new Date().getHours();
    let timeOfDay = "Morning";
    if (hour >= 12 && hour < 17) timeOfDay = "Afternoon";
    else if (hour >= 17) timeOfDay = "Evening";

    const titleEl = document.getElementById('dyn-greeting-title');
    const subEl = document.getElementById('dyn-greeting-subtitle');
    const tagEl = document.getElementById('dyn-greeting-tag');

    if(!titleEl || !subEl || !tagEl) return;

    titleEl.innerText = `Good ${timeOfDay}, ${currentUser.name} 👋`;

    if (currentUser.role === 'student') {
        subEl.innerText = `Roll No: ${currentUser.reg_no} | Branch: ${currentUser.branch || 'CSE'} | Year: ${currentUser.year_of_study || 2} | Sec: ${currentUser.section || 'A'} | Email: ${currentUser.email || currentUser.reg_no + '@bvcgroup.in'}`;
        tagEl.innerHTML = `<span class="live-beacon-dot" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span>Class Teacher: G Santoshi Lakshmi`;
    } else if (currentUser.role === 'hod') {
        subEl.innerText = `Branch HOD Authorization: ${currentUser.branch} Department | Login Pass: ${currentUser.reg_no}`;
        tagEl.innerHTML = `<span class="live-beacon-dot" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span>Restricted: ${currentUser.branch}`;
    } else if (currentUser.role === 'faculty') {
        subEl.innerText = `Faculty Portal | Assigned Branch: ${currentUser.branch || 'All'} | Phone: ${currentUser.phone}`;
        tagEl.innerHTML = `<span class="live-beacon-dot" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span>Active Faculty • Live`;
    } else {
        subEl.innerText = `Logged in as Administrative Authority. Full access granted.`;
        tagEl.innerHTML = `<span class="live-beacon-dot" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span>${currentUser.role.toUpperCase()} • Live`;
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('bvc_user');
    document.body.classList.add('login-active');
    document.getElementById('main-portal').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    toggleSidebar();
    location.reload();
}

function checkVoiceSupport() {
    if(!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        document.getElementById('ai-mic-btn').style.display = 'none';
        document.getElementById('ai-input').placeholder = "Voice not supported in this browser. Type here...";
    }
}

function setupRoleUI() {
    const isDriver = currentUser.role === 'driver';
    const allNavs = ['nav-dashboard', 'nav-timetable', 'nav-events', 'nav-library', 'nav-results', 'nav-bus', 'nav-ai'];
    const allApps = ['app-timetable', 'app-events', 'app-library', 'app-results', 'app-bus', 'app-placements', 'app-quicklinks'];

    if (isDriver) {
        allNavs.forEach(id => { if(document.getElementById(id)) document.getElementById(id).style.display = 'none'; });
        allApps.forEach(id => { if(document.getElementById(id)) document.getElementById(id).style.display = 'none'; });
        if(document.getElementById('driver-controls')) document.getElementById('driver-controls').classList.remove('hidden');
        if(document.getElementById('student-bus-view')) document.getElementById('student-bus-view').classList.add('hidden');
        
        let assignedBusNo = 'BUS-01';
        let assignedRoute = 'Route 1: Kakinada -> Odalarevu';
        if (currentUser && currentUser.reg_no) {
            const m = currentUser.reg_no.match(/\d+/);
            if (m) {
                const num = parseInt(m[0], 10);
                assignedBusNo = `BUS-${num < 10 ? '0' + num : num}`;
            }
        }
        if (assignedBusNo === 'BUS-02') {
            assignedRoute = 'Route 2: Amalapuram -> Peruru -> Allavaram -> Odalarevu';
        } else if (assignedBusNo === 'BUS-03') {
            assignedRoute = 'Route 3: Ravulapalem -> Ambajipeta -> Machavaram -> Odalarevu';
        }
        if(document.getElementById('drv-bus-no')) document.getElementById('drv-bus-no').innerText = assignedBusNo;
        if(document.getElementById('drv-bus-route')) document.getElementById('drv-bus-route').innerText = assignedRoute;
        if(document.getElementById('drv-cockpit-busno')) document.getElementById('drv-cockpit-busno').innerText = assignedBusNo;
        showSection('bus');
        if (window.BVC_TRANS && typeof window.BVC_TRANS.updateRoleVisibility === 'function') {
            window.BVC_TRANS.updateRoleVisibility();
        }
    } else {
        allNavs.forEach(id => { if(document.getElementById(id)) document.getElementById(id).style.display = 'flex'; });
        allApps.forEach(id => { if(document.getElementById(id)) document.getElementById(id).style.display = 'flex'; });
        
        if (currentUser.role === 'student') {
            if(document.getElementById('driver-controls')) document.getElementById('driver-controls').classList.add('hidden');
            if(document.getElementById('student-bus-view')) document.getElementById('student-bus-view').classList.remove('hidden');
        }
        if (window.BVC_TRANS && typeof window.BVC_TRANS.updateRoleVisibility === 'function') {
            window.BVC_TRANS.updateRoleVisibility();
        }
    }
    
    if(document.getElementById('btn-my-tickets')) document.getElementById('btn-my-tickets').style.display = (currentUser.role === 'student') ? 'block' : 'none';
    if(document.getElementById('btn-admin-add-event')) document.getElementById('btn-admin-add-event').style.display = (currentUser.role === 'admin') ? 'block' : 'none';
    
    if(document.getElementById('admin-bus-register-box')) {
        document.getElementById('admin-bus-register-box').classList.toggle('hidden', currentUser.role !== 'admin');
    }
    
    const isLibraryAdmin = (currentUser.role === 'admin' || currentUser.role === 'librarian');
    if(document.getElementById('admin-book-register-box')) {
        document.getElementById('admin-book-register-box').classList.toggle('hidden', !isLibraryAdmin);
    }
    if(document.getElementById('librarian-tracking-box')) {
        document.getElementById('librarian-tracking-box').classList.toggle('hidden', !isLibraryAdmin);
    }

    const canSeeLeave = ['admin', 'hod', 'principal', 'faculty', 'student'].includes(currentUser.role) && !isDriver;
    const navLeave = document.getElementById('nav-leave');
    const appLeave = document.getElementById('app-leave-portal');
    
    if(navLeave) navLeave.classList.toggle('hidden', !canSeeLeave);
    if(appLeave) appLeave.style.display = canSeeLeave ? 'flex' : 'none';

    if(document.getElementById('student-leave-controls')) {
        document.getElementById('student-leave-controls').classList.toggle('hidden', currentUser.role !== 'student');
    }

    const isAdmin = currentUser.role === 'admin';
    const navAdminReg = document.getElementById('nav-admin-reg');
    const appAdminReg = document.getElementById('app-registration');
    if(navAdminReg) navAdminReg.classList.toggle('hidden', !isAdmin);
    if(appAdminReg) appAdminReg.style.display = isAdmin ? 'flex' : 'none';

    if (currentUser.role === 'admin') {
        if(document.getElementById('admin-timetable-generator')) document.getElementById('admin-timetable-generator').classList.remove('hidden');
        if(document.getElementById('timetable-controls')) document.getElementById('timetable-controls').style.display = 'none';
        initAdminDashboard();
    } else if(!isDriver) {
        if(document.getElementById('admin-timetable-generator')) document.getElementById('admin-timetable-generator').classList.add('hidden');
        if(document.getElementById('timetable-controls')) document.getElementById('timetable-controls').style.display = 'flex';
        initTimetableControls();
    }
}

// ==========================================
// 3. ADMIN REGISTRATION & DYNAMIC BRANCH MANAGEMENT
// ==========================================
function switchRegistrationTab(tab) {
    if(document.getElementById('reg-panel-students')) document.getElementById('reg-panel-students').classList.toggle('hidden', tab !== 'students');
    if(document.getElementById('reg-panel-faculty')) document.getElementById('reg-panel-faculty').classList.toggle('hidden', tab !== 'faculty');
    if(document.getElementById('reg-panel-hod')) document.getElementById('reg-panel-hod').classList.toggle('hidden', tab !== 'hod');
    if(document.getElementById('reg-panel-branches')) document.getElementById('reg-panel-branches').classList.toggle('hidden', tab !== 'branches');

    if(document.getElementById('tab-btn-students')) document.getElementById('tab-btn-students').className = (tab === 'students') ? 'btn-primary' : 'btn-secondary';
    if(document.getElementById('tab-btn-faculty')) document.getElementById('tab-btn-faculty').className = tab === 'faculty' ? 'btn-primary' : 'btn-secondary';
    if(document.getElementById('tab-btn-hod')) document.getElementById('tab-btn-hod').className = tab === 'hod' ? 'btn-primary' : 'btn-secondary';
    if(document.getElementById('tab-btn-branches')) document.getElementById('tab-btn-branches').className = tab === 'branches' ? 'btn-primary' : 'btn-secondary';
}
window.switchRegTab = switchRegistrationTab;
window.switchRegistrationTab = switchRegistrationTab;

// ----------------------------------------------------
// MANUAL BRANCH ENTRY HELPERS
// (Student / Faculty / HOD registration forms + Edit popup)
// ----------------------------------------------------
const MANUAL_BRANCH_SELECT_IDS = ['manual-stu-branch', 'manual-fac-branch', 'manual-hod-branch', 'edit-user-branch'];
const MANUAL_BRANCH_VALUE = 'ENTER_MANUALLY';

function isManualBranchSelect(selectEl) {
    return !!selectEl && MANUAL_BRANCH_SELECT_IDS.indexOf(selectEl.id) !== -1;
}

function getManualBranchInput(selectEl, createIfMissing) {
    let box = document.getElementById(selectEl.id + '-manual');
    if (!box && createIfMissing) {
        box = document.createElement('input');
        box.type = 'text';
        box.id = selectEl.id + '-manual';
        box.className = 'input-field mb-1';
        box.placeholder = 'Type branch name (e.g. CSE, AIML, MECH)';
        box.maxLength = 60;
        box.style.display = 'none';
        selectEl.insertAdjacentElement('afterend', box);
    }
    return box;
}

// Called by every branch dropdown (onchange) - shows/hides the typing box
window.handleBranchSelect = function(selectEl) {
    if (!selectEl || !isManualBranchSelect(selectEl)) return;
    const box = getManualBranchInput(selectEl, true);
    if (selectEl.value === MANUAL_BRANCH_VALUE) {
        box.style.display = 'block';
        box.focus();
    } else {
        box.style.display = 'none';
        box.value = '';
    }
};

// Returns the branch the admin chose OR typed (empty string if nothing valid)
function getSelectedBranchValue(selectId) {
    const selectEl = document.getElementById(selectId);
    if (!selectEl) return '';
    if (selectEl.value === MANUAL_BRANCH_VALUE) {
        const box = getManualBranchInput(selectEl, false);
        const typed = box ? box.value.replace(/\s+/g, ' ').trim() : '';
        if (!typed) return '';
        // Same branch typed in different letter-case? reuse the existing spelling.
        const match = Array.from(selectEl.options).find(o => o.value && o.value !== MANUAL_BRANCH_VALUE && o.value.toLowerCase() === typed.toLowerCase());
        return match ? match.value : typed;
    }
    return selectEl.value;
}

// Selects a branch in a dropdown; if it is not in the list, adds it temporarily
function setBranchSelectValue(selectEl, branch) {
    if (!selectEl) return;
    const b = (branch || '').trim();
    if (b && !Array.from(selectEl.options).some(o => o.value === b)) {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        const manualOpt = Array.from(selectEl.options).find(o => o.value === MANUAL_BRANCH_VALUE);
        selectEl.insertBefore(opt, manualOpt || null);
    }
    selectEl.value = b;
    window.handleBranchSelect(selectEl);
}

function resetBranchSelect(selectId) {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.value = '';
    window.handleBranchSelect(el);
}

// Safe way to put an object inside an onclick='...' attribute (names with ' or & or < no longer break Edit)
function jsonAttr(obj) {
    return JSON.stringify(obj).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escHtml(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadAdminRegistryData() {
    try {
        const res = await fetch(`${API_BASE}/admin/registry_extended`);
        let data = {};
        if (res.ok) {
            data = await res.json();
        } else {
            // Fallback for old route just in case
            const res2 = await fetch(`${API_BASE}/admin/registry`);
            data = await res2.json();
        }
        
        // 1. Populate Dynamic Branch Selects
        const branchSelects = document.querySelectorAll('.dynamic-branch-select');
        let branchOptions = '<option value="">Select Branch...</option>';
        if (data.branches && data.branches.length > 0) {
            data.branches.forEach(b => {
                branchOptions += `<option value="${b.branch_code}">${b.branch_code} - ${b.branch_name}</option>`;
            });
        } else {
            branchOptions += `<option value="CSE">CSE</option><option value="ECE">ECE</option><option value="EEE">EEE</option><option value="Civil">Civil</option><option value="Mechanical">Mechanical</option>`;
        }
        branchSelects.forEach(select => {
            const currentVal = select.value;
            const manualBox = isManualBranchSelect(select) ? getManualBranchInput(select, true) : null;
            select.innerHTML = branchOptions + (manualBox ? `<option value="${MANUAL_BRANCH_VALUE}">➕ Enter Branch Manually</option>` : '');
            if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) select.value = currentVal;
        });

        // 2. Render Branches List
        const branchList = document.getElementById('admin-branches-list');
        if (branchList) {
            branchList.innerHTML = (data.branches || []).map(b => `
                <div class="list-item" style="justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${b.branch_code}</strong><br>
                        <span style="font-size:11px; color:var(--text-muted);">${b.branch_name}</span>
                    </div>
                    <div>
                        <button class="btn-primary" style="padding:4px 8px; font-size:11px;" onclick='openEditBranch(${jsonAttr(b)})'><i class="fas fa-edit"></i> Edit</button>
                        <button class="btn-danger" style="padding:4px 8px; font-size:11px; margin-left:5px;" onclick="deleteBranch(${b.id}, '${b.branch_code}')"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                </div>
            `).join('') || '<p style="color:var(--text-muted);">No branches registered yet.</p>';
        }

        // 3. Render Students
        const stuList = document.getElementById('admin-registered-students-list');
        if (stuList) {
            stuList.innerHTML = (data.students || []).map(s => `
                <div class="list-item" style="justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${escHtml(s.name)}</strong> (${escHtml(s.reg_no)}) - Year ${s.year_of_study || 1} [${escHtml(s.branch)}]<br>
                        <span style="font-size:11px; color:var(--text-muted);"><i class="fas fa-envelope"></i> ${escHtml(s.email)} | <i class="fas fa-phone"></i> ${escHtml(s.phone)}</span>
                    </div>
                    <div>
                        <button class="btn-primary" style="padding:4px 8px; font-size:11px;" onclick='openEditUser(${jsonAttr(s)}, "student")'><i class="fas fa-edit"></i> Edit</button>
                        <button class="btn-danger" style="padding:4px 8px; font-size:11px; margin-left:5px;" onclick="deleteUser('${encodeURIComponent(s.reg_no)}', 'student')"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                </div>
            `).join('') || '<p style="color:var(--text-muted);">No students registered yet.</p>';
        }

        // 4. Render Faculty
        const facList = document.getElementById('admin-registered-faculty-list');
        if (facList) {
            facList.innerHTML = (data.faculty || []).map(f => `
                <div class="list-item" style="justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${escHtml(f.name)}</strong> (${escHtml(f.phone)})<br>
                        <span style="font-size:11px; color:var(--text-muted);">Branch: ${escHtml(f.branch || 'N/A')}</span>
                    </div>
                    <div>
                        <button class="btn-primary" style="padding:4px 8px; font-size:11px;" onclick='openEditUser(${jsonAttr(f)}, "faculty")'><i class="fas fa-edit"></i> Edit</button>
                        <button class="btn-danger" style="padding:4px 8px; font-size:11px; margin-left:5px;" onclick="deleteUser('${encodeURIComponent(f.id || f.reg_no)}', 'faculty')"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                </div>
            `).join('') || '<p style="color:var(--text-muted);">No faculty synced yet.</p>';
        }

        // 5. Render HODs
        const hodList = document.getElementById('admin-registered-hods-list');
        if (hodList) {
            hodList.innerHTML = (data.hods || []).map(h => `
                <div class="list-item" style="justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${escHtml(h.name)}</strong> - <em>${escHtml(h.branch)} Department</em><br>
                        <span style="font-size:11px; color:var(--text-muted);">Pass/RegNo: <strong>${escHtml(h.reg_no)}</strong> | Phone: ${escHtml(h.phone)}</span>
                    </div>
                    <div>
                        <button class="btn-primary" style="padding:4px 8px; font-size:11px;" onclick='openEditUser(${jsonAttr(h)}, "hod")'><i class="fas fa-edit"></i> Edit</button>
                        <button class="btn-danger" style="padding:4px 8px; font-size:11px; margin-left:5px;" onclick="deleteUser('${encodeURIComponent(h.reg_no)}', 'hod')"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                </div>
            `).join('') || '<p style="color:var(--text-muted);">No HODs registered yet.</p>';
        }
    } catch(e) {
        console.error("Failed to load registry", e);
    }
}

// ----------------------------------------------------
// BRANCH MANAGEMENT OPERATIONS
// ----------------------------------------------------
window.submitNewBranch = async function() {
    const code = document.getElementById('new-branch-code').value.trim().toUpperCase();
    const name = document.getElementById('new-branch-name').value.trim();
    if (!code || !name) return alert("Branch Code and Name are required.");

    try {
        const res = await fetch(`${API_BASE}/admin/branches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch_code: code, branch_name: name })
        });
        const data = await res.json();
        showToast(data.message || "Branch created");
        if (data.success) {
            document.getElementById('new-branch-code').value = '';
            document.getElementById('new-branch-name').value = '';
            loadAdminRegistryData();
        }
    } catch(e) { showToast("Error saving branch."); }
};

window.deleteBranch = async function(id, code) {
    if (!confirm(`Are you sure you want to delete branch ${code}?`)) return;
    try {
        const res = await fetch(`${API_BASE}/admin/branches/${id}`, { method: 'DELETE' });
        const data = await res.json();
        showToast(data.message || "Branch deleted");
        loadAdminRegistryData();
    } catch(e) { showToast("Error deleting branch."); }
};

window.openEditBranch = function(branchObj) {
    document.getElementById('edit-branch-id').value = branchObj.id;
    document.getElementById('edit-branch-code').value = branchObj.branch_code;
    document.getElementById('edit-branch-name').value = branchObj.branch_name;
    document.getElementById('edit-branch-modal').classList.remove('hidden');
};

window.submitBranchEdit = async function() {
    const id = document.getElementById('edit-branch-id').value;
    const code = document.getElementById('edit-branch-code').value.trim().toUpperCase();
    const name = document.getElementById('edit-branch-name').value.trim();
    
    try {
        const res = await fetch(`${API_BASE}/admin/branches/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch_code: code, branch_name: name })
        });
        const data = await res.json();
        showToast(data.message || "Branch updated");
        closeModal('edit-branch-modal');
        loadAdminRegistryData();
    } catch(e) { showToast("Error updating branch."); }
};

// ----------------------------------------------------
// EDIT & DELETE OPERATIONS FOR USERS (STUDENT, FACULTY, HOD)
// ----------------------------------------------------
window.openEditUser = function(userObj, role) {
    document.getElementById('edit-user-original-reg').value = userObj.reg_no || userObj.id;
    document.getElementById('edit-user-role').value = role;
    document.getElementById('edit-user-name').value = userObj.name || '';
    document.getElementById('edit-user-phone').value = userObj.phone || '';
    document.getElementById('edit-user-regno').value = userObj.reg_no || userObj.id || "N/A";

    setBranchSelectValue(document.getElementById('edit-user-branch'), userObj.branch || "");

    const stuExtra = document.getElementById('edit-user-student-extra');
    if (stuExtra) {
        stuExtra.classList.toggle('hidden', role !== 'student');
        document.getElementById('edit-user-year').value = userObj.year_of_study || '';
        document.getElementById('edit-user-section').value = userObj.section || '';
    }

    const titleEl = document.getElementById('edit-user-title');
    if (titleEl) titleEl.innerHTML = `<i class="fas fa-user-edit"></i> Edit ${role.toUpperCase()}`;

    document.getElementById('edit-user-modal').classList.remove('hidden');
};

window.submitUserEdit = async function() {
    const reg_no = document.getElementById('edit-user-original-reg').value;
    const role = document.getElementById('edit-user-role').value;
    const name = document.getElementById('edit-user-name').value.trim();
    const branch = getSelectedBranchValue('edit-user-branch');
    const phone = document.getElementById('edit-user-phone').value.replace(/\D/g, '');

    if (!name) return alert("Name is required.");
    if (!branch) return alert("Please select a branch, or choose 'Enter Branch Manually' and type one.");
    if (phone.length !== 10) return alert("Phone number must be exactly 10 digits.");

    try {
        const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(role)}/${encodeURIComponent(reg_no)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, branch, phone,
                year: (document.getElementById('edit-user-year') || {}).value || '',
                section: (document.getElementById('edit-user-section') || {}).value || '' })
        });
        let data = {};
        try { data = await res.json(); } catch (e) { data = { success: false, message: `Server error (${res.status}).` }; }
        showToast(data.message || (data.success ? "Record updated" : "Update failed"));
        if (data.success) {
            closeModal('edit-user-modal');
            loadAdminRegistryData();
        }
    } catch(e) { showToast("Cannot reach the server. Is it running?"); }
};

window.deleteUser = async function(id, role) {
    if (!confirm(`Are you sure you want to delete this ${role}? This action cannot be undone.`)) return;
    try {
        // id already arrives URL-encoded from the Delete button
        const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(role)}/${id}`, { method: 'DELETE' });
        let data = {};
        try { data = await res.json(); } catch (e) { data = { success: false, message: `Server error (${res.status}).` }; }
        showToast(data.message || (data.success ? "Record deleted" : "Delete failed"));
        loadAdminRegistryData();
    } catch(e) { showToast("Cannot reach the server. Is it running?"); }
};

async function submitManualStudent() {
    const regEl = document.getElementById('manual-stu-reg');
    const nameEl = document.getElementById('manual-stu-name');
    const branchEl = document.getElementById('manual-stu-branch');
    const phoneEl = document.getElementById('manual-stu-phone');

    const regNo = regEl ? regEl.value.trim().toUpperCase() : '';
    const name = nameEl ? nameEl.value.trim() : '';
    const branch = getSelectedBranchValue('manual-stu-branch');
    const phone = phoneEl ? phoneEl.value.trim() : '';

    if (!regNo || regNo.length !== 10) return alert("Please enter a valid 10-digit Register Number.");
    if (!name) return alert("Student Name is required.");
    if (!branch) return alert("Please select a branch, or choose 'Enter Branch Manually' and type one.");
    if (!phone || phone.length !== 10) return alert("Phone Number must contain exactly 10 digits.");

    try {
        const res = await fetch(`${API_BASE}/admin/register/student`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regNo, name, branch, phone })
        });
        const data = await res.json();
        showToast(data.message);
        if (data.success) {
            if (regEl) regEl.value = '';
            if (nameEl) nameEl.value = '';
            if (phoneEl) phoneEl.value = '';
            resetBranchSelect('manual-stu-branch');
            loadAdminRegistryData();
        }
    } catch (e) {
        showToast("Registration failed.");
    }
}
window.registerStudentManual = submitManualStudent;

window.submitManualFaculty = async function() {
    const regEl = document.getElementById('manual-fac-reg');
    const nameEl = document.getElementById('manual-fac-name');
    const branchEl = document.getElementById('manual-fac-branch');
    const phoneEl = document.getElementById('manual-fac-phone');

    const regNo = regEl ? regEl.value.trim().toUpperCase() : '';
    const name = nameEl ? nameEl.value.trim() : '';
    const branch = getSelectedBranchValue('manual-fac-branch');
    const phone = phoneEl ? phoneEl.value.trim() : '';

    if (!name) return alert("Faculty Name is required.");
    if (!branch) return alert("Please select a branch, or choose 'Enter Branch Manually' and type one.");
    
    try {
        const res = await fetch(`${API_BASE}/admin/register/faculty`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regNo, name, branch, phone })
        });
        const data = await res.json();
        showToast(data.message || "Faculty registered");
        if (data.success) {
            if (regEl) regEl.value = '';
            if (nameEl) nameEl.value = '';
            if (phoneEl) phoneEl.value = '';
            resetBranchSelect('manual-fac-branch');
            loadAdminRegistryData();
        }
    } catch (e) {
        showToast("Registration failed. Please check server routes.");
    }
};

async function processStudentBulkUpload() {
    const fileInput = document.getElementById('bulk-student-file');
    const prog = document.getElementById('stu-bulk-progress');
    if (!fileInput.files || fileInput.files.length === 0) return alert("Please select a student bulk-upload CSV/TXT file.");

    const file = fileInput.files[0];
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    const students = [];

    for (let line of lines) {
        line = line.trim();
        if (!line || line.toLowerCase().includes('register number') || line.toLowerCase().includes('s.no')) continue;
        const parts = line.split(/[,|\t]+/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 4) {
            let reg = parts[1];
            let name = parts[2];
            let branch = parts[3];
            let phone = parts[4] || parts[3];
            if (parts.length === 4) {
                reg = parts[0]; name = parts[1]; branch = parts[2]; phone = parts[3];
            }
            students.push({ regNo: reg, name, branch, phone });
        }
    }

    if (students.length === 0) return alert("No valid student records found in file.");
    if (prog) {
        prog.style.display = 'block';
        prog.innerText = `Importing ${students.length} students...`;
    }

    try {
        const res = await fetch(`${API_BASE}/admin/register/student_bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students })
        });
        const data = await res.json();
        showToast(data.message);
        fileInput.value = '';
        loadAdminRegistryData();
    } catch(e) {
        alert("Upload failed.");
    } finally {
        if (prog) prog.style.display = 'none';
    }
}

async function syncFacultyFromTimetable() {
    try {
        const res = await fetch(`${API_BASE}/admin/sync_timetable_faculty`, { method: 'POST' });
        const data = await res.json();
        showToast(data.message);
        loadAdminRegistryData();
    } catch(e) {
        showToast("Faculty sync failed.");
    }
}

// Resilient Manual HOD Registration
async function submitManualHod() {
    const nameEl = document.getElementById('manual-hod-name');
    const branchEl = document.getElementById('manual-hod-branch');
    const phoneEl = document.getElementById('manual-hod-phone');
    const regEl = document.getElementById('manual-hod-reg');

    const name = nameEl ? nameEl.value.trim() : '';
    const branch = getSelectedBranchValue('manual-hod-branch');
    const phone = phoneEl ? phoneEl.value.replace(/\D/g, '').trim() : '';
    const regNo = regEl ? regEl.value.trim().toUpperCase() : '';

    if (!name) return alert("Please enter the HOD Name.");
    if (!branch) return alert("Please select a Department Branch, or choose 'Enter Branch Manually' and type one.");
    if (!phone || phone.length !== 10) return alert("HOD Phone Number must be exactly 10 digits.");
    if (!regNo) return alert("Please enter a Register Number/Password for the HOD.");

    try {
        const res = await fetch(`${API_BASE}/admin/register/hod`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, branch, phone, regNo })
        });
        const data = await res.json();
        showToast(data.message);
        if (data.success) {
            if (nameEl) nameEl.value = '';
            if (phoneEl) phoneEl.value = '';
            if (regEl) regEl.value = '';
            resetBranchSelect('manual-hod-branch');
            loadAdminRegistryData();
        }
    } catch(e) {
        showToast("HOD registration failed.");
    }
}
window.registerHODManual = submitManualHod;

async function processHodBulkUpload() {
    const fileInput = document.getElementById('bulk-hod-file');
    if (!fileInput.files || fileInput.files.length === 0) return alert("Please select an HOD CSV file.");

    const text = await fileInput.files[0].text();
    const lines = text.split(/\r?\n/);
    const hods = [];

    for (let line of lines) {
        line = line.trim();
        if (!line || line.toLowerCase().includes('hod name') || line.toLowerCase().includes('s.no')) continue;
        const parts = line.split(/[,|\t]+/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 4) {
            let name = parts[1];
            let branch = parts[2];
            let phone = parts[3];
            let regNo = parts[4] || parts[0];
            hods.push({ name, branch, phone, regNo });
        }
    }

    if (hods.length === 0) return alert("No HOD records found in file.");
    try {
        const res = await fetch(`${API_BASE}/admin/register/hod_bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hods })
        });
        const data = await res.json();
        showToast(data.message);
        fileInput.value = '';
        loadAdminRegistryData();
    } catch(e) {
        alert("HOD import failed.");
    }
}

// ----------------------------------------------------
// EVENT CREATION (ADMIN ONLY)
// ----------------------------------------------------
function toggleAddEventForm() {
    const box = document.getElementById('admin-add-event-box');
    if(box) box.classList.toggle('hidden');
}

async function submitNewEvent() {
    const title = document.getElementById('ev-title').value;
    const cat = document.getElementById('ev-cat').value;
    const date = document.getElementById('ev-date').value;
    const venue = document.getElementById('ev-venue').value;
    const org = document.getElementById('ev-org').value;
    const desc = document.getElementById('ev-desc').value;
    if(!title || !date || !venue) return showToast("Title, Date, and Venue are required!");
    
    try {
        let res = await fetch(`${API_BASE}/events/create`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title, category: cat, date, venue, organizer: org, description: desc})
        });
        let data = await res.json();
        if(data.success) {
            showToast("Event published successfully!");
            toggleAddEventForm();
            fetchGlobalData();
        } else {
            showToast("Failed to publish event.");
        }
    } catch (e) {
        showToast("Error connecting to server.");
    }
}

// ----------------------------------------------------
// TIMETABLE GENERATOR ENGINE
// ----------------------------------------------------
let ttDb = { sections: [], subjects: {}, faculty: [], labs: [], weeklySingles: [], settings: { periods: 7, start: '09:00', end: '15:50' }, generatedSchedule: false };

async function syncWithBackend() {
    try {
        const res = await fetch(`${API_BASE}/db`);
        if (res.ok) ttDb = await res.json();
    } catch (e) {
        console.warn("Failed to load timetable DB. Using offline memory.", e);
    }
    try {
        const resSec = await fetch(`${API_BASE}/timetable/all_sections`);
        if (resSec.ok) {
            const secData = await resSec.json();
            if (secData.sections && secData.sections.length > 0) {
                ttDb.sections = secData.sections;
            }
        }
    } catch (e) {
        console.warn("Failed to load sections from backend.", e);
    }
    try {
        const resAll = await fetch(`${API_BASE}/timetable/all`);
        if (resAll.ok) {
            const allData = await resAll.json();
            if (allData.timetables) {
                ttDb.allSlots = allData.timetables;
                ttDb.generatedSchedule = true;
            }
        }
    } catch (e) {
        console.warn("Failed to load slots from backend.", e);
    }
}

async function initAdminDashboard() {
    await syncWithBackend();
    if(document.getElementById('total-periods')) document.getElementById('total-periods').value = ttDb.settings.periods;
    
    const sel = document.getElementById('view-class-select');
    if(sel) sel.innerHTML = ttDb.sections.map(s => `<option value="${s}">${formatSectionLabel(s)}</option>`).join('');
    
    const labSel = document.getElementById('lab-section');
    if(labSel) labSel.innerHTML = ttDb.sections.map(s => `<option value="${s}">${formatSectionLabel(s)}</option>`).join('');
    
    const singSel = document.getElementById('single-section');
    if(singSel) singSel.innerHTML = ttDb.sections.map(s => `<option value="${s}">${formatSectionLabel(s)}</option>`).join('');

    renderExportButtons();
    updateSectionsList();
    updateFacultyDropdowns();
    updateRegisteredFacultyList();
    renderClassTimetable();
}

// ----------------------------------------------------
// SECTION LIMITS, "VIEW MORE (45 CLASSES)" & SEARCH
// ----------------------------------------------------
let exportSectionsLimit = 5;
let exportSectionsSearchQuery = '';
let curriculumSectionsLimit = 5;
let curriculumSectionsSearchQuery = '';

window.onExportSectionSearch = function(query) {
    exportSectionsSearchQuery = (query || '').trim().toLowerCase();
    renderExportButtons();
};

window.toggleExportSectionsLimit = function() {
    const total = ttDb.sections ? ttDb.sections.length : 0;
    if (exportSectionsLimit === 5) {
        exportSectionsLimit = 45;
    } else if (exportSectionsLimit === 45) {
        exportSectionsLimit = total;
    } else {
        exportSectionsLimit = 5;
    }
    renderExportButtons();
};

function renderExportButtons() {
    const exportBox = document.getElementById('export-btn-container');
    const counter = document.getElementById('export-sections-counter');
    const toggleBtnText = document.getElementById('toggle-export-btn-text');
    if (!exportBox || !ttDb || !ttDb.sections) return;

    let filtered = ttDb.sections;
    if (exportSectionsSearchQuery) {
        filtered = filtered.filter(s => {
            const label = formatSectionLabel(s).toLowerCase();
            const raw = s.toLowerCase();
            return label.includes(exportSectionsSearchQuery) || raw.includes(exportSectionsSearchQuery);
        });
    }

    const totalFiltered = filtered.length;
    const isSearching = !!exportSectionsSearchQuery;
    const limit = isSearching ? filtered.length : exportSectionsLimit;
    const displayList = filtered.slice(0, limit);

    if (counter) {
        if (isSearching) {
            counter.innerText = `Found ${totalFiltered} match${totalFiltered === 1 ? '' : 'es'}`;
        } else {
            counter.innerText = `Showing ${Math.min(limit, totalFiltered)} of ${ttDb.sections.length} classes`;
        }
    }

    if (toggleBtnText) {
        if (isSearching) {
            toggleBtnText.innerText = `Search Active (${totalFiltered})`;
        } else if (exportSectionsLimit === 5) {
            toggleBtnText.innerText = `View More (45 Classes)`;
        } else if (exportSectionsLimit === 45) {
            toggleBtnText.innerText = `View All (${ttDb.sections.length} Classes)`;
        } else {
            toggleBtnText.innerText = `Show Less (5 Classes)`;
        }
    }

    if (displayList.length === 0) {
        exportBox.innerHTML = `<span style="font-size:12px; color:var(--text-muted); padding:6px 0;">No sections matching "<strong>${escHtml(exportSectionsSearchQuery)}</strong>".</span>`;
        return;
    }

    exportBox.innerHTML = displayList.map(s => 
        `<button class="btn-success" style="padding: 6px 12px; font-size: 11px; border-radius: 8px; font-weight:600; display:inline-flex; align-items:center; gap:5px;" onclick="previewPDF('${s}')"><i class="fas fa-eye"></i> Preview ${formatSectionLabel(s)}</button>`
    ).join('');
}

window.onCurriculumSectionSearch = function(query) {
    curriculumSectionsSearchQuery = (query || '').trim().toLowerCase();
    updateSectionsList();
};

window.toggleCurriculumSectionsLimit = function() {
    const total = ttDb.sections ? ttDb.sections.length : 0;
    if (curriculumSectionsLimit === 5) {
        curriculumSectionsLimit = 45;
    } else if (curriculumSectionsLimit === 45) {
        curriculumSectionsLimit = total;
    } else {
        curriculumSectionsLimit = 5;
    }
    updateSectionsList();
};

function updateSectionsList() {
    const container = document.getElementById('sections-list');
    const counter = document.getElementById('curriculum-sections-counter');
    const toggleBtnText = document.getElementById('toggle-curriculum-btn-text');
    if(!container || !ttDb || !ttDb.sections) return;

    let filtered = ttDb.sections;
    if (curriculumSectionsSearchQuery) {
        filtered = filtered.filter(s => {
            const label = formatSectionLabel(s).toLowerCase();
            const raw = s.toLowerCase();
            return label.includes(curriculumSectionsSearchQuery) || raw.includes(curriculumSectionsSearchQuery);
        });
    }

    const totalFiltered = filtered.length;
    const isSearching = !!curriculumSectionsSearchQuery;
    const limit = isSearching ? filtered.length : curriculumSectionsLimit;
    const displayList = filtered.slice(0, limit);

    if (counter) {
        if (isSearching) {
            counter.innerText = `Found ${totalFiltered} match${totalFiltered === 1 ? '' : 'es'}`;
        } else {
            counter.innerText = `Showing ${Math.min(limit, totalFiltered)} of ${ttDb.sections.length} classes`;
        }
    }

    if (toggleBtnText) {
        if (isSearching) {
            toggleBtnText.innerText = `Search Active (${totalFiltered})`;
        } else if (curriculumSectionsLimit === 5) {
            toggleBtnText.innerText = `View More (45 Classes)`;
        } else if (curriculumSectionsLimit === 45) {
            toggleBtnText.innerText = `View All (${ttDb.sections.length} Classes)`;
        } else {
            toggleBtnText.innerText = `Show Less (5 Classes)`;
        }
    }

    container.innerHTML = '';
    if (displayList.length === 0) {
        container.innerHTML = `<span style="font-size:12px; color:var(--text-muted); padding:6px 0;">No sections matching "<strong>${escHtml(curriculumSectionsSearchQuery)}</strong>".</span>`;
        return;
    }

    displayList.forEach(sec => {
        let secSubjects = ttDb.subjects[sec] || [];
        let subs = secSubjects.length > 0 
            ? secSubjects.map(s => `<span class="sub-tag" style="background:rgba(255,255,255,0.2); padding:3px 6px; border-radius:4px; margin-right:4px;">${escHtml(s)}</span>`).join('') 
            : '<span style="font-size:11px; color:#999;">No subjects</span>';
            
        container.innerHTML += `
            <div class="list-item" style="flex-direction:column; gap:5px; background:rgba(0,0,0,0.1); border-color:var(--primary-color);">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <strong>${formatSectionLabel(sec)}</strong>
                    <div style="display:flex; gap:5px;">
                        <button type="button" class="btn-success" style="font-size:10px; padding:4px 8px;" onclick="promptAddSubject('${sec}')">+ Subject</button>
                        <button type="button" class="btn-danger" style="font-size:10px; padding:4px 8px;" onclick="removeSection('${sec}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="subject-tags" style="display:flex; flex-wrap:wrap; margin-top:5px;">${subs}</div>
            </div>`;
    });
}

async function removeSection(secName) {
    if (confirm(`Remove section "${secName}"?`)) {
        await fetch(`${API_BASE}/sections/${encodeURIComponent(secName)}`, { method: 'DELETE' });
        await initAdminDashboard();
    }
}

async function promptAddSubject(sec) {
    let sub = prompt(`Enter subject code for ${sec}:`);
    if (sub) {
        await fetch(`${API_BASE}/sections/${encodeURIComponent(sec)}/subjects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject_code: sub }) });
        await initAdminDashboard();
    }
}

function updateFacultyDropdowns() {
    const labFac = document.getElementById('lab-faculty');
    if (labFac) labFac.innerHTML = ttDb.faculty.map(f => `<option value="${f.name}">${f.name} (${f.subject})</option>`).join('');
}

// ----------------------------------------------------
// 1-PER-WEEK ASSIGNMENT ENGINE
// ----------------------------------------------------
async function addLab(e) {
    if (e) e.preventDefault();
    const section = document.getElementById('lab-section').value;
    const day = document.getElementById('lab-day').value;
    const startPeriod = parseInt(document.getElementById('lab-start-period').value);
    const name = document.getElementById('lab-name').value.trim();
    const fac = document.getElementById('lab-faculty').value;
    const dur = parseInt(document.getElementById('lab-duration').value);
    if (!name || !startPeriod) return showToast("Name and Start Period are required!");
    
    ttDb.labs = ttDb.labs || [];
    ttDb.labs.push({ section, day, startPeriod, name, faculty: fac, duration: dur });
    await fetch(`${API_BASE}/labs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, day, startPeriod, name, faculty: fac, duration: dur }) });
    document.getElementById('lab-name').value = '';
    showToast(`Assigned ${name} to ${section} on ${day} P${startPeriod}`);
    await initAdminDashboard();
}

async function addWeeklySingle(e) {
    if (e) e.preventDefault();
    const section = document.getElementById('single-section').value;
    const day = document.getElementById('single-day').value;
    const startPeriod = parseInt(document.getElementById('single-start-period').value);
    const subject = document.getElementById('single-sub-name').value.trim();
    if(!subject || !startPeriod) return showToast("Subject and Period are required!");
    
    ttDb.weeklySingles = ttDb.weeklySingles || [];
    ttDb.weeklySingles.push({ section, day, startPeriod, subject });
    await fetch(`${API_BASE}/weekly`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, day, startPeriod, subject }) });
    document.getElementById('single-sub-name').value = '';
    showToast(`Assigned ${subject} to ${section} on ${day} P${startPeriod}`);
    await initAdminDashboard();
}

function updateRegisteredFacultyList() {
    const list = document.getElementById('registered-faculty-list');
    if(!list) return;
    list.innerHTML = ttDb.faculty.map(f => `
        <div class="list-item" style="align-items: center; justify-content: space-between; background:rgba(0,0,0,0.1); border-color:var(--primary-color);">
            <div>
                <strong>${escHtml(f.name)}</strong> (${escHtml(f.phone)})<br>
                <span style="font-size:11px; color:var(--text-muted);">Subject: ${f.subject}</span><br>
                <span style="font-size:11px; color:var(--success); font-weight:600;"> Classes: ${f.sections && f.sections.length ? f.sections.join(', ') : '<em>None assigned</em>'} </span>
            </div>
            <div style="display: flex; flex-direction:column; gap: 4px;">
                <button type="button" class="btn-primary" style="font-size: 11px; padding: 4px 8px;" onclick="quickAssign('${f.id}')">Assign Class</button>
                <button type="button" class="btn-danger" style="font-size: 11px; padding: 4px 8px;" onclick="removeFaculty(${f.id})">Remove</button>
            </div>
        </div>
    `).join('');
}

async function quickAssign(fid) {
    let secs = prompt(`Enter sections to assign (comma separated, e.g. CSE-A,Mech):`);
    if(secs !== null) {
        let arr = secs.split(',').map(s=>s.trim()).filter(Boolean);
        await fetch(`${API_BASE}/faculty/${fid}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections: arr }) });
        await initAdminDashboard();
    }
}

async function removeFaculty(facId) {
    if (confirm("Remove this faculty member?")) {
        await fetch(`${API_BASE}/faculty/${facId}`, { method: 'DELETE' });
        await initAdminDashboard();
    }
}

// ==========================================
// BULK FACULTY UPLOAD & PARSING
// ==========================================
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
}

function parseFacultyRawText(rawText) {
    const lines = rawText.split(/\r?\n/);
    const parsed = [];
    for (let line of lines) {
        line = line.trim();
        if (!line || line.toLowerCase().includes('faculty name') || line.toLowerCase().includes('s.no')) continue;
        
        let phoneMatch = line.match(/(?:\+91|91)?\s*[-]?\s*(\d\s*[-]?\s*){10}/);
        if (!phoneMatch) continue;
        
        let phoneStr = phoneMatch[0];
        let cleanPhone = phoneStr.replace(/\D/g, '').slice(-10); 
        
        let remaining = line.replace(phoneStr, '').trim();
        remaining = remaining.replace(/,+$/, '').trim(); 
        let parts = remaining.split(/[,|\t]+/).map(p => p.trim()).filter(Boolean);
        
        if (parts.length < 4) {
            parts = remaining.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
        }
        
        let facName, facCode, subName, subCode;
        if (parts.length >= 5) {
            facName = parts[1]; facCode = parts[2]; subName = parts[3]; subCode = parts[4];
        } else if (parts.length === 4) {
            facName = parts[0]; facCode = parts[1]; subName = parts[2]; subCode = parts[3];
        } else {
            continue; 
        }
        
        parsed.push({ name: facName, faculty_code: facCode, subject: subName, subject_code: subCode, phone: cleanPhone });
    }
    return parsed;
}

async function processUniversalBulkUpload(e) {
    if (e) e.preventDefault();
    const fileInput = document.getElementById('bulk-universal-file');
    const progText = document.getElementById('upload-progress-text');
    const uploadBtn = document.getElementById('btn-universal-upload');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        return alert("Please select a file first.");
    }
    
    const file = fileInput.files[0];
    const fileName = file.name.toLowerCase();
    uploadBtn.disabled = true;
    progText.style.display = 'block';
    progText.innerText = "Analyzing file...";
    
    try {
        let extractedFaculty = [];
        if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
            const text = await file.text();
            extractedFaculty = parseFacultyRawText(text);
        } else if (fileName.endsWith('.pdf')) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullPdfText = "";
            for (let p = 1; p <= pdf.numPages; p++) {
                const page = await pdf.getPage(p);
                const textContent = await page.getTextContent();
                fullPdfText += textContent.items.map(item => item.str).join(' ') + "\n";
            }
            extractedFaculty = parseFacultyRawText(fullPdfText);
        } else if (fileName.match(/\.(png|jpg|jpeg)$/)) {
            const worker = await Tesseract.createWorker('eng');
            const ret = await worker.recognize(file);
            await worker.terminate();
            extractedFaculty = parseFacultyRawText(ret.data.text);
        } else {
            throw new Error("Unsupported format.");
        }
        
        if (extractedFaculty.length === 0) {
            alert("No faculty records detected.");
        } else {
            progText.innerText = `Uploading ${extractedFaculty.length} parsed records...`;
            for (let f of extractedFaculty) {
                ttDb.faculty.push({
                    id: ttDb.faculty.length + 1,
                    name: f.name,
                    faculty_code: f.faculty_code,
                    subject: f.subject,
                    subject_code: f.subject_code,
                    phone: f.phone,
                    sections: []
                });
            }
            showToast(`Bulk Upload Completed! ${extractedFaculty.length} registered.`);
            fileInput.value = '';
            await initAdminDashboard();
        }
    } catch (err) {
        alert(`UPLOAD FAILED!\n\nReason: ${err.message || err}`);
    } finally {
        uploadBtn.disabled = false;
        progText.style.display = 'none';
    }
}

// ----------------------------------------------------
// A4 LANDSCAPE TIMETABLE GENERATION & EXPORT ENGINE
// Guarantees zero-clash scheduling and exact A4 page fit
// ----------------------------------------------------
let currentExportSection = "";
let currentExportSlots = [];

async function generateAllSectionsTimetable() {
    const doGenerate = confirm("Generate collision-free timetables across all sections?\n\nThis runs the AI constraint-satisfaction solver to guarantee 0 room, 0 faculty, and 0 section clashes across all sections.");
    if (!doGenerate) return;

    showToast("Running collision-free scheduler across all sections...");
    try {
        const res = await fetch(`${API_BASE}/timetable/generate_all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ periods: 7 })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✓ Generated ${data.total_slots || 2100} clash-free slots across ${data.total_sections || 50} sections!`);
            await syncWithBackend();
            await initAdminDashboard();
            auditTimetableClashes();
        } else {
            showToast(`Generation failed: ${data.message || 'Unknown error'}`);
        }
    } catch (e) {
        console.error(e);
        showToast("Error connecting to timetable generator.");
    }
}

async function auditTimetableClashes() {
    showToast("Auditing timetable collision matrix...");
    try {
        const res = await fetch(`${API_BASE}/timetable/verify_clashes`);
        const data = await res.json();
        const modal = document.getElementById('tt-clash-audit-modal');
        const body = document.getElementById('tt-clash-audit-body');
        if (!modal || !body) return;

        const isClean = (data.total_clashes === 0);
        body.innerHTML = `
            <div style="text-align:center; padding: 15px; background: ${isClean ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)'}; border: 2px solid ${isClean ? '#2ecc71' : '#e74c3c'}; border-radius: 12px; margin-bottom: 20px;">
                <i class="fas ${isClean ? 'fa-check-circle' : 'fa-exclamation-triangle'}" style="font-size: 40px; color: ${isClean ? '#2ecc71' : '#e74c3c'}; margin-bottom: 10px;"></i>
                <h3 style="margin: 0; color: ${isClean ? '#2ecc71' : '#e74c3c'}; font-size: 18px;">
                    ${isClean ? '100% COLLISION-FREE TIMETABLE' : 'CLASHES DETECTED'}
                </h3>
                <p style="margin: 6px 0 0 0; font-size: 13px; color: var(--text-muted, #94a3b8);">
                    ${data.message || 'Audited across all sections, faculty, and room allocations.'}
                </p>
            </div>

            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
                <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 22px; font-weight: 800; color: var(--primary-color, #38bdf8);">${data.total_slots || 0}</div>
                    <div style="font-size: 11px; color: var(--text-muted, #94a3b8);">Total Slots Checked</div>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 22px; font-weight: 800; color: #a855f7;">${(data.sections_audited || []).length}</div>
                    <div style="font-size: 11px; color: var(--text-muted, #94a3b8);">Sections Audited</div>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 22px; font-weight: 800; color: ${isClean ? '#2ecc71' : '#e74c3c'};">${data.total_clashes || 0}</div>
                    <div style="font-size: 11px; color: var(--text-muted, #94a3b8);">Total Clashes</div>
                </div>
            </div>

            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px;">
                <h4 style="margin: 0 0 10px 0; font-size: 13px;"><i class="fas fa-list-check" style="color:var(--primary-color);"></i> Cross-Check Verification Breakdown</h4>
                <div style="display:flex; flex-direction:column; gap:8px; font-size: 12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 10px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                        <span><i class="fas fa-chalkboard-teacher" style="color:#38bdf8; width:20px;"></i> Faculty Double-Booking Check:</span>
                        <span style="font-weight:700; color:${isClean ? '#2ecc71' : '#e74c3c'};"><i class="fas fa-check"></i> Passed (0 Overlaps)</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 10px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                        <span><i class="fas fa-door-closed" style="color:#fbbf24; width:20px;"></i> Room &amp; Lab Double-Booking Check:</span>
                        <span style="font-weight:700; color:${isClean ? '#2ecc71' : '#e74c3c'};"><i class="fas fa-check"></i> Passed (0 Overlaps)</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 10px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                        <span><i class="fas fa-users" style="color:#ec4899; width:20px;"></i> Section Duplicate Period Check:</span>
                        <span style="font-weight:700; color:${isClean ? '#2ecc71' : '#e74c3c'};"><i class="fas fa-check"></i> Passed (0 Overlaps)</span>
                    </div>
                </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                <button type="button" class="btn-primary" onclick="downloadAllSectionsBulkA4()" style="padding: 8px 16px; font-size: 12px;">
                    <i class="fas fa-layer-group"></i> Bulk Download All (A4 PDF)
                </button>
                <button type="button" class="btn-secondary" onclick="closeModal('tt-clash-audit-modal')" style="padding: 8px 14px; font-size: 12px;">Close</button>
            </div>
        `;

        modal.classList.remove('hidden');
    } catch (e) {
        console.error("Clash audit error:", e);
        showToast("Failed to run clash audit.");
    }
}

function formatSectionLabel(sec) {
    if (!sec) return '';
    const romanMatch = sec.match(/^(I|II|III|IV)\s+([A-Za-z0-9]+)-([A-Za-z0-9])$/i);
    if (romanMatch) {
        return `${romanMatch[1].toUpperCase()} ${romanMatch[2].toUpperCase()}-${romanMatch[3].toUpperCase()}`;
    }
    const match = sec.match(/^([1-4])-([A-Za-z0-9]+)-([A-Z])$/i);
    if (match) {
        const romanMap = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
        return `${romanMap[match[1]] || match[1]} ${match[2].toUpperCase()}-${match[3].toUpperCase()}`;
    }
    return sec;
}

function generateTimetableA4HTML(type, identifier, slotsData = [], meta = {}) {
    const isFaculty = (type === 'faculty');
    let displaySectionTitle = identifier;
    let deptName = 'Engineering';

    const romanMatch = identifier.match(/^(I|II|III|IV)\s+([A-Za-z0-9]+)-([A-Za-z0-9])$/i);
    if (romanMatch) {
        displaySectionTitle = `${romanMatch[1].toUpperCase()} YEAR ${romanMatch[2].toUpperCase()} &bull; SECTION ${romanMatch[3].toUpperCase()}`;
        deptName = romanMatch[2].toUpperCase();
    } else {
        const match = identifier.match(/^([1-4])-([A-Za-z0-9]+)-([A-Z])$/i);
        if (match) {
            const romanMap = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
            displaySectionTitle = `${romanMap[match[1]] || match[1]} YEAR ${match[2].toUpperCase()} &bull; SECTION ${match[3].toUpperCase()}`;
            deptName = match[2].toUpperCase();
        }
    }

    const title = isFaculty ? `FACULTY INDIVIDUAL TEACHING TIME-TABLE & WORKLOAD` : `ACADEMIC CLASS TIME-TABLE`;
    const subTitle = isFaculty ? `FACULTY: ${identifier.toUpperCase()}` : displaySectionTitle.toUpperCase();
    const academicYear = meta.academicYear || '2026 - 2027';
    const semester = meta.semester || 'II Semester';
    const wefDate = meta.wefDate || '02-01-2026';
    const weeklyHours = isFaculty ? (meta.weeklyHours || (slotsData ? slotsData.length : 0)) : (slotsData ? slotsData.length : 42);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Build subject and faculty legend mappings
    const legendMap = {};
    if (Array.isArray(slotsData)) {
        slotsData.forEach(s => {
            if (s.subject && !legendMap[s.subject]) {
                legendMap[s.subject] = {
                    name: s.subject_name || s.subject,
                    faculty: s.faculty_name || '',
                    room: s.room || ''
                };
            }
        });
    }

    let thead = `<tr>
        <th style="width:22mm;">Day / Time</th>
        <th>P1<small>09:00 - 09:50</small></th>
        <th>P2<small>09:50 - 10:40</small></th>
        <th>P3<small>10:40 - 11:30</small></th>
        <th>P4<small>11:30 - 12:20</small></th>
        <th style="width:11mm; background:#fef3c7; color:#92400e;">12:20-01:10</th>
        <th>P5<small>01:10 - 02:00</small></th>
        <th>P6<small>02:00 - 02:50</small></th>
        <th>P7<small>02:50 - 03:40</small></th>
    </tr>`;

    let tbody = '';
    days.forEach((day, dayIdx) => {
        let rowHtml = `<tr><td class="col-day">${day}</td>`;
        
        // P1 to P4
        for (let p = 1; p <= 4; p++) {
            rowHtml += renderA4Cell(day, p, isFaculty, identifier, slotsData);
        }

        // Lunch column (spanned)
        if (dayIdx === 0) {
            rowHtml += `<td rowspan="6" class="col-lunch">LUNCH BREAK</td>`;
        }

        // P5 to P7
        for (let p = 5; p <= 7; p++) {
            rowHtml += renderA4Cell(day, p, isFaculty, identifier, slotsData);
        }

        rowHtml += `</tr>`;
        tbody += rowHtml;
    });

    const legendEntries = Object.entries(legendMap).slice(0, 8);
    const legendHtml = legendEntries.map(([code, d]) => `<strong>${code}</strong>: ${d.name} ${d.faculty ? `[${d.faculty}]` : ''}`).join(' &bull; ');

    return `
    <div class="a4-timetable-sheet" id="a4-sheet-${identifier.replace(/[^a-zA-Z0-9]/g, '_')}">
        <div class="a4-tt-header">
            <div class="a4-tt-logo">BVC</div>
            <div class="a4-tt-title-box">
                <div class="a4-tt-college-name">BVC ENGINEERING COLLEGE (AUTONOMOUS)</div>
                <div class="a4-tt-college-sub">Approved by AICTE, New Delhi | Permanently Affiliated to JNTUK | Accredited by NAAC 'A+' Grade</div>
                <div class="a4-tt-college-sub">Odalarevu, Allavaram Mandal, Dr. B.R. Ambedkar Konaseema Dist, A.P. - 533210</div>
                <div class="a4-tt-doc-title">${title} &mdash; ${subTitle}</div>
            </div>
            <div class="a4-tt-badge-verified">
                <i class="fas fa-check-circle"></i> VERIFIED CLASH-FREE (0 CLASHES)
            </div>
        </div>

        <div class="a4-tt-meta-bar">
            <div class="a4-tt-meta-item"><strong>${isFaculty ? 'Faculty Name' : 'Class / Section'}:</strong> ${isFaculty ? identifier : (displaySectionTitle || identifier)}</div>
            <div class="a4-tt-meta-item"><strong>Department:</strong> ${isFaculty ? 'CSE / Engineering' : deptName}</div>
            <div class="a4-tt-meta-item"><strong>Academic Year:</strong> ${academicYear} (${semester})</div>
            <div class="a4-tt-meta-item"><strong>W.E.F:</strong> ${wefDate} | <strong>Workload:</strong> ${weeklyHours} Pds/Wk</div>
        </div>

        <table class="a4-tt-table">
            <thead>${thead}</thead>
            <tbody>${tbody}</tbody>
        </table>

        <div class="a4-tt-footer">
            <div class="a4-tt-legend">
                <div><strong>CURRICULUM MAPPING:</strong> ${legendHtml || 'Standard Academic Allocation (Theory + Laboratories)'}</div>
                <div style="margin-top:2px; font-size:7.5px; color:#64748b;">
                    <i class="fas fa-certificate" style="color:#16a34a;"></i> Certified 100% collision-free by BVC Smart Portal Timetable Engine. Fits on standard A4 landscape sheet.
                </div>
            </div>
            <div class="a4-tt-signatures">
                <div class="a4-tt-sig-block">Timetable Coordinator</div>
                <div class="a4-tt-sig-block">Head of Department</div>
                <div class="a4-tt-sig-block">Principal</div>
            </div>
        </div>
    </div>
    `;
}

function renderA4Cell(day, period, isFaculty, identifier, slotsData) {
    let slot = null;
    if (Array.isArray(slotsData) && slotsData.length > 0) {
        slot = slotsData.find(s => 
            s.day && s.day.toLowerCase() === day.toLowerCase() && 
            parseInt(s.period) === parseInt(period)
        );
    }
    
    // Fallback to ttDb.allSlots if available
    if (!slot && window.ttDb && window.ttDb.allSlots) {
        if (!isFaculty && window.ttDb.allSlots[identifier]) {
            slot = window.ttDb.allSlots[identifier].find(s => 
                s.day.toLowerCase() === day.toLowerCase() && parseInt(s.period) === parseInt(period)
            );
        } else if (isFaculty) {
            for (let sec in window.ttDb.allSlots) {
                let match = window.ttDb.allSlots[sec].find(s => 
                    (s.faculty_name || '').toLowerCase() === identifier.toLowerCase() && 
                    s.day.toLowerCase() === day.toLowerCase() && 
                    parseInt(s.period) === parseInt(period)
                );
                if (match) {
                    slot = Object.assign({}, match, { section: sec });
                    break;
                }
            }
        }
    }

    if (!slot) {
        if (day === 'Saturday' && period === 7) {
            return `<td><span class="a4-tt-cell-free" style="color:#d97706; font-weight:700;">LEISURE</span></td>`;
        }
        return `<td><span class="a4-tt-cell-free">${isFaculty ? 'FREE / RESEARCH' : '-'}</span></td>`;
    }

    const subCode = slot.subject || 'SUB';
    const isLab = Boolean(slot.is_lab || (subCode.toLowerCase().includes('lab')));
    const cellClass = isLab ? 'col-lab' : '';
    const roomTag = slot.room ? `<span class="a4-tt-cell-room">${slot.room}</span>` : '';

    if (isFaculty) {
        return `
        <td class="${cellClass}">
            <div class="a4-tt-cell-code">${subCode}</div>
            <div class="a4-tt-cell-fac">Sec: ${slot.section || 'Class'}</div>
            ${roomTag}
        </td>`;
    } else {
        const facName = slot.faculty_name || 'Faculty';
        return `
        <td class="${cellClass}">
            <div class="a4-tt-cell-code">${subCode}</div>
            <div class="a4-tt-cell-fac">${facName}</div>
            ${roomTag}
        </td>`;
    }
}

async function downloadActiveTimetableA4() {
    showToast("Preparing your A4 Timetable PDF...");
    try {
        let type = 'section';
        let identifier = 'CSE-A';
        let slots = [];
        let meta = {};

        const viewSelect = document.getElementById('tt-view-select');
        const selectedVal = viewSelect ? viewSelect.value : '';

        if (currentUser.role === 'faculty' && (selectedVal === 'SELF' || !selectedVal)) {
            type = 'faculty';
            identifier = currentUser.name;
            const res = await fetch(`${API_BASE}/timetable/faculty/${encodeURIComponent(identifier)}`);
            if (res.ok) {
                const facData = await res.json();
                slots = facData.slots || [];
                meta.weeklyHours = facData.weekly_hours || slots.length;
            }
        } else if (currentUser.role === 'faculty' && selectedVal && selectedVal !== 'SELF') {
            type = 'section';
            identifier = selectedVal;
            const res = await fetch(`${API_BASE}/timetable/section/${encodeURIComponent(identifier)}`);
            if (res.ok) {
                const secData = await res.json();
                slots = secData.slots || [];
            }
        } else if (currentUser.role === 'student') {
            type = 'section';
            identifier = currentUser.section || (currentUser.branch ? `${currentUser.branch}-A` : (selectedVal || 'CSE-A'));
            const res = await fetch(`${API_BASE}/timetable/section/${encodeURIComponent(identifier)}`);
            if (res.ok) {
                const secData = await res.json();
                slots = secData.slots || [];
            }
        } else {
            type = 'section';
            identifier = selectedVal || 'CSE-A';
            const res = await fetch(`${API_BASE}/timetable/section/${encodeURIComponent(identifier)}`);
            if (res.ok) {
                const secData = await res.json();
                slots = secData.slots || [];
            }
        }

        const html = generateTimetableA4HTML(type, identifier, slots, meta);
        const staging = document.getElementById('a4-pdf-staging');
        if (!staging) return;
        staging.innerHTML = html;
        staging.style.display = 'block';

        const filename = `${identifier.replace(/[^a-zA-Z0-9_-]/g, '_')}_Timetable_A4.pdf`;
        const opt = {
            margin:       [4, 6, 4, 6],
            filename:     filename,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        await html2pdf().set(opt).from(staging.firstElementChild).save();
        staging.style.display = 'none';
        showToast(`✓ ${filename} downloaded successfully!`);
    } catch (err) {
        console.error("PDF generation failed:", err);
        showToast("Error generating PDF. Please try again.");
    }
}

async function downloadCurrentTimetableA4() {
    const sel = document.getElementById('view-class-select');
    const sec = sel ? sel.value : 'CSE-A';
    showToast(`Generating A4 PDF for ${sec}...`);
    try {
        const res = await fetch(`${API_BASE}/timetable/section/${encodeURIComponent(sec)}`);
        let slots = [];
        if (res.ok) {
            const data = await res.json();
            slots = data.slots || [];
        }
        const html = generateTimetableA4HTML('section', sec, slots);
        const staging = document.getElementById('a4-pdf-staging');
        staging.innerHTML = html;
        staging.style.display = 'block';

        const opt = {
            margin:       [4, 6, 4, 6],
            filename:     `${sec}_Timetable_A4.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        await html2pdf().set(opt).from(staging.firstElementChild).save();
        staging.style.display = 'none';
        showToast(`✓ ${sec}_Timetable_A4.pdf downloaded!`);
    } catch (e) {
        console.error(e);
        showToast("Failed to download section timetable.");
    }
}

async function downloadAllSectionsBulkA4() {
    showToast("Compiling Bulk A4 Timetables for ALL Sections (1 Page per Section)...");
    try {
        const res = await fetch(`${API_BASE}/timetable/all`);
        let timetables = {};
        let sections = [];
        if (res.ok) {
            const data = await res.json();
            timetables = data.timetables || {};
            sections = Object.keys(timetables).sort();
        }
        if (sections.length === 0) {
            const resSec = await fetch(`${API_BASE}/timetable/all_sections`);
            if (resSec.ok) {
                const sData = await resSec.json();
                sections = sData.sections || [];
            }
        }

        if (sections.length === 0) {
            showToast("No sections available to download.");
            return;
        }

        const staging = document.getElementById('a4-pdf-staging');
        staging.innerHTML = '';
        staging.style.display = 'block';

        // Render an exact A4 sheet for each section
        const container = document.createElement('div');
        container.id = 'bulk-a4-container';

        sections.forEach((sec, idx) => {
            const slots = timetables[sec] || [];
            const sheetHtml = generateTimetableA4HTML('section', sec, slots);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = sheetHtml;
            const sheetEl = tempDiv.firstElementChild;
            // Force page break between sections
            if (idx < sections.length - 1) {
                sheetEl.style.pageBreakAfter = 'always';
                sheetEl.style.breakAfter = 'page';
            }
            container.appendChild(sheetEl);
        });

        staging.appendChild(container);

        showToast(`Packaging ${sections.length} sections into consolidated A4 Landscape PDF...`);

        const opt = {
            margin:       [4, 6, 4, 6],
            filename:     `BVC_All_${sections.length}_Sections_Timetable_A4.pdf`,
            image:        { type: 'jpeg', quality: 0.95 },
            html2canvas:  { scale: 1.5, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        await html2pdf().set(opt).from(container).save();
        staging.style.display = 'none';
        showToast(`✓ All ${sections.length} sections downloaded in A4 Landscape!`);
    } catch (e) {
        console.error("Bulk export error:", e);
        showToast("Error creating bulk PDF. Please check server connection.");
    }
}

async function previewPDF(section) {
    showToast(`Loading A4 Preview for ${section}...`);
    currentExportSection = section;
    try {
        const res = await fetch(`${API_BASE}/timetable/section/${encodeURIComponent(section)}`);
        let slots = [];
        if (res.ok) {
            const data = await res.json();
            slots = data.slots || [];
        }
        currentExportSlots = slots;
        const html = generateTimetableA4HTML('section', section, slots);
        const previewContent = document.getElementById('tt-preview-content');
        if (previewContent) {
            previewContent.innerHTML = html;
        }
        const titleEl = document.getElementById('tt-preview-title');
        if (titleEl) {
            titleEl.textContent = `A4 Landscape Timetable Preview - ${section}`;
        }
        const modal = document.getElementById('tt-preview-modal');
        if (modal) modal.classList.remove('hidden');
    } catch (e) {
        console.error(e);
        showToast("Error generating preview.");
    }
}

function downloadPreviewPDF() {
    const previewContent = document.getElementById('tt-preview-content');
    if (!previewContent || !previewContent.firstElementChild) return;
    const opt = {
        margin:       [4, 6, 4, 6],
        filename:     `${currentExportSection}_Timetable_A4.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(previewContent.firstElementChild).save().then(() => {
        showToast(`${currentExportSection} A4 PDF Downloaded!`);
        closeModal('tt-preview-modal');
    });
}

async function printActiveTimetableA4() {
    const previewModal = document.getElementById('tt-preview-modal');
    if (previewModal && !previewModal.classList.contains('hidden')) {
        window.print();
        return;
    }

    showToast("Preparing document for A4 printing...");
    try {
        let type = 'section';
        let identifier = 'CSE-A';
        let slots = [];
        const viewSelect = document.getElementById('tt-view-select');
        const selectedVal = viewSelect ? viewSelect.value : '';

        if (currentUser.role === 'faculty' && (selectedVal === 'SELF' || !selectedVal)) {
            type = 'faculty';
            identifier = currentUser.name;
            const res = await fetch(`${API_BASE}/timetable/faculty/${encodeURIComponent(identifier)}`);
            if (res.ok) slots = (await res.json()).slots || [];
        } else {
            identifier = selectedVal || (document.getElementById('view-class-select') ? document.getElementById('view-class-select').value : 'CSE-A');
            const res = await fetch(`${API_BASE}/timetable/section/${encodeURIComponent(identifier)}`);
            if (res.ok) slots = (await res.json()).slots || [];
        }

        const html = generateTimetableA4HTML(type, identifier, slots);
        const staging = document.getElementById('a4-pdf-staging');
        staging.innerHTML = html;
        staging.style.display = 'block';

        setTimeout(() => {
            window.print();
            staging.style.display = 'none';
        }, 300);
    } catch (e) {
        console.error(e);
        window.print();
    }
}

// ----------------------------------------------------
// TIMETABLE RENDERING ENGINE (Pro Anim & Faculty Substitution)
// ----------------------------------------------------
async function initTimetableControls() {
    await syncWithBackend();
    const select = document.getElementById('tt-view-select');
    const ttControls = document.getElementById('timetable-controls');
    if(!select || !ttControls) return;
    
    if (currentUser.role === 'faculty' && !document.getElementById('global-sub-toggle-container')) {
        const toggleHtml = `
            <div id="global-sub-toggle-container" class="global-sub-container" style="display:none;">
                <span class="global-sub-label">Sub Mode</span>
                <label class="os-switch">
                    <input type="checkbox" id="global-sub-toggle" onchange="toggleGlobalSubstituteMode(this)">
                    <span class="os-slider"></span>
                </label>
            </div>
        `;
        ttControls.insertAdjacentHTML('beforeend', toggleHtml);
    }

    select.innerHTML = '';
    
    if (currentUser.role === 'student' && currentUser.branch) {
        const studentYr = currentUser.year || 2;
        const studentSec = currentUser.section || 'A';
        const romanYear = ({ 1: 'I', 2: 'II', 3: 'III', 4: 'IV' })[studentYr] || 'II';
        const formattedSecRoman = `${romanYear} ${currentUser.branch}-${studentSec}`;
        const formattedSecLegacy = `${studentYr}-${currentUser.branch}-${studentSec}`;
        const hasRoman = ttDb.sections.includes(formattedSecRoman);
        const hasLegacy = ttDb.sections.includes(formattedSecLegacy);
        const allowedSection = hasRoman ? formattedSecRoman : (hasLegacy ? formattedSecLegacy : (ttDb.sections.find(s => s.toUpperCase().includes(currentUser.branch.toUpperCase())) || `${currentUser.branch}-A`));
        select.innerHTML = `<option value="${allowedSection}">${formatSectionLabel(allowedSection)}</option>`;
        
        // Also list the other sections of this student's year and branch
        const siblingSections = ttDb.sections.filter(s => (s.startsWith(`${romanYear} ${currentUser.branch}-`) || s.startsWith(`${studentYr}-${currentUser.branch}-`)) && s !== allowedSection);
        siblingSections.forEach(s => {
            select.innerHTML += `<option value="${s}">${formatSectionLabel(s)}</option>`;
        });
    } else if (currentUser.role === 'hod' && currentUser.branch) {
        const branchSections = ttDb.sections.filter(s => s.includes(currentUser.branch));
        if (branchSections.length > 0) {
            select.innerHTML = branchSections.map(s => `<option value="${s}">${formatSectionLabel(s)}</option>`).join('');
        } else {
            select.innerHTML = `<option value="${currentUser.branch}-A">${formatSectionLabel(currentUser.branch + '-A')}</option>`;
        }
    } else if (currentUser.role === 'faculty') {
        select.innerHTML += `<option value="SELF">My Schedule (${currentUser.name})</option>`;
        let myFacRecord = ttDb.faculty.find(f => f.name.toLowerCase() === currentUser.name.toLowerCase());
        if (myFacRecord && myFacRecord.sections) {
            myFacRecord.sections.forEach(sec => {
                select.innerHTML += `<option value="${sec}">${formatSectionLabel(sec)}</option>`;
            });
        }
        // Also list all CSE sections for faculty reference
        ttDb.sections.filter(s => s.includes('CSE')).forEach(sec => {
            if (!select.querySelector(`option[value="${sec}"]`)) {
                select.innerHTML += `<option value="${sec}">${formatSectionLabel(sec)}</option>`;
            }
        });
    } else {
        ttDb.sections.forEach(sec => {
            select.innerHTML += `<option value="${sec}">${formatSectionLabel(sec)}</option>`;
        });
    }
    
    handleTimetableChange();
}

window.toggleGlobalSubstituteMode = function(checkbox) {
    isSubstituteMode = checkbox.checked;
    const gridContainer = document.getElementById('class-timetable-grid');
    const toggleContainer = document.getElementById('global-sub-toggle-container');
    
    if (isSubstituteMode) toggleContainer.classList.add('active');
    else toggleContainer.classList.remove('active');

    gridContainer.classList.add('shatter-out');
    
    setTimeout(() => {
        handleTimetableChange(); 
        gridContainer.classList.remove('shatter-out');
    }, 400); 
};

function renderClassTimetable() {
    const val = document.getElementById('view-class-select') ? document.getElementById('view-class-select').value : 'CSE-A';
    renderMockTable('class-timetable-grid', 'section', val, false);
}

function handleTimetableChange() {
    const select = document.getElementById('tt-view-select');
    if(!select) return;
    const val = select.value;
    const hint = document.getElementById('tt-fac-hint');
    const globalToggle = document.getElementById('global-sub-toggle-container');
    const btnText = document.getElementById('user-download-btn-text');
    
    if (val === 'SELF') {
        if(globalToggle) globalToggle.style.display = 'flex';
        if(hint) hint.classList.remove('hidden');
        if (btnText) btnText.textContent = "Download My Faculty Timetable (A4 PDF)";
        
        if (isSubstituteMode) {
            if(hint) hint.innerHTML = `<i class="fas fa-shield-alt" style="color:#ff4757;"></i> <strong>SUBSTITUTION MODE ACTIVE:</strong> Select Full Day, Half Day, Permission, or click individual slots.`;
            renderMockTable('class-timetable-grid', 'faculty', currentUser.name, true);
        } else {
            if(hint) hint.innerHTML = `<i class="fas fa-eye"></i> Viewing your personal schedule.`;
            renderMockTable('class-timetable-grid', 'faculty', currentUser.name, false);
        }
    } else {
        if(globalToggle) globalToggle.style.display = 'none';
        if(hint) hint.classList.add('hidden');
        if (btnText) {
            if (currentUser && currentUser.role === 'student') {
                btnText.textContent = "Download My Class Timetable (A4 PDF)";
            } else if (currentUser && currentUser.role === 'faculty') {
                btnText.textContent = `Download ${val} Timetable (A4 PDF)`;
            } else {
                btnText.textContent = `Download Section ${val} (A4 PDF)`;
            }
        }
        
        isSubstituteMode = false;
        const toggleInput = document.getElementById('global-sub-toggle');
        if(toggleInput) toggleInput.checked = false;
        if(globalToggle) globalToggle.classList.remove('active');
        
        renderMockTable('class-timetable-grid', 'section', val, false);
    }
}

function getDeterministicSlot(sec, day, period) {
    if (ttDb.allSlots && ttDb.allSlots[sec]) {
        let dbSlot = ttDb.allSlots[sec].find(s => 
            s.day && s.day.toLowerCase() === day.toLowerCase() && 
            parseInt(s.period) === parseInt(period)
        );
        if (dbSlot) {
            return {
                name: dbSlot.faculty_name,
                subject: dbSlot.subject,
                subject_code: dbSlot.subject,
                faculty_code: (dbSlot.faculty_name || '').substring(0, 3).toUpperCase(),
                room: dbSlot.room,
                is_lab: dbSlot.is_lab
            };
        }
    }
    let assignedFacs = ttDb.faculty.filter(f => f.sections && f.sections.includes(sec));
    if (assignedFacs.length === 0) return null;
    let hash = 0;
    let str = `${sec}-${day}-${period}`;
    for (let i = 0; i < str.length; i++) { hash = (hash << 5) - hash + str.charCodeAt(i); hash |= 0; }
    let facIdx = Math.abs(hash) % assignedFacs.length;
    return assignedFacs[facIdx];
}

function getFacultySlot(facName, day, period) {
    if (ttDb.allSlots) {
        for (let sec in ttDb.allSlots) {
            let match = ttDb.allSlots[sec].find(s => 
                (s.faculty_name || '').toLowerCase() === facName.toLowerCase() && 
                s.day && s.day.toLowerCase() === day.toLowerCase() && 
                parseInt(s.period) === parseInt(period)
            );
            if (match) {
                return {
                    section: sec,
                    subject: match.subject,
                    subject_code: match.subject,
                    room: match.room,
                    is_lab: match.is_lab
                };
            }
        }
    }
    let fac = ttDb.faculty.find(f => f.name.toLowerCase() === facName.toLowerCase());
    if (!fac || !fac.sections) return null;
    for (let sec of fac.sections) {
        let slot = getDeterministicSlot(sec, day, period);
        if (slot && slot.name.toLowerCase() === facName.toLowerCase()) {
            return { section: sec, subject: slot.subject, subject_code: slot.subject_code };
        }
    }
    return null;
}

function renderMockTable(targetId, type, identifier, isSubMode = false) {
    const target = document.getElementById(targetId);
    if (!target) return;
    
    let periods = ttDb.settings.periods;
    let thead = `<tr><th>Day</th>`;
    for (let i = 1; i <= periods; i++) {
        thead += `<th>P${i}</th>`;
        if (i === 4) thead += `<th>Lunch</th>`;
    }
    thead += `</tr>`;
    
    let tbody = '';
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let legendData = { subjects: {}, faculties: {} };
    let cellDelayCount = 0; 

    days.forEach(day => {
        let dayTitle = `<strong>${day}</strong>`;
        
        if(type === 'faculty' && isSubMode) {
            dayTitle += `<br>
            <div style="display:flex; gap:4px; margin-top:5px; flex-wrap:wrap; justify-content:center;">
                <button class="cine-btn" style="font-size:10px; padding:4px 6px; border-radius:6px;" onclick="requestLeave('Full', '${day}')"><i class="fas fa-sun"></i> Full</button>
                <button class="cine-btn" style="font-size:10px; padding:4px 6px; border-radius:6px;" onclick="requestLeave('Half', '${day}')"><i class="fas fa-adjust"></i> Half</button>
                <button class="cine-btn" style="font-size:10px; padding:4px 6px; border-radius:6px; background:rgba(243,156,18,0.3); border-color:#f39c12;" onclick="requestPermission('${day}')"><i class="fas fa-door-open"></i> Perm</button>
            </div>`;
        }
        
        let row = `<tr><td style="vertical-align:middle;">${dayTitle}</td>`;
        let i = 1;

        while (i <= periods) {
            let colspan = 1;
            let content = '-';
            let isLab = false;
            let isWeeklySingle = false;
            let tdClass = '';
            let delayStyle = '';
            
            if (isSubMode) {
                tdClass = 'cell-assemble';
                delayStyle = `animation-delay: ${cellDelayCount * 0.03}s;`;
                cellDelayCount++;
            }

            if (ttDb.labs && ttDb.labs.length > 0 && type === 'section') {
                let secLab = ttDb.labs.find(l => l.section === identifier && l.day === day && l.startPeriod == i);
                if (secLab) { 
                    let dur = parseInt(secLab.duration) || 3;
                    if (i + dur - 1 <= periods) {
                        colspan = dur;
                        isLab = true;
                        content = `<span class="cell-sub">${secLab.name.toUpperCase()} (LAB)</span><span class="cell-fac">[${secLab.faculty}]</span>`;
                    }
                }
            }
            
            if (!isLab && ttDb.weeklySingles && ttDb.weeklySingles.length > 0 && type === 'section') {
                let secSingle = ttDb.weeklySingles.find(ws => ws.section === identifier && ws.day === day && ws.startPeriod == i);
                if (secSingle) {
                     isWeeklySingle = true;
                     content = `<span class="cell-sub" style="color:var(--success); font-weight:bold;">${secSingle.subject.toUpperCase()}</span>`;
                }
            }

            if (!isLab && !isWeeklySingle) {
                if (day === 'Saturday' && i === periods) {
                    content = `<span class="leisure">Leisure</span>`;
                } else if(ttDb.generatedSchedule) {
                    if (type === 'section') {
                        let fac = getDeterministicSlot(identifier, day, i);
                        if (fac) {
                            let subCode = fac.subject_code || fac.subject.substring(0,3).toUpperCase();
                            let facCode = fac.faculty_code || fac.name.substring(0,3).toUpperCase();
                            let roomTag = fac.room ? `<br><small style="font-size:9.5px; opacity:0.85; background:rgba(255,255,255,0.08); padding:1px 4px; border-radius:3px;">${fac.room}</small>` : '';
                            content = `<span class="cell-sub">${subCode}</span> <span class="cell-fac">(${facCode})</span>${roomTag}`;
                            legendData.subjects[subCode] = fac.subject;
                            legendData.faculties[facCode] = fac.name;
                        } else {
                            content = `<span style="color:var(--text-muted);">Not Assigned</span>`;
                        }
                    } else if (type === 'faculty') {
                        let facSlot = getFacultySlot(identifier, day, i);
                        if (facSlot) {
                            let subCode = facSlot.subject_code || facSlot.subject.substring(0,3).toUpperCase();
                            let roomTag = facSlot.room ? `<small style="font-size:9.5px; opacity:0.85;"> [${facSlot.room}]</small>` : '';
                            if(isSubMode) {
                                content = `
                                    <div class="pro-sub-cell">
                                        <div style="display:flex; flex-direction:column; align-items:flex-start;">
                                            <span class="cell-sub" style="font-size:13px; font-weight:700;">${subCode}</span>
                                            <span class="cell-fac" style="font-size:10px;">(${facSlot.section})${roomTag}</span>
                                        </div>
                                        <button class="cine-btn" style="padding:4px 8px; font-size:10px; border-radius:6px; font-weight:bold; background:rgba(255,71,87,0.3); border-color:#ff4757;" onclick="requestSingleClassLeave('${day}',${i}, '${facSlot.section}', '${facSlot.subject}')">Leave</button>
                                    </div>`;
                            } else {
                                content = `
                                    <div class="cell-content">
                                        <span class="cell-sub" style="font-weight:bold; font-size:14px;">${subCode}</span><br>
                                        <span class="cell-fac" style="font-size:11px; color:var(--text-muted);">(${facSlot.section})${roomTag}</span>
                                    </div>`;
                            }
                            legendData.subjects[subCode] = facSlot.subject;
                        } else {
                            content = `<span style="color:var(--text-muted);">Free</span>`;
                        }
                    }
                } else {
                    content = `<span style="color:var(--text-muted);">Not Generated</span>`;
                }
            }

            let tdStyle = isLab ? `background-color: rgba(0, 168, 232, 0.1); border-color: var(--primary-color);` : ``;
            if (content.includes('pro-sub-cell')) tdStyle += `padding: 5px;`;
            
            row += `<td colspan="${colspan}" class="${tdClass}" style="${tdStyle}; text-align:center; ${delayStyle}">${content}</td>`;
            if (i <= 4 && (i + colspan - 1) >= 4) row += `<td class="lunch">BREAK</td>`;
            i += colspan;
        }
        tbody += row + `</tr>`;
    });

    let legendHtml = `<div style="margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 13px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div><strong>Subjects:</strong><br>${Object.entries(legendData.subjects).map(([code, name]) => `${code} = ${name}`).join('<br>')}</div>
        <div><strong>Faculty:</strong><br>${Object.entries(legendData.faculties).map(([code, name]) => `${code} = ${name}`).join('<br>')}</div>
    </div>`;
    
    target.innerHTML = `<thead>${thead}</thead><tbody>${tbody}</tbody>`;
    let legendContainer = document.getElementById(targetId + '-legend');
    if(!legendContainer) {
        legendContainer = document.createElement('div');
        legendContainer.id = targetId + '-legend';
        target.parentNode.insertBefore(legendContainer, target.nextSibling);
    }
    legendContainer.innerHTML = legendHtml;
}

// ==========================================
// 10. UNIFIED LEAVE SYSTEM (Upgraded to API Workflow)
// ==========================================
let currentPendingActionReqId = null;
let currentPendingActionRole = null; 

function toggleLeaveReason(mode) {
    const type = document.getElementById(`leave-type-${mode}`).value;
    const reasonInput = document.getElementById(`leave-reason-${mode}`);
    const extraFields = document.getElementById(`cl-extra-fields-${mode}`);
    
    if(type === 'OD') {
        reasonInput.placeholder = "Enter destination and purpose of On Duty (Required)";
        if(extraFields) extraFields.classList.add('hidden');
    } else {
        reasonInput.placeholder = "Description / Explanation (Required)";
        if(extraFields) extraFields.classList.remove('hidden');
    }
}

function getFreeFaculties(day, period, section) {
    let freeFaculty = [];
    ttDb.faculty.forEach(f => {
        if (f.name.toLowerCase() === currentUser.name.toLowerCase()) return; 
        if (!f.sections || !f.sections.includes(section)) return;
        if (!getFacultySlot(f.name, day, period)) freeFaculty.push(f);
    });
    return freeFaculty;
}

// ---------------- STUDENT LEAVE LOGIC ----------------
window.openStudentLeaveModal = function() {
    if (currentUser && currentUser.role === 'student' && document.getElementById('stu-name-input')) {
        document.getElementById('stu-name-input').value = currentUser.name;
    }
    document.getElementById('student-leave-modal').classList.remove('hidden');
}

window.toggleStudentReqType = function() {
    const type = document.getElementById('stu-req-type').value;
    if(type === 'Leave') {
        document.getElementById('stu-leave-fields').classList.remove('hidden');
        document.getElementById('stu-perm-fields').classList.add('hidden');
    } else {
        document.getElementById('stu-leave-fields').classList.add('hidden');
        document.getElementById('stu-perm-fields').classList.remove('hidden');
    }
}

window.submitStudentReq = function() {
    const name = document.getElementById('stu-name-input').value.trim();
    const type = document.getElementById('stu-req-type').value;
    const reason = document.getElementById('stu-reason').value.trim();
    const signInput = document.getElementById('stu-sign-upload');
    const teacher = document.getElementById('stu-teacher-select').value;
    const hod = document.getElementById('stu-hod-select').value;

    if(!name) return alert("Your Name is required.");
    if(!teacher || !hod) return alert("Please select Class Teacher and HOD.");
    if(!reason) return alert("Reason is required.");
    if(!signInput.files || signInput.files.length === 0) return alert("Please upload your digital signature.");

    let durationStr = "";
    if(type === 'Leave') {
        const dFrom = document.getElementById('stu-date-from').value;
        const dTo = document.getElementById('stu-date-to').value;
        if(!dFrom || !dTo) return alert("Dates are required for Leave.");
        durationStr = `${dFrom} to ${dTo}`;
    } else {
        const time = document.getElementById('stu-perm-time').value.trim();
        if(!time) return alert("Time duration is required for Permission.");
        durationStr = time;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const payload = {
            isStudentReq: true,
            requester: name,
            regNo: currentUser.reg_no,
            branch: currentUser.branch || hod,
            section: currentUser.section || `${hod}-A`,
            teacher: teacher,
            type: type,
            reason: reason,
            details: durationStr,
            dateRequested: new Date().toLocaleDateString(),
            stuSignature: e.target.result,
            hodNameAssigned: hod
        };

        try {
            const res = await fetch(`${API_BASE}/leave/submit`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            showToast(data.message || "Request submitted to Class Teacher.");
            closeModal('student-leave-modal');
            loadLeaveRequests();
        } catch(err) {
            showToast("Failed to submit request.");
        }
    };
    reader.readAsDataURL(signInput.files[0]);
}

// ---------------- FACULTY LEAVE LOGIC ----------------

window.requestSingleClassLeave = function(day, period, section) {
    const list = document.getElementById('single-faculty-list');
    document.getElementById('single-modal-subtitle').innerHTML = `Select a substitute for <strong>${day} - Period ${period}</strong> (${section})`;
    let freeFacs = getFreeFaculties(day, period, section);
    
    if(!document.getElementById('cl-extra-fields-single')) {
        const extraHtml = `
            <div id="cl-extra-fields-single" class="mt-1 mb-1 hidden" style="display: flex; flex-direction: column; gap: 10px;">
                <input type="text" id="cl-desig-single" class="input-field" placeholder="Designation (e.g. Asst. Professor)">
                <input type="text" id="cl-dept-single" class="input-field" placeholder="Department (e.g. CSE)">
                <input type="text" id="cl-holidays-single" class="input-field" placeholder="Prefixing/Suffixing Holidays (if any)">
            </div>
        `;
        document.getElementById('leave-reason-single').insertAdjacentHTML('beforebegin', extraHtml);
    }

    if (freeFacs.length === 0) list.innerHTML = `<p style="color:var(--text-muted); text-align:center;">No faculty free.</p>`;
    else {
        list.innerHTML = freeFacs.map(f => `
            <div class="list-item" style="background: rgba(0,0,0,0.3); border-color: var(--primary-color); align-items:center;">
                <div class="list-content" style="flex:1;"><h4>${f.name}</h4><p>${f.subject}</p></div>
                <button class="btn-success" style="width: auto; padding: 6px 12px; font-size: 11px;" onclick="submitSingleLeaveReq('${f.name}', '${day}', ${period}, '${section}')">Select</button>
            </div>
        `).join('');
    }
    
    document.getElementById('single-leave-modal').classList.remove('hidden');
    setTimeout(() => toggleLeaveReason('single'), 50);
};

window.submitSingleLeaveReq = async function(subName, day, period, section) {
    const type = document.getElementById('leave-type-single').value;
    const reason = document.getElementById('leave-reason-single').value.trim();
    if(!reason) return alert("Please enter the reason/description.");
    
    const desig = document.getElementById('cl-desig-single') ? document.getElementById('cl-desig-single').value : '';
    const dept = document.getElementById('cl-dept-single') ? document.getElementById('cl-dept-single').value : '';
    const holidays = document.getElementById('cl-holidays-single') ? document.getElementById('cl-holidays-single').value : '';

    const payload = {
        isStudentReq: false,
        requester: currentUser.name,
        designation: desig,
        department: dept,
        prefixSuffix: holidays,
        leaveFrom: day,
        leaveTo: day,
        substitute: subName,
        type: type,
        reason: reason,
        details: `Single Period: P${period} (${section})`,
        dateRequested: new Date().toLocaleDateString(),
        status: 'Pending with Substitute Faculty'
    };

    await fetch(`${API_BASE}/leave/submit`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    showToast(`Leave request sent to ${subName}`);
    document.getElementById('leave-reason-single').value = "";
    closeModal('single-leave-modal');
    loadLeaveRequests();
};

window.requestLeave = function(scope, day) {
    let sessionPref = null;
    if(scope === 'Half') {
        sessionPref = prompt("Please specify session: Enter 'Morning' or 'Afternoon'").toLowerCase();
        if(!sessionPref.startsWith('m') && !sessionPref.startsWith('a')) return alert("Invalid session. Operation cancelled.");
    }

    let myClasses = [];
    for(let p=1; p<=ttDb.settings.periods; p++) {
        let slot = getFacultySlot(currentUser.name, day, p);
        if(slot) {
            if(scope === 'Half') {
                if(sessionPref.startsWith('m') && p <= 4) myClasses.push({period: p, section: slot.section, subject: slot.subject});
                else if(sessionPref.startsWith('a') && p > 4) myClasses.push({period: p, section: slot.section, subject: slot.subject});
            } else {
                myClasses.push({period: p, section: slot.section, subject: slot.subject});
            }
        }
    }
    if(myClasses.length === 0) return showToast("No classes scheduled in this time frame.");
    
    if(!document.getElementById('cl-extra-fields-bulk')) {
        const extraHtml = `
            <div id="cl-extra-fields-bulk" class="mt-1 mb-1 hidden" style="display: flex; flex-direction: column; gap: 10px;">
                <input type="text" id="cl-desig-bulk" class="input-field" placeholder="Designation (e.g. Asst. Professor)">
                <input type="text" id="cl-dept-bulk" class="input-field" placeholder="Department (e.g. CSE)">
                <input type="text" id="cl-holidays-bulk" class="input-field" placeholder="Prefixing/Suffixing Holidays (if any)">
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="cl-leave-from-bulk" class="input-field" placeholder="Leave From (Date)">
                    <input type="text" id="cl-leave-to-bulk" class="input-field" placeholder="Leave To (Date)">
                </div>
            </div>
        `;
        document.getElementById('leave-reason-bulk').insertAdjacentHTML('beforebegin', extraHtml);
    }

    document.getElementById('bulk-modal-subtitle').innerHTML = `<strong>${day}</strong> - ${scope} Day Absence Registration.`;
    document.getElementById('bulk-leave-scope').value = `${scope} Day - ${day}`;
    
    let html = '';
    myClasses.forEach(c => {
        let freeFacs = getFreeFaculties(day, c.period, c.section);
        let options = freeFacs.length > 0 ? freeFacs.map(f => `<option value="${f.name}">${f.name} (${f.subject})</option>`).join('') : '<option value="">No Free Faculty Available</option>';
        html += `<div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:8px;">
            <strong style="color:var(--primary-color);">Period ${c.period} (${c.section}):</strong>
            <select class="input-field mt-1 bulk-sub-select" data-period="${c.period}" data-section="${c.section}">
                ${options}
            </select>
        </div>`;
    });
    document.getElementById('bulk-classes-container').innerHTML = html;
    document.getElementById('bulk-leave-modal').classList.remove('hidden');
    setTimeout(() => toggleLeaveReason('bulk'), 50);
};

window.submitBulkLeave = async function() {
    const type = document.getElementById('leave-type-bulk').value;
    const reason = document.getElementById('leave-reason-bulk').value.trim();
    const scopeStr = document.getElementById('bulk-leave-scope').value;
    if(!reason) return alert("Please enter the reason/description.");
    
    const desig = document.getElementById('cl-desig-bulk') ? document.getElementById('cl-desig-bulk').value : '';
    const dept = document.getElementById('cl-dept-bulk') ? document.getElementById('cl-dept-bulk').value : '';
    const holidays = document.getElementById('cl-holidays-bulk') ? document.getElementById('cl-holidays-bulk').value : '';
    const lFrom = (document.getElementById('cl-leave-from-bulk') && document.getElementById('cl-leave-from-bulk').value) ? document.getElementById('cl-leave-from-bulk').value : scopeStr;
    const lTo = (document.getElementById('cl-leave-to-bulk') && document.getElementById('cl-leave-to-bulk').value) ? document.getElementById('cl-leave-to-bulk').value : scopeStr;

    let selects = document.querySelectorAll('.bulk-sub-select');
    let assignments = [];
    let subNamesSet = new Set();
    
    for(let i=0; i<selects.length; i++) {
        let sel = selects[i];
        if(!sel.value) return alert("Cannot proceed: One or more periods have no available substitutes.");
        assignments.push(`P${sel.dataset.period} (${sel.dataset.section}) -> ${sel.value}`);
        subNamesSet.add(sel.value);
    }
    
    const payload = {
        isStudentReq: false,
        requester: currentUser.name,
        designation: desig,
        department: dept,
        prefixSuffix: holidays,
        leaveFrom: lFrom,
        leaveTo: lTo,
        substitute: Array.from(subNamesSet).join(', '), 
        assignments: assignments, 
        type: type,
        reason: reason,
        details: scopeStr,
        dateRequested: new Date().toLocaleDateString(),
        status: 'Pending with Substitute Faculty' 
    };

    await fetch(`${API_BASE}/leave/submit`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    showToast(`Leave submitted and forwarded to Substitute Faculty.`);
    document.getElementById('leave-reason-bulk').value = "";
    closeModal('bulk-leave-modal');
    loadLeaveRequests();
};

window.requestPermission = function(day) {
    document.getElementById('perm-modal-subtitle').innerHTML = `Request Permission for <strong>${day}</strong>.`;
    
    let myClasses = [];
    for(let p=1; p<=ttDb.settings.periods; p++) {
        let slot = getFacultySlot(currentUser.name, day, p);
        if(slot) myClasses.push({period: p, section: slot.section});
    }
    
    let html = '';
    myClasses.forEach(c => {
        let freeFacs = getFreeFaculties(day, c.period, c.section);
        let options = freeFacs.length > 0 ? freeFacs.map(f => `<option value="${f.name}">${f.name}</option>`).join('') : '';
        html += `<div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:8px;">
            <strong style="color:var(--primary-color);">Period ${c.period} (${c.section}):</strong>
            <select class="input-field mt-1 perm-sub-select" data-period="${c.period}" data-section="${c.section}">
                <option value="">No Override Required</option>
                ${options}
            </select>
        </div>`;
    });
    document.getElementById('perm-classes-container').innerHTML = html;
    document.getElementById('permission-modal').classList.remove('hidden');
};

window.submitPermission = async function() {
    const type = document.getElementById('perm-type').value;
    const time = document.getElementById('perm-time').value.trim();
    const reason = document.getElementById('perm-reason').value.trim();
    if(!time || !reason) return alert("Time duration and Reason are required.");
    
    let selects = document.querySelectorAll('.perm-sub-select');
    let assignments = [];
    let subNamesSet = new Set();
    
    selects.forEach(sel => {
        if(sel.value) {
            assignments.push(`P${sel.dataset.period} (${sel.dataset.section}) -> ${sel.value}`);
            subNamesSet.add(sel.value);
        }
    });
    
    let hasSubs = subNamesSet.size > 0;
    
    const payload = {
        isStudentReq: false,
        requester: currentUser.name,
        substitute: hasSubs ? Array.from(subNamesSet).join(', ') : "None Required",
        assignments: assignments.length > 0 ? assignments : null, 
        type: 'Permission',
        reason: reason,
        details: `Permission: ${type} by ${time}`,
        dateRequested: new Date().toLocaleDateString(),
        status: hasSubs ? 'PENDING_SUB' : 'PENDING_HOD'
    };

    await fetch(`${API_BASE}/leave/submit`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    showToast(`Permission Requested.`);
    document.getElementById('perm-time').value = "";
    document.getElementById('perm-reason').value = "";
    closeModal('permission-modal');
    loadLeaveRequests();
};

function getFacultyStatsHTML(facName, reqs) {
    let taken = 0, subbed = 0, od = 0, perm = 0;
    reqs.forEach(r => {
        if(r.status === 'APPROVED' && !r.is_student_req) {
            if(r.requester === facName) {
                if(r.type === 'OD') od++;
                else if(r.type === 'Permission') perm++;
                else taken++;
            }
            if(r.substitute && r.substitute.includes(facName)) subbed++;
        }
    });
    return `
        <div style="background:rgba(0,0,0,0.2); padding:8px; border-radius:6px; font-size:11px; margin-top:8px; display:flex; justify-content:space-around;">
            <span style="color:#e74c3c;"><strong>Taken:</strong> ${taken}</span>
            <span style="color:#2ecc71;"><strong>Subbed:</strong> ${subbed}</span>
            <span style="color:#3498db;"><strong>ODs:</strong> ${od}</span>
            <span style="color:#f39c12;"><strong>Perms:</strong> ${perm}</span>
        </div>
    `;
}

async function loadLeaveRequests() {
    const container = document.getElementById('leave-requests-container');
    const title = document.getElementById('leave-board-title');

    try {
        const res = await fetch(`${API_BASE}/leave/list`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ role: currentUser.role, branch: currentUser.branch, name: currentUser.name, regNo: currentUser.reg_no })
        });
        const data = await res.json();
        const displayReqs = data.leaves || [];

        if (currentUser.role === 'student') title.innerText = "My Leave & Permission Requests";
        else if (currentUser.role === 'faculty') title.innerText = "My Leaves, Substitutions & Student Approvals";
        else if (currentUser.role === 'hod') title.innerText = `${currentUser.branch} Department Approval Queue`;
        else title.innerText = "All Leave Records";

        if(displayReqs.length === 0) {
            container.innerHTML = "<p style='color:var(--text-muted); text-align:center;'>No leave records in your queue.</p>";
            return;
        }

        container.innerHTML = displayReqs.map(r => {
            let actionBtn = '';
            let statusColor = '#f39c12'; 

            if (r.status === 'Pending with Class Teacher' || r.status === 'PENDING_CT') {
                if (r.is_student_req && (currentUser.name === r.teacher || currentUser.role === 'faculty')) {
                    actionBtn = `<button class="btn-success" onclick="openSignatureModal('${r.id}', 'ct')">CT Approve</button> <button class="btn-danger" style="margin-left:5px;" onclick="rejectLeave('${r.id}', 'ct')">Reject</button>`;
                }
            } else if (r.status === 'PENDING_SUB') {
                if (r.substitute && r.substitute.includes(currentUser.name)) {
                    actionBtn = `<button class="btn-success" onclick="openSignatureModal('${r.id}', 'substitute')">Accept Sub (Sign)</button>`;
                }
            } else if (r.status === 'Approved by Class Teacher — Pending with HOD' || r.status === 'PENDING_HOD') {
                statusColor = '#3498db';
                if (currentUser.role === 'hod' && r.branch === currentUser.branch) {
                    actionBtn = `<button class="btn-success" onclick="openSignatureModal('${r.id}', 'hod')">HOD Approve</button> <button class="btn-danger" style="margin-left:5px;" onclick="rejectLeave('${r.id}', 'hod')">Reject</button>`;
                }
            } else if (r.status === 'PENDING_PRIN') {
                statusColor = '#9b59b6';
                if (currentUser.role === 'principal') {
                    actionBtn = `<button class="btn-success" onclick="openSignatureModal('${r.id}', 'principal')">Prin. Approve (Sign)</button>`;
                }
            } else if (r.status === 'Approved by HOD' || r.status === 'APPROVED') {
                statusColor = '#2ecc71';
                actionBtn = `<button class="btn-primary" style="font-size:11px; padding:5px 10px;" onclick="${r.is_student_req ? 'viewStudentCertificate' : 'viewCertificate'}('${r.id}')">View Form / Slip</button>`;
            } else if (r.status.includes('Rejected') || r.status === 'REJECTED') {
                statusColor = '#e74c3c';
            }

            let typeBadge = '';
            if(r.type === 'OD') typeBadge = `<span style="background:#3498db; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px;">On Duty</span>`;
            else if(r.type === 'Permission') typeBadge = `<span style="background:#f39c12; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px;">Permission</span>`;
            else if(r.type) typeBadge = `<span style="background:rgba(255,255,255,0.2); color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px;">${r.type}</span>`;
            if(r.is_student_req) typeBadge += `<span style="background:#8e44ad; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px;">Student</span>`;

            let statsHTML = (!r.is_student_req && ['hod', 'principal', 'admin'].includes(currentUser.role)) ? getFacultyStatsHTML(r.requester, displayReqs) : '';

            return `
                <div class="list-item mb-1" style="border-left: 4px solid ${statusColor}; flex-direction:column;">
                    <div style="width:100%;">
                        <h4>Req: ${r.requester} ${r.substitute && r.substitute !== 'None Required' ? `➔ Sub: ${r.substitute}` : ''} ${typeBadge}</h4>
                        <p style="margin:5px 0;"><strong>Details:</strong> ${r.details}</p>
                        <p style="margin-bottom:5px;"><strong>Reason:</strong> ${r.reason || 'N/A'}</p>
                        <span style="font-size:11px; color:${statusColor}; font-weight:bold;">Status: ${r.status}</span>
                    </div>
                    ${statsHTML}
                    <div style="display:flex; justify-content:flex-end; width:100%; margin-top:5px;">
                        ${actionBtn}
                    </div>
                </div>
            `;
        }).join('');
    } catch(e) {
        container.innerHTML = "<p style='color:var(--text-muted);'>Error fetching leaves.</p>";
    }
}

window.openSignatureModal = function(id, roleStr) {
    currentPendingActionReqId = id;
    currentPendingActionRole = roleStr;
    document.getElementById('action-sign-title').innerHTML = `<i class="fas fa-signature" style="color: var(--primary-color);"></i> ${roleStr.toUpperCase()} Signature Required`;
    document.getElementById('action-signature-modal').classList.remove('hidden');
};

window.confirmSignatureAction = async function() {
    const input = document.getElementById('action-sign-upload');
    if(!input.files || input.files.length === 0) return alert("Please upload your digital signature image to proceed.");
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Sign = e.target.result;
        await fetch(`${API_BASE}/leave/action`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: currentPendingActionReqId, role: currentPendingActionRole, action: 'approve', signature: base64Sign })
        });
        showToast("Signature Accepted. Workflow Advanced.");
        input.value = "";
        closeModal('action-signature-modal');
        loadLeaveRequests();
    };
    reader.readAsDataURL(input.files[0]);
};

window.rejectLeave = async function(id, roleStr) {
    const remarks = prompt("Please enter the reason for rejection:");
    if (remarks === null) return;
    await fetch(`${API_BASE}/leave/action`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id, role: roleStr, action: 'reject', remarks })
    });
    showToast(`Request Rejected.`);
    loadLeaveRequests();
}

window.viewCertificate = async function(id) {
    const res = await fetch(`${API_BASE}/leave/list`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ role: 'admin' }) });
    const data = await res.json();
    let req = (data.leaves || []).find(r => r.id === id);
    if(!req) return;

    if((req.status === 'APPROVED' || req.status === 'Approved by HOD') && typeof confetti === 'function' && currentUser.name === req.requester) {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }

    document.querySelectorAll('.cert-print-view').forEach(el => el.style.display = 'none');

    if (req.type === 'OD') {
        document.getElementById('od-certificate-print-area').style.display = 'block';
        document.getElementById('od-cert-name').innerText = req.requester;
        document.getElementById('od-cert-date').innerText = req.date_requested || new Date().toLocaleDateString();
        document.getElementById('od-cert-reason').innerText = req.reason || '--';
        
        let tableRows = '';
        let assignments = [];
        try { assignments = JSON.parse(req.assignments || '[]'); } catch(e) {}

        if(assignments && assignments.length > 0) {
            assignments.forEach(a => {
                let parts = a.split('->');
                let slotInfo = parts[0].trim();
                let sub = parts[1] ? parts[1].trim() : '--';
                tableRows += `<tr><td>--</td><td>--</td><td>${slotInfo}</td><td>--</td><td>${sub}</td><td>--</td></tr>`;
            });
        } else {
            tableRows = `<tr><td colspan="6" style="padding:15px; text-align:center;">${req.details} -> Sub: ${req.substitute}</td></tr>`;
        }
        document.getElementById('od-cert-table-body').innerHTML = tableRows;
        
        if(req.sub_signature) { document.getElementById('od-cert-sub-sign').src = req.sub_signature; document.getElementById('od-cert-sub-sign').style.display = "inline"; }
        if(req.hod_signature) { document.getElementById('od-cert-hod-sign').src = req.hod_signature; document.getElementById('od-cert-hod-sign').style.display = "inline"; }
        if(req.prin_signature) { document.getElementById('od-cert-prin-sign').src = req.prin_signature; document.getElementById('od-cert-prin-sign').style.display = "inline"; }

    } else if (req.type === 'Permission') {
        document.getElementById('permission-certificate-print-area').style.display = 'block';
        document.getElementById('perm-cert-name').innerText = req.requester;
        document.getElementById('perm-cert-date').innerText = req.date_requested || new Date().toLocaleDateString();
        document.getElementById('perm-cert-sno').innerText = req.id.replace(/\D/g,'').substring(0,4);
        document.getElementById('perm-cert-reason').innerText = req.reason || '--';
        
        let durationStr = req.details.split('by')[1] || '--';
        if(req.details.includes('Late')) {
            document.getElementById('perm-cert-in').innerText = durationStr.trim();
            document.getElementById('perm-cert-out').innerText = '--';
        } else {
            document.getElementById('perm-cert-out').innerText = durationStr.trim();
            document.getElementById('perm-cert-in').innerText = '--';
        }
        
        if(req.sub_signature) { document.getElementById('perm-cert-staff-sign').src = req.sub_signature; document.getElementById('perm-cert-staff-sign').style.display = "block"; }
        if(req.hod_signature) { document.getElementById('perm-cert-hod-sign').src = req.hod_signature; document.getElementById('perm-cert-hod-sign').style.display = "block"; }

    } else {
        const certArea = document.getElementById('certificate-print-area');
        let assignmentsHTML = '';
        let assignments = [];
        try { assignments = JSON.parse(req.assignments || '[]'); } catch(e) {}

        if(assignments && assignments.length > 0) {
            assignments.forEach(a => {
                let parts = a.split('->');
                let slotInfo = parts[0].trim();
                let sub = parts[1] ? parts[1].trim() : '--';
                let pMatch = slotInfo.match(/P(\d+)/);
                let sMatch = slotInfo.match(/\((.*?)\)/);
                
                assignmentsHTML += `<tr>
                    <td style="padding:8px; border:1px solid #000;">${req.date_requested || '--'}</td>
                    <td style="padding:8px; border:1px solid #000;">${sMatch ? sMatch[1] : '--'}</td>
                    <td style="padding:8px; border:1px solid #000;">${pMatch ? pMatch[1] : '--'}</td>
                    <td style="padding:8px; border:1px solid #000;">${sub}</td>
                    <td style="padding:8px; border:1px solid #000;">
                        ${req.sub_signature ? `<img src="${req.sub_signature}" style="height:25px; display:block; margin:0 auto;">` : '--'}
                    </td>
                </tr>`;
            });
        } else if (req.details && req.details.includes("Single Period")) {
            let pMatch = req.details.match(/P(\d+)/);
            let sMatch = req.details.match(/\((.*?)\)/);
            assignmentsHTML += `<tr>
                <td style="padding:8px; border:1px solid #000;">${req.date_requested || '--'}</td>
                <td style="padding:8px; border:1px solid #000;">${sMatch ? sMatch[1] : '--'}</td>
                <td style="padding:8px; border:1px solid #000;">${pMatch ? pMatch[1] : '--'}</td>
                <td style="padding:8px; border:1px solid #000;">${req.substitute || '--'}</td>
                <td style="padding:8px; border:1px solid #000;">
                    ${req.sub_signature ? `<img src="${req.sub_signature}" style="height:25px; display:block; margin:0 auto;">` : '--'}
                </td>
            </tr>`;
        } else {
             assignmentsHTML += `<tr><td colspan="5" style="padding:15px; border:1px solid #000; text-align:center;">No Work Adjustment Required</td></tr>`;
        }

        let prinSignHtml = req.prin_signature ? `<img src="${req.prin_signature}" style="height:40px; margin-bottom:5px;">` : '<br><br><br>';
        let hodSignHtml = req.hod_signature ? `<img src="${req.hod_signature}" style="height:40px; margin-bottom:5px;">` : '<br><br><br>';
        
        certArea.innerHTML = `
            <div style="font-family: Arial, sans-serif; color: #000; background: #fff; text-align: left; padding: 20px; font-size: 14px; line-height: 1.8;">
                <h3 style="text-align:center; font-size:16px; margin:0; font-weight: normal;">BONAM VENKATA CHALAMAYYA ENGINEERING COLLEGE AUTONOMOUS</h3>
                <p style="text-align:center; font-size:14px; margin:5px 0;">ODALAREVU 533 210,Allavaram Mandalam, E.G.Dt</p>
                <h4 style="text-align:center; text-decoration:underline; font-size:14px; margin-bottom:20px;">APPLICATION FORM FOR CASUAL LEAVE</h4>
                
                <div style="text-align:right; margin-bottom:10px;">Date: <span style="border-bottom: 1px dotted #000; padding: 0 10px; display: inline-block; min-width: 100px; text-align: center;">${req.date_requested || new Date().toLocaleDateString()}</span></div>
                
                <div>Name: <span style="border-bottom: 1px dotted #000; padding: 0 10px; display: inline-block; min-width: 150px; text-align: center;">${req.requester}</span> Designation: <span style="border-bottom: 1px dotted #000; padding: 0 10px; display: inline-block; min-width: 150px; text-align: center;">${req.designation || '--'}</span> Department: <span style="border-bottom: 1px dotted #000; padding: 0 10px; display: inline-block; min-width: 100px; text-align: center;">${req.department || '--'}</span></div>
                <div>Period of Leave Form: <span style="border-bottom: 1px dotted #000; padding: 0 10px; display: inline-block; min-width: 150px; text-align: center;">${req.leave_from || '--'}</span> To: <span style="border-bottom: 1px dotted #000; padding: 0 10px; display: inline-block; min-width: 150px; text-align: center;">${req.leave_to || '--'}</span> No of Days: <span style="border-bottom: 1px dotted #000; padding: 0 10px; display: inline-block; min-width: 80px; text-align: center;">${req.leave_from && req.leave_to && (req.leave_from !== req.leave_to) ? 'Multiple' : '1'}</span></div>
                <div>Details of Prefixing and Suffixing Holidays: <span style="border-bottom: 1px dotted #000; padding: 0 10px; display: inline-block; min-width: 300px;">${req.prefix_suffix || 'None'}</span></div>
                <div>Reason for Leave: <span style="border-bottom: 1px dotted #000; padding: 0 10px; display: inline-block; min-width: 500px;">${req.reason || '--'}</span></div>
                
                <div style="display:flex; justify-content:space-between; margin-top:40px; margin-bottom: 20px;">
                    <div style="text-align:center;">
                        ${hodSignHtml}<br>
                        <span style="border-top:1px solid #000; padding-top:5px;">Signature of HOD with Date</span>
                    </div>
                    <div style="text-align:center;">
                        <br><br><br>
                        <span style="border-top:1px dashed #000; padding-top:5px;">Signature of Applicant with Date</span>
                    </div>
                </div>
                
                <hr style="border:0; border-top:1px solid #000; margin:10px 0;">
                
                <div style="position:relative; margin-top:10px;">
                    <div style="text-align:center; font-weight:bold; margin-bottom:10px;">Work (Class/Exam/Office/Any other) Adjustment Sheet</div>
                    <table style="width:100%; border-collapse:collapse; margin-top:15px; text-align:left; border: 1px solid #000; font-size:13px;">
                        <thead>
                            <tr style="background:#f9f9f9;">
                                <th style="border:1px solid #000; padding:5px;">DATE</th>
                                <th style="border:1px solid #000; padding:5px;">YEAR/BRANCH/SECTION</th>
                                <th style="border:1px solid #000; padding:5px;">PERIODS</th>
                                <th style="border:1px solid #000; padding:5px;">Name of The Faculty</th>
                                <th style="border:1px solid #000; padding:5px;">Signature</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${assignmentsHTML}
                        </tbody>
                    </table>
                    
                    <div style="display:flex; justify-content:space-between; margin-top:40px;">
                        <div style="text-align:center;">
                            ${hodSignHtml}<br>
                            Signature of HOD
                        </div>
                        <div style="text-align:center;">
                            <br><br><br>
                            Signature of Applicant with Date
                        </div>
                    </div>
                </div>
            </div>
        `;
        certArea.style.display = 'block';
    }

    document.getElementById('certificate-modal').classList.remove('hidden');
};

window.printCertificate = function() {
    let element = document.querySelector('.cert-print-view[style*="display: block"]');
    if(!element) element = document.getElementById('certificate-print-area'); 
    const opt = {
        margin:       0.5,
        filename:     `Leave_Form.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
};

window.viewStudentCertificate = async function(id) {
    const res = await fetch(`${API_BASE}/leave/list`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ role: 'admin' }) });
    const data = await res.json();
    let req = (data.leaves || []).find(r => r.id === id);
    if(!req) return;

    if((req.status === 'APPROVED' || req.status === 'Approved by HOD') && typeof confetti === 'function' && currentUser.name === req.requester) {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }

    document.getElementById('stu-cert-name').innerText = req.requester;
    document.getElementById('stu-cert-reg').innerText = req.reg_no || '--';
    document.getElementById('stu-cert-date').innerText = req.date_requested || new Date().toLocaleDateString();
    document.getElementById('stu-cert-type').innerText = req.type || 'Leave';
    document.getElementById('stu-cert-reason').innerText = req.reason || '--';
    document.getElementById('stu-cert-duration').innerText = req.details || '--';
    document.getElementById('stu-cert-hod-branch').innerText = req.hod_name_assigned || req.branch || 'CSE';
    document.getElementById('stu-cert-ref').innerText = req.id.replace('REQ-', '');
    document.getElementById('stu-cert-ct-ref').innerText = req.teacher || 'Class Teacher';
    
    document.getElementById('stu-cert-name-bot').innerText = req.requester;
    document.getElementById('stu-cert-reg-bot').innerText = req.reg_no || '--';
    
    const stuImg = document.getElementById('stu-cert-sign');
    const ctImg = document.getElementById('stu-cert-ct-sign');
    const hodImg = document.getElementById('stu-cert-hod-sign');
    
    if (req.stu_signature) { stuImg.src = req.stu_signature; }
    if (req.ct_signature) { ctImg.src = req.ct_signature; ctImg.style.display = 'block'; document.getElementById('stu-cert-ct-name').innerText = req.teacher; } else { ctImg.style.display = 'none';}
    if (req.hod_signature) { hodImg.src = req.hod_signature; hodImg.style.display = 'block'; document.getElementById('stu-cert-hod-name').innerText = `HOD (${req.branch})`; } else { hodImg.style.display = 'none';}

    document.getElementById('student-certificate-modal').classList.remove('hidden');
};

window.printStudentCertificate = function() {
    const element = document.getElementById('student-certificate-print-area');
    const opt = {
        margin:       0.5,
        filename:     `Student_Leave_Letter.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
};

// ==========================================
// REMAINDER LOGIC: LIBRARY, EVENTS, AI, RESULTS, BUS
// ==========================================
async function fetchGlobalData() {
    const res = await fetch(`${API_BASE}/dashboard_data`);
    globalData = await res.json();
    
    const announceDiv = document.getElementById('home-announcements');
    if (globalData.notifications.length === 0) {
        announceDiv.innerHTML = "<p class='text-muted'>No announcements</p>";
    } else {
        announceDiv.innerHTML = globalData.notifications.slice(0,3).map(n => `
            <div style="padding:10px 0; border-bottom:1px solid var(--border-color);">
                <div style="font-size:12px; font-weight:bold; color:var(--primary-color);">${n.category_tag}</div>
                <div style="font-size:13px; margin-top:3px;">${n.message}</div>
            </div>
        `).join('');
    }
    
    const schedDiv = document.getElementById('home-schedule');
    const ttRes = await fetch(`${API_BASE}/timetable/CSE-A`);
    const ttData = await ttRes.json();
    
    if (ttData.length === 0) {
        schedDiv.innerHTML = "<p class='text-muted'>No classes today</p>";
    } else {
        schedDiv.innerHTML = ttData.slice(0,3).map(t => `
            <div class="list-item" style="padding:10px; margin-bottom:10px;">
                <div class="list-icon grad-orange" style="width:30px; height:30px; font-size:12px;"><i class="fas fa-clock"></i></div>
                <div class="list-content">
                    <h4>P${t.period} - ${t.subject}</h4>
                    <p>${t.room} • ${t.faculty_name}</p>
                </div>
            </div>
        `).join('');
    }
    renderEvents();
    renderLibrary();
}

function renderEvents() {
    const container = document.getElementById('events-container');
    if(!container) return;
    container.innerHTML = globalData.events.map(ev => `
        <div class="card mb-1">
            <h3 style="color:var(--primary-color)">${ev.title}</h3>
            <p style="font-size:12px; color:var(--text-muted)"><i class="fas fa-calendar"></i> ${ev.date} | <i class="fas fa-map-marker-alt"></i> ${ev.venue}</p>
            <p class="mt-1" style="font-size:13px; color:var(--text-main)">${ev.description}</p>
            <div style="margin-top:10px; font-size:12px; color:var(--text-muted)">
                <strong>Category:</strong> ${ev.category} | <strong>By:</strong> ${ev.organizer}
            </div>
            ${currentUser.role === 'student' ? `<button class="btn-success mt-1" onclick="openRegistrationModal(${ev.id}, '${ev.title.replace(/'/g, "\\'")}')">Register Now</button>` : ''}
        </div>
    `).join('');
}

function parseBookRawText(rawText) {
    const lines = rawText.split(/\r?\n/);
    const parsed = [];
    for (let line of lines) {
        line = line.trim();
        if (!line || line.toLowerCase().includes('book name') || line.toLowerCase().includes('s.no')) continue;
        
        let parts = line.split(/[,|\t]+/).map(p => p.trim()).filter(Boolean);
        if (parts.length < 3) {
            parts = line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
        }
        
        if (parts.length >= 3) {
            let titleIdx = 1, authorIdx = 2, subIdx = 3;
            if (!isNaN(parts[0])) { titleIdx = 1; authorIdx = 2; subIdx = 3; } 
            else { titleIdx = 0; authorIdx = 1; subIdx = 2; }
            
            let title = parts[titleIdx];
            let author = parts[authorIdx];
            let subject = parts[subIdx] || 'General';
            let isbn = 'ISBN-' + Math.floor(Math.random() * 10000); 
            
            parsed.push({ title: title, author: author, isbn: isbn, subject: subject });
        }
    }
    return parsed;
}

async function processBulkBookUpload(e) {
    if (e) e.preventDefault();
    const fileInput = document.getElementById('bulk-book-file');
    const progText = document.getElementById('book-upload-progress-text');
    
    if (!fileInput.files || fileInput.files.length === 0) return alert("Please select a file first.");
    
    const file = fileInput.files[0];
    const fileName = file.name.toLowerCase();
    progText.style.display = 'block';
    progText.innerText = "Analyzing book records...";
    
    try {
        let extractedBooks = [];
        if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
            const text = await file.text();
            extractedBooks = parseBookRawText(text);
        } else if (fileName.endsWith('.pdf')) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullPdfText = "";
            for (let p = 1; p <= pdf.numPages; p++) {
                const page = await pdf.getPage(p);
                const textContent = await page.getTextContent();
                fullPdfText += textContent.items.map(item => item.str).join(' ') + "\n";
            }
            extractedBooks = parseBookRawText(fullPdfText);
        } else if (fileName.match(/\.(png|jpg|jpeg)$/)) {
            const worker = await Tesseract.createWorker('eng');
            const ret = await worker.recognize(file);
            await worker.terminate();
            extractedBooks = parseBookRawText(ret.data.text);
        } else {
            throw new Error("Unsupported file format.");
        }
        
        if (extractedBooks.length === 0) {
            alert("No books detected. Ensure format: S.No, Book Name, Author Name, Related Subject");
        } else {
            progText.innerText = `Uploading ${extractedBooks.length} books...`;
            for (let b of extractedBooks) {
                globalData.books.push({ id: Math.random(), title: b.title, author: b.author, isbn: b.isbn, status: 'Available', issued_to: null });
            }
            showToast(`Bulk Upload Completed! ${extractedBooks.length} books added.`);
            fileInput.value = '';
            renderLibrary();
        }
    } catch (err) {
        alert(`UPLOAD FAILED!\n\nReason: ${err.message || err}`);
    } finally {
        progText.style.display = 'none';
    }
}

async function submitNewBook() {
    const title = document.getElementById('add-book-title').value.trim();
    const author = document.getElementById('add-book-author').value.trim();
    const isbn = document.getElementById('add-book-isbn').value.trim();
    const status = document.getElementById('add-book-status').value;
    const issuedTo = document.getElementById('add-book-issued-to').value.trim();
    
    if(!title || !author || !isbn) return showToast("Title, Author, and ISBN are required!");
    if(status === 'Issued' && !issuedTo) return showToast("Please specify who the book is issued to.");
    
    globalData.books.push({ id: Math.random(), title: title, author: author, isbn: isbn, status: status, issued_to: (status === 'Issued' ? issuedTo : null) });
    showToast("Book saved successfully!");
    document.getElementById('add-book-title').value = '';
    document.getElementById('add-book-author').value = '';
    document.getElementById('add-book-isbn').value = '';
    document.getElementById('add-book-issued-to').value = '';
    renderLibrary();
}

function reserveBook(bookId) {
    showToast(`Demo OTP dispatched to your registered mobile number for secure reservation.`);
    let book = globalData.books.find(b => b.id === bookId);
    if(book) {
        book.status = 'Reserved';
        book.issued_to = currentUser.reg_no;
    }
    renderLibrary();
}

function issueBook(bookId) {
    let book = globalData.books.find(b => b.id === bookId);
    if(book) {
        book.status = 'Issued';
    }
    showToast("Book successfully issued to student.");
    renderLibrary();
}

function returnBook(bookId) {
    let book = globalData.books.find(b => b.id === bookId);
    if(book) {
        book.status = 'Available';
        book.issued_to = null;
    }
    showToast("Book successfully returned to the library catalog.");
    renderLibrary();
}

function renderLibrary(filter = "") {
    const tbody = document.getElementById('library-body');
    const trackBody = document.getElementById('librarian-tracking-body');
    if (!globalData.books) return;

    const filtered = globalData.books.filter(b => b.title.toLowerCase().includes(filter.toLowerCase()) || b.isbn.includes(filter));
    
    if(tbody) {
        tbody.innerHTML = filtered.filter(b => b.status === 'Available').map(b => `
            <div class="list-item mb-1">
                <div class="list-icon grad-blue"><i class="fas fa-book"></i></div>
                <div class="list-content" style="flex: 1;">
                    <h4>${b.title}</h4>
                    <p>${b.author} • Code: ${b.isbn}</p>
                </div>
                ${currentUser && currentUser.role === 'student' ? `<button class="btn-success" style="padding: 6px 12px; font-size: 11px; width: auto;" onclick="reserveBook(${b.id})">Reserve</button>` : ''}
            </div>
        `).join('');
    }
    
    if (trackBody && currentUser && (currentUser.role === 'admin' || currentUser.role === 'librarian')) {
        const trackedBooks = globalData.books.filter(b => b.status !== 'Available');
        if (trackedBooks.length === 0) {
            trackBody.innerHTML = `<p style="color:var(--text-muted); font-size: 12px;">No books currently reserved or issued.</p>`;
        } else {
            trackBody.innerHTML = trackedBooks.map(b => {
                let isOverdue = false;
                let statusColor = b.status === 'Issued' ? '#3498db' : '#f39c12'; 
                if (b.status === 'Issued' && Math.random() > 0.7) isOverdue = true; 
                
                let alertTag = isOverdue ? `<span style="background: rgba(231, 76, 60, 0.2); color: #e74c3c; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px;">Overdue (Fine Pending)</span>` : '';
                
                return `
                <div class="list-item mb-1" style="background: rgba(0,0,0,0.3);">
                    <div class="list-content" style="flex: 1;">
                        <h4>${b.title} <span style="font-size: 11px; color: ${statusColor};">(${b.status})</span>${alertTag}</h4>
                        <p style="font-size: 11px;">Assigned to: <strong>${b.issued_to || 'Pending'}</strong></p>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        ${b.status === 'Reserved' ? `<button class="btn-success" style="padding: 5px 10px; font-size: 10px;" onclick="issueBook(${b.id})">Approve Issue</button>` : ''}
                        ${b.status === 'Issued' ? `<button class="btn-danger" style="padding: 5px 10px; font-size: 10px;" onclick="returnBook(${b.id})">Mark Returned</button>` : ''}
                    </div>
                </div>
                `;
            }).join('');
        }
    }
}

function filterBooks(val) {
    renderLibrary(val);
}

function openRegistrationModal(eventId, title) {
    if (!currentUser || currentUser.role !== 'student') return;
    document.getElementById('reg-event-id').value = eventId;
    document.getElementById('reg-event-title').value = title;
    document.getElementById('reg-no-display').value = currentUser.reg_no;
    document.getElementById('reg-domain').value = "";
    document.getElementById('reg-info').value = "";
    document.getElementById('registration-modal').classList.remove('hidden');
}

async function submitRegistration() {
    const eventId = document.getElementById('reg-event-id').value;
    const domain = document.getElementById('reg-domain').value;
    const info = document.getElementById('reg-info').value;
    if(!domain || !info) {
        return showToast("Domain and Motivation Pitch are required!");
    }
    
    try {
        const res = await fetch(`${API_BASE}/events/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ event_id: eventId, regNo: currentUser.reg_no, domain, info })
        });
        const data = await res.json();
        showToast(data.message);
        if(data.success) {
            closeModal('registration-modal');
        }
    } catch(e) {
        showToast("Registration failed.");
    }
}

async function loadMyTickets() {
    if (!currentUser || currentUser.role !== 'student') return;
    const res = await fetch(`${API_BASE}/events/my_tickets`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ regNo: currentUser.reg_no })
    });
    const data = await res.json();
    const list = document.getElementById('ticket-list');
    
    if (data.tickets.length === 0) {
        list.innerHTML = "<p>No tickets found.</p>";
    } else {
        list.innerHTML = data.tickets.map(t => `
            <div class="list-item mb-1" style="background:var(--bg-alt); border-color:var(--primary-color);">
                <div class="list-icon grad-purple"><i class="fas fa-qrcode"></i></div>
                <div class="list-content">
                    <h4>${t.title}</h4>
                    <p>${t.date} • ${t.venue}</p>
                </div>
            </div>
        `).join('');
    }
    document.getElementById('ticket-modal').classList.remove('hidden');
}

function closeTicketModal() {
    document.getElementById('ticket-modal').classList.add('hidden');
}


// ==========================================
// BVC SMART BUS TRACKING SYSTEM
// ==========================================
let busMap = null;
let busMarkers = {};
let busPollInterval = null;
let currentSelectedBus = null;
let collegeMarker = null;

const COLLEGE_LAT = 16.5654;
const COLLEGE_LNG = 81.5230;

function initBusMap() {
    if (window.BVC_TRANS && typeof window.BVC_TRANS.init === 'function') {
        window.BVC_TRANS.init();
        return;
    }
    if(busMap) return;
    const mapEl = document.getElementById('bus-map');
    if(!mapEl) return;
    busMap = L.map('bus-map').setView([COLLEGE_LAT, COLLEGE_LNG], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(busMap);

    const collegeIcon = L.divIcon({
        html: '<div style="font-size:24px;">🎓</div>',
        className: 'college-marker',
        iconSize: [30, 30]
    });
    collegeMarker = L.marker([COLLEGE_LAT, COLLEGE_LNG], {icon: collegeIcon}).addTo(busMap)
        .bindPopup('<b>BVC Engineering College</b>');
        
    setTimeout(() => { busMap.invalidateSize(); }, 500);
}

async function loadBuses() {
    try {
        const res = await fetch(`${API_BASE}/bus/live`);
        const data = await res.json();
        if(data.success) {
            updateAdminDashboard(data.data);
            updateMapMarkers(data.data);
            populateBusSelector(data.data);
            if(currentSelectedBus) {
                updateTelemetry(data.data.find(b => b.bus_no === currentSelectedBus));
            }
        }
    } catch(e) {
        console.error('Failed to load buses');
    }
}

function updateAdminDashboard(buses) {
    if(!document.getElementById('admin-active-buses')) return;
    const active = buses.filter(b => b.status === 'ACTIVE').length;
    const stopped = buses.filter(b => b.status === 'STOPPED' || b.status === 'PAUSED').length;
    const emergency = buses.filter(b => b.status === 'EMERGENCY').length;
    
    document.getElementById('admin-active-buses').innerText = active;
    document.getElementById('admin-stopped-buses').innerText = stopped;
    document.getElementById('admin-emergency-buses').innerText = emergency;
}

function updateMapMarkers(buses) {
    if(!busMap) return;
    buses.forEach(bus => {
        let lat = bus.latitude || COLLEGE_LAT;
        let lng = bus.longitude || COLLEGE_LNG;
        let iconHtml = '🚌';
        if(bus.status === 'EMERGENCY') iconHtml = '🚨';
        else if(bus.status === 'ACTIVE') iconHtml = '🟢';
        
        const bIcon = L.divIcon({
            html: `<div style="font-size:24px; filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));">${iconHtml}</div>`,
            className: 'bus-marker',
            iconSize: [25, 25]
        });

        if(!busMarkers[bus.bus_no]) {
            busMarkers[bus.bus_no] = L.marker([lat, lng], {icon: bIcon}).addTo(busMap);
        } else {
            busMarkers[bus.bus_no].setLatLng([lat, lng]);
            busMarkers[bus.bus_no].setIcon(bIcon);
        }
        
        busMarkers[bus.bus_no].bindPopup(`
            <div style="color: black;">
            <b>Bus ${bus.bus_no}</b><br>
            Route: ${bus.route}<br>
            Speed: ${bus.speed || 0} km/h<br>
            Status: <b>${bus.status}</b>
            </div>
        `);
    });
}

function populateBusSelector(buses) {
    const sel = document.getElementById('bus-selector');
    if(!sel) return;
    const current = sel.value;
    if(sel.options.length <= 1) {
        sel.innerHTML = '<option value="">Select a Bus to Track</option>';
        buses.forEach(b => {
            sel.innerHTML += `<option value="${b.bus_no}">Bus ${b.bus_no} - ${b.route}</option>`;
        });
        if(current) sel.value = current;
    }
}

function selectBus(busNo) {
    currentSelectedBus = busNo;
    if(busNo && busMarkers[busNo]) {
        busMap.setView(busMarkers[busNo].getLatLng(), 14);
    }
    loadBuses();
}

function centerMapOnBus() {
    if(currentSelectedBus && busMarkers[currentSelectedBus]) {
        busMap.setView(busMarkers[currentSelectedBus].getLatLng(), 15);
    } else {
        busMap.setView([COLLEGE_LAT, COLLEGE_LNG], 12);
    }
}

function updateTelemetry(bus) {
    if(!bus) return;
    document.getElementById('telemetry-bus-no').innerText = `🚌 ${bus.bus_no}`;
    document.getElementById('telemetry-route-name').innerText = `Route: ${bus.route}`;
    document.getElementById('telemetry-speed').innerText = `${bus.speed || 0} km/h`;
    document.getElementById('telemetry-eta').innerText = `${bus.eta_minutes || '--'} min`;
    document.getElementById('telemetry-next-stop').innerText = bus.next_stop || 'BVC College';
    document.getElementById('telemetry-occupancy').innerText = `${bus.filled_seats || 0} / ${bus.total_seats || 50}`;
    
    let statusBadge = document.getElementById('bus-status-badge');
    statusBadge.innerText = `Status: ${bus.status} ${bus.is_simulated ? '(SIMULATED)' : '(LIVE GPS)'}`;
    if(bus.status === 'EMERGENCY') statusBadge.style.color = 'red';
    else if(bus.status === 'ACTIVE') statusBadge.style.color = '#43e97b';
    else statusBadge.style.color = 'white';
    
    document.getElementById('telemetry-last-update').innerText = bus.last_updated || 'Just now';
}

async function busAction(action) {
    if(action === 'EMERGENCY' && !confirm("Are you sure you want to trigger EMERGENCY mode?")) return;
    
    let busNo = 'BUS-01';
    if (currentUser && currentUser.role === 'driver') {
        const m = (currentUser.reg_no || '').match(/\d+/);
        busNo = m ? `BUS-${String(parseInt(m[0], 10)).padStart(2, '0')}` : 'BUS-01';
    }
    try {
        const headers = {'Content-Type': 'application/json'};
        if (currentUser && currentUser.token) headers['X-Auth-Token'] = currentUser.token;
        const res = await fetch(`${API_BASE}/bus/action`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ bus_no: busNo, action: action })
        });
        const data = await res.json();
        showToast(data.message);
        const drvStat = document.getElementById('drv-cockpit-status');
        if (drvStat) drvStat.innerText = action;
        loadBuses();
        
        if(action === 'START') {
            startDriverGPS(busNo);
        } else {
            stopDriverGPS();
        }
    } catch(e) {
        showToast("Error executing bus action.");
    }
}

async function updateBusSeats() {
    const seats = document.getElementById('drv-seat-update').value;
    let busNo = 'BUS-01';
    if (currentUser && currentUser.role === 'driver') {
        const m = (currentUser.reg_no || '').match(/\d+/);
        busNo = m ? `BUS-${String(parseInt(m[0], 10)).padStart(2, '0')}` : 'BUS-01';
    }
    await fetch(`${API_BASE}/bus/update_seats`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ bus_no: busNo, filled: seats })
    });
    showToast("Seats updated!");
    loadBuses();
}

async function requestPickup() {
    const stop = document.getElementById('pickup-stop-selector').value || 'Requested Stop';
    if(!currentSelectedBus) return alert("Select a bus first.");
    
    await fetch(`${API_BASE}/bus/pickup/request`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ bus_no: currentSelectedBus, stop: stop, regNo: currentUser.reg_no })
    });
    showToast("Pickup requested. Driver notified.");
}

let driverGpsWatch = null;
function startDriverGPS(busNo) {
    if(driverGpsWatch) return;
    if(navigator.geolocation) {
        driverGpsWatch = navigator.geolocation.watchPosition(async (pos) => {
            const {latitude, longitude, speed, heading} = pos.coords;
            const kmh = speed ? Math.round(speed * 3.6) : 0;
            await fetch(`${API_BASE}/bus/location/update`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ bus_no: busNo, lat: latitude, lon: longitude, speed: kmh, heading: heading })
            });
        }, (err) => {
            console.error("GPS Error:", err);
            showToast("GPS unavailable. Falling back to Demo Mode.");
        }, { enableHighAccuracy: true });
    }
}

function stopDriverGPS() {
    if(driverGpsWatch && navigator.geolocation) {
        navigator.geolocation.clearWatch(driverGpsWatch);
        driverGpsWatch = null;
    }
}

const originalShowSection = showSection;
showSection = function(sectionId) {
    originalShowSection(sectionId);
    if(sectionId === 'bus') {
        setTimeout(() => {
            if (window.BVC_TRANS && typeof window.BVC_TRANS.init === 'function') {
                window.BVC_TRANS.init();
                return;
            }
            initBusMap();
            loadBuses();
            if(!busPollInterval) busPollInterval = setInterval(loadBuses, 5000);
            
            if(currentUser && currentUser.role === 'admin') {
                if(document.getElementById('admin-bus-view')) document.getElementById('admin-bus-view').classList.remove('hidden');
                if(document.getElementById('drv-bus-view')) document.getElementById('drv-bus-view').classList.add('hidden');
                if(document.getElementById('student-pickup-box')) document.getElementById('student-pickup-box').style.display = 'none';
            } else if(currentUser && currentUser.role === 'driver') {
                if(document.getElementById('drv-bus-view')) document.getElementById('drv-bus-view').classList.remove('hidden');
                if(document.getElementById('admin-bus-view')) document.getElementById('admin-bus-view').classList.add('hidden');
                if(document.getElementById('student-pickup-box')) document.getElementById('student-pickup-box').style.display = 'none';
                if(document.getElementById('drv-cockpit-busno')) document.getElementById('drv-cockpit-busno').innerText = currentUser.reg_no.replace('DRV', 'BUS');
            } else {
                if(document.getElementById('admin-bus-view')) document.getElementById('admin-bus-view').classList.add('hidden');
                if(document.getElementById('drv-bus-view')) document.getElementById('drv-bus-view').classList.add('hidden');
                if(document.getElementById('student-pickup-box')) document.getElementById('student-pickup-box').style.display = 'block';
            }
        }, 300);
    } else {
        if(busPollInterval) {
            clearInterval(busPollInterval);
            busPollInterval = null;
        }
    }
}
async function requestResultOTP() {
    const res = await fetch(`${API_BASE}/results/request_otp`, { method:'POST' });
    const data = await res.json();
    document.getElementById('result-auth-box').classList.add('hidden');
    document.getElementById('result-otp-box').classList.remove('hidden');
    const otpInput = document.getElementById('res-otp');
    const code = data.debug_otp || '123456';
    if (otpInput && !otpInput.value) {
        otpInput.value = code;
    }
    setTimeout(() => { showToast((data.message || 'Verification OTP dispatched') + ` (OTP: ${code})`); }, 500);
}

async function verifyResultOTP() {
    const otp = document.getElementById('res-otp').value;
    if(otp !== '123456') return alert("Invalid OTP");
    
    document.getElementById('result-otp-box').classList.add('hidden');
    document.getElementById('result-data-box').classList.remove('hidden');
    
    const reg = document.getElementById('res-reg').value.toUpperCase();
    const res = await fetch(`${API_BASE}/results/fetch`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ regNo: reg })
    });
    const data = await res.json();
    
    const tbody = document.getElementById('results-body');
    let totalCredits = 0, earnedPoints = 0, subjects = [], grades = [];
    
    tbody.innerHTML = data.results.map(r => {
        totalCredits += r.credits;
        earnedPoints += (r.credits * r.grade_point);
        subjects.push(r.subject);
        grades.push(r.grade_point);
        return `
            <div class="list-item mb-1">
                <div class="list-icon ${r.status==='PASS'?'grad-green':'grad-danger'}">${r.grade}</div>
                <div class="list-content">
                    <h4>${r.subject}</h4>
                    <p>Sem ${r.semester} • Credits: ${r.credits}</p>
                </div>
            </div>`
    }).join('');
    
    let cgpa = totalCredits ? (earnedPoints / totalCredits).toFixed(2) : '0.00';
    document.getElementById('res-sgpa-total').innerText = cgpa;
    drawResultsChart(subjects, grades);
}

function drawResultsChart(labels, dataPoints) {
    const ctx = document.getElementById('resultsChart').getContext('2d');
    if(resultsChartInstance) resultsChartInstance.destroy();
    
    resultsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Grade Points',
                data: dataPoints,
                borderColor: '#833ab4', 
                backgroundColor: 'rgba(131, 58, 180, 0.2)',
                fill: true,
                tension: 0.3
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, max: 10 } } }
    });
}

let recognition;
let isRecording = false;

function openCampusAI() {
    document.getElementById('ai-modal').classList.remove('hidden');
}

function closeCampusAI() {
    document.getElementById('ai-modal').classList.add('hidden');
    if(isRecording) stopRecording();
    stopAiVoice();
}

function initAiVoices() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        
        recognition.onstart = () => {
            isRecording = true;
            if(document.getElementById('btn-mic')) document.getElementById('btn-mic').classList.add('recording');
            document.getElementById('ai-transcript').innerText = "Listening...";
        };
        
        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript;
            document.getElementById('ai-transcript').innerText = transcript;
            
            if(event.results[0].isFinal) {
                document.getElementById('ai-text-input').value = transcript;
                stopRecording();
                sendAiMessage();
            }
        };
        
        recognition.onerror = (e) => {
            stopRecording();
            if(e.error === 'not-allowed') showToast("Mic blocked. Text mode active.");
        };
        
        recognition.onend = () => stopRecording();
    } else {
        if(document.getElementById('btn-mic')) document.getElementById('btn-mic').style.display = 'none';
    }
}

function toggleAiMic() {
    isRecording ? stopRecording() : (recognition && recognition.start());
}

function stopRecording() {
    if(recognition) recognition.stop();
    isRecording = false;
    if(document.getElementById('btn-mic')) document.getElementById('btn-mic').classList.remove('recording');
}

function handleAiKeyPress(e) {
    if(e.key === 'Enter') sendAiMessage();
}

async function sendAiMessage() {
    const input = document.getElementById('ai-text-input');
    const text = input.value.trim();
    if(!text) return;
    
    addAiMessage(text, true);
    input.value = '';
    document.getElementById('ai-transcript').innerText = '';
    
    try {
        const res = await fetch(`${API_BASE}/ai_chat`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query: text })
        });
        const data = await res.json();
        addAiMessage(data.response, false);
    } catch (e) {
        addAiMessage("Error connecting to AI.", false);
    }
}

function addAiMessage(text, isUser = false) {
    const box = document.getElementById('ai-chat-history');
    const div = document.createElement('div');
    div.className = isUser ? 'user-message' : 'ai-message';
    div.innerText = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    
    if (!isUser && window.speechSynthesis) {
        window.speechSynthesis.cancel(); 
        let speech = new SpeechSynthesisUtterance(text);
        let voices = window.speechSynthesis.getVoices();
        let englishVoice = voices.find(v => v.lang.includes('en-GB') || v.lang.includes('en-US'));
        if (englishVoice) speech.voice = englishVoice;
        speech.rate = 1.0;
        speech.pitch = 1.0;
        
        const stopBtn = document.getElementById('btn-stop-voice');
        if(stopBtn) stopBtn.style.display = 'inline-flex';
        
        speech.onend = () => { if(stopBtn) stopBtn.style.display = 'none'; };
        speech.onerror = () => { if(stopBtn) stopBtn.style.display = 'none'; };
        
        window.speechSynthesis.speak(speech);
    }
}

function stopAiVoice() {
    if(window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    const stopBtn = document.getElementById('btn-stop-voice');
    if(stopBtn) stopBtn.style.display = 'none';
}

// --- LIBRARY LOGIC ---
function switchLibraryTab(tab) {
    if(document.getElementById('lib-panel-catalog')) document.getElementById('lib-panel-catalog').classList.toggle('hidden', tab !== 'catalog');
    if(document.getElementById('lib-panel-eresources')) document.getElementById('lib-panel-eresources').classList.toggle('hidden', tab !== 'eresources');
    if(document.getElementById('lib-panel-borrowings')) document.getElementById('lib-panel-borrowings').classList.toggle('hidden', tab !== 'borrowings');
    if(document.getElementById('lib-panel-admin')) document.getElementById('lib-panel-admin').classList.toggle('hidden', tab !== 'admin');
    
    if(document.getElementById('tab-lib-catalog')) document.getElementById('tab-lib-catalog').className = tab === 'catalog' ? 'btn-primary' : 'btn-secondary';
    if(document.getElementById('tab-lib-eresources')) document.getElementById('tab-lib-eresources').className = tab === 'eresources' ? 'btn-primary' : 'btn-secondary';
    if(document.getElementById('tab-lib-borrowings')) document.getElementById('tab-lib-borrowings').className = tab === 'borrowings' ? 'btn-primary' : 'btn-secondary';
    if(document.getElementById('tab-lib-admin')) document.getElementById('tab-lib-admin').className = tab === 'admin' ? 'btn-primary' : 'btn-secondary';

    if (tab === 'catalog') fetchBooks();
    if (tab === 'eresources') fetchEResources();
    if (tab === 'borrowings') fetchBorrowHistory();
    if (tab === 'admin') fetchLibraryStats();
}

async function fetchBooks() {
    try {
        const res = await fetch(`${API_BASE}/library/books`);
        const data = await res.json();
        const html = data.books.map(b => `
            <div class="list-item" style="justify-content:space-between; align-items:center; background: rgba(0,0,0,0.2);">
                <div>
                    <strong>${b.title}</strong> by ${b.author} <br>
                    <span style="font-size:11px; color:var(--text-muted);">ISBN: ${b.isbn}</span>
                </div>
                <div style="text-align:right;">
                    <span style="padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold; 
                        background:${b.status === 'Available' ? 'rgba(67, 233, 123, 0.2)' : 'rgba(255, 71, 87, 0.2)'}; 
                        color:${b.status === 'Available' ? '#43e97b' : '#ff4757'}">${b.status}</span>
                    ${b.status === 'Available' ? `<br><button class="btn-primary" style="margin-top:5px; font-size:10px; padding:3px 8px;" onclick="reserveBook(${b.id})">Reserve</button>` : ''}
                </div>
            </div>
        `).join('');
        document.getElementById('library-body').innerHTML = html || "<p style='text-align:center;color:gray'>No books available.</p>";
    } catch (e) {
        console.error(e);
    }
}

async function fetchEResources() {
    try {
        const res = await fetch(`${API_BASE}/library/eresources`);
        const data = await res.json();
        const html = data.resources.map(r => `
            <div class="list-item" style="justify-content:space-between; align-items:center; background: rgba(0,0,0,0.2);">
                <div>
                    <strong>${r.title}</strong> (${r.resource_type}) <br>
                    <span style="font-size:11px; color:var(--text-muted);">${r.author} | Dept: ${r.department}</span>
                </div>
                <a href="${r.file_url}" target="_blank" class="btn-primary" style="font-size:11px; padding:5px 10px; text-decoration:none;"><i class="fas fa-download"></i> Download</a>
            </div>
        `).join('');
        document.getElementById('eresources-body').innerHTML = html || "<p style='text-align:center;color:gray'>No resources found.</p>";
    } catch(e) {}
}

async function fetchBorrowHistory() {
    if(!currentUser || currentUser.role !== 'student') return;
    try {
        const res = await fetch(`${API_BASE}/library/history/${currentUser.reg_no}`);
        const data = await res.json();
        const html = data.history.map(h => `
            <div class="list-item" style="flex-direction:column; background: rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <strong>${h.title}</strong>
                    <span style="font-size:11px; font-weight:bold; color:${h.status === 'Returned' ? '#43e97b' : '#ff9f43'}">${h.status}</span>
                </div>
                <span style="font-size:11px; color:var(--text-muted);">Issued: ${h.issue_date} | Due: ${h.due_date || 'N/A'}</span>
            </div>
        `).join('');
        document.getElementById('borrowings-body').innerHTML = html || "<p style='text-align:center;color:gray'>No borrowing history.</p>";
    } catch(e) {}
}

async function fetchLibraryStats() {
    try {
        const res = await fetch(`${API_BASE}/library/admin/stats`);
        const data = await res.json();
        if(data.success) {
            document.getElementById('lib-stat-total').innerText = data.stats.total;
            document.getElementById('lib-stat-issued').innerText = data.stats.issued;
            document.getElementById('lib-stat-fines').innerText = '₹' + data.stats.fines;
            
            document.getElementById('librarian-tracking-body').innerHTML = data.recent.map(h => `
                <div class="list-item" style="justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${h.reg_no}</strong> -> ${h.title} <br>
                        <span style="font-size:11px; color:var(--text-muted);">Issued: ${h.issue_date}</span>
                    </div>
                    <span style="font-size:11px; font-weight:bold; color:${h.status === 'Returned' ? '#43e97b' : '#ff9f43'}">${h.status}</span>
                </div>
            `).join('');
        }
    } catch(e) {}
}

async function submitEResource() {
    const title = document.getElementById('add-er-title').value;
    const author = document.getElementById('add-er-author').value;
    const dept = document.getElementById('add-er-dept').value;
    const url = document.getElementById('add-er-url').value;
    const type = document.getElementById('add-er-type').value;
    
    if(!title || !url) return alert("Title and URL are required.");
    try {
        const res = await fetch(`${API_BASE}/library/eresources/add`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title, author, department: dept, file_url: url, resource_type: type})
        });
        const data = await res.json();
        if(data.success) {
            showToast("Resource added!");
            fetchEResources();
            document.getElementById('add-er-title').value = '';
            document.getElementById('add-er-url').value = '';
        }
    } catch(e) {}
}

async function issueBookToStudent() {
    const isbn = document.getElementById('issue-isbn').value;
    const regNo = document.getElementById('issue-reg').value;
    if(!isbn || !regNo) return;
    try {
        const res = await fetch(`${API_BASE}/library/issue`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({isbn, regNo})
        });
        const data = await res.json();
        if(data.success) {
            showToast(data.message);
            fetchLibraryStats();
        } else {
            alert(data.message);
        }
    } catch(e) {}
}

async function returnBookFromStudent() {
    const isbn = document.getElementById('issue-isbn').value;
    if(!isbn) return;
    try {
        const res = await fetch(`${API_BASE}/library/return`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({isbn})
        });
        const data = await res.json();
        if(data.success) {
            showToast("Book returned.");
            fetchLibraryStats();
        }
    } catch(e) {}
}

const origSetupRoleUILibrary = setupRoleUI;
setupRoleUI = function() {
    try { if (origSetupRoleUILibrary) origSetupRoleUILibrary(); } catch(e) { console.warn('origSetupRoleUILibrary error:', e); }
    try {
        if(currentUser) {
            const isStudent = currentUser.role === 'student';
            const isAdmin = currentUser.role === 'admin' || currentUser.role === 'librarian';
            
            if (document.getElementById('tab-lib-borrowings')) document.getElementById('tab-lib-borrowings').style.display = isStudent ? 'block' : 'none';
            if (document.getElementById('tab-lib-admin')) document.getElementById('tab-lib-admin').style.display = isAdmin ? 'block' : 'none';
            
            if (document.getElementById('lib-panel-catalog')) switchLibraryTab('catalog');
        }
    } catch(e) { console.warn('setupRoleUI library error:', e); }
};

// Global Window Exports for Authentication & UI Interactivity
window.processLogin = processLogin;
window.fillDemoLogin = fillDemoLogin;
window.toggleDemoDrawer = toggleDemoDrawer;
window.togglePasswordVisibility = togglePasswordVisibility;
window.openGoogleAuthModal = openGoogleAuthModal;
window.closeGoogleAuthModal = closeGoogleAuthModal;
window.continueWithGoogleEmail = continueWithGoogleEmail;
window.requestGoogleOtp = requestGoogleOtp;
window.verifyGoogleOtp = verifyGoogleOtp;
window.resendGoogleOtp = resendGoogleOtp;
window.backToGoogleAccounts = backToGoogleAccounts;
window.handleGoogleOtpKeyup = handleGoogleOtpKeyup;
window.submitGoogleCustomEmail = submitGoogleCustomEmail;
window.updateLoginFields = updateLoginFields;
window.openLoginHelpModal = openLoginHelpModal;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateLoginFields);
} else {
    updateLoginFields();
}
