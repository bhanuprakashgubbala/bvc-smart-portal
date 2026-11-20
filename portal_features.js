// portal_features.js - additive layer (loaded AFTER app.js and upgrades.js).
// Adds: student dashboard summary, Class Teacher assignment (Admin/HOD), own-results view +
// class-teacher marks update, Student Achievements with Class Teacher -> HOD -> Principal approval.
// It wraps existing functions and never removes an existing feature.
(function () {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const role = () => (currentUser && currentUser.role) || '';
const dash = v => (v === null || v === undefined || v === '') ? '—' : esc(v);
const when = d => d ? esc(String(d).slice(0, 16)) : '—';

async function call(path, opts) {
  opts = opts || {};
  const h = Object.assign({'Content-Type': 'application/json'}, opts.headers || {});
  if (currentUser && currentUser.token) h['X-Auth-Token'] = currentUser.token;
  try {
    const res = await fetch(API_BASE + path, Object.assign({}, opts, {headers: h}));
    try { return await res.json(); } catch (e) { return {success: false, message: 'Server error (' + res.status + ').'}; }
  } catch (e) { return {success: false, message: 'Cannot reach the server. Is it running?'}; }
}
const get = p => call(p);
const send = (p, body, method) => call(p, {method: method || 'POST', body: JSON.stringify(body || {})});
const back = '<button class="btn-secondary mb-2" style="font-size:12px;padding:5px 12px;border-radius:20px;display:inline-flex;align-items:center;gap:5px" onclick="showSection(\'dashboard\')"><i class="fas fa-arrow-left"></i> Back to Home</button>';

// ---------------------------------------------------------------- SESSION TOKEN
// Ensure token exists on session without triggering disruptive reload loops
const _finalizeLogin = finalizeLogin;
finalizeLogin = function () {
  if (currentUser && !currentUser.token) {
    currentUser.token = 'bvc_auth_' + (currentUser.reg_no || currentUser.id || 'session');
    try { localStorage.setItem('bvc_user', JSON.stringify(currentUser)); } catch (e) {}
  }
  return _finalizeLogin ? _finalizeLogin.apply(this, arguments) : undefined;
};

// ---------------------------------------------------------------- NAV + TILES + SECTIONS
function addNav(id, icon, label, section, afterId) {
  if ($(id)) return;
  const ref = $(afterId); if (!ref) return;
  const li = document.createElement('li');
  li.id = id; li.className = 'hidden';
  li.setAttribute('onclick', "showSection('" + section + "'); toggleSidebar();");
  li.innerHTML = '<i class="fas ' + icon + '"></i> ' + label;
  ref.after(li);
}
function addTile(id, icon, grad, label, section, afterId) {
  if ($(id)) return;
  const ref = $(afterId); if (!ref) return;
  const d = document.createElement('div');
  d.className = 'app-item'; d.id = id; d.style.display = 'none';
  d.setAttribute('onclick', "showSection('" + section + "')");
  d.innerHTML = '<div class="app-icon ' + grad + '"><i class="fas ' + icon + '"></i></div><span>' + label + '</span>';
  ref.after(d);
}
function addSection(id, html) {
  if ($(id)) return $(id);
  const ref = $('sec-quicklinks'); if (!ref) return null;
  const s = document.createElement('section');
  s.id = id; s.className = 'content-section hidden'; s.innerHTML = html;
  ref.parentNode.insertBefore(s, ref);
  return s;
}
addNav('nav-achievements', 'fa-trophy', 'Achievements', 'achievements', 'nav-results');
addNav('nav-classteachers', 'fa-chalkboard-teacher', 'Class Teachers', 'classteachers', 'nav-achievements');
addTile('app-achievements', 'fa-trophy', 'grad-yellow', 'Achievements', 'achievements', 'app-results');
addTile('app-classteachers', 'fa-chalkboard-teacher', 'grad-teal', 'Class Teachers', 'classteachers', 'app-achievements');

const _setupRoleUI = setupRoleUI;
setupRoleUI = function () {
  try { if (_setupRoleUI) _setupRoleUI.apply(this, arguments); } catch (e) { console.warn('portal_features setupRoleUI base error:', e); }
  try {
    const r = role(), driver = r === 'driver';
    const showAch = ['student', 'faculty', 'hod', 'principal', 'admin'].includes(r) && !driver;
    const showCT = ['admin', 'hod'].includes(r);
    [['nav-achievements', showAch], ['nav-classteachers', showCT]].forEach(([id, on]) => { const e = $(id); if (e) e.classList.toggle('hidden', !on); });
    [['app-achievements', showAch], ['app-classteachers', showCT]].forEach(([id, on]) => { const e = $(id); if (e) e.style.display = on ? 'flex' : 'none'; });
    if (r === 'student') { ensureStudentCard(); loadStudentCard(); }
    else { const c = $('student-summary'); if (c) c.remove(); }
  } catch (e) { console.warn('portal_features setupRoleUI error:', e); }
};

const TITLES = {achievements: 'Achievements', classteachers: 'Class Teacher Assignment'};
const _showSection = showSection;
showSection = function (id) {
  try {
    if (id === 'classteachers' && !['admin', 'hod'].includes(role())) return;
    if (id === 'achievements' && !currentUser) return;
    if (id === 'classteachers') ensureCTSection();      // sections must exist before the original showSection un-hides them
    if (id === 'achievements') ensureAchSection();
  } catch(e) {}
  try {
    if (_showSection) _showSection.apply(this, arguments);
  } catch (e) { console.warn('portal_features _showSection error:', e); }
  try {
    if (TITLES[id] && $('section-title')) $('section-title').innerText = TITLES[id];
    if (id === 'dashboard' && role() === 'student') loadStudentCard();
    if (id === 'classteachers') openClassTeachers();
    if (id === 'achievements') openAchievements();
    if (id === 'results') prepareResults();
  } catch (e) { console.warn('portal_features showSection error:', e); }
};

// ---------------------------------------------------------------- STUDENT DASHBOARD
function ensureStudentCard() {
  if ($('student-summary')) return;
  const ban = $('greeting-banner'); if (!ban) return;
  const d = document.createElement('div');
  d.id = 'student-summary'; d.className = 'card mb-2';
  d.innerHTML = '<div class="section-title"><i class="fas fa-id-badge"></i> My Academic Summary</div><div id="ss-body">' +
                '<div class="skel"></div></div>';
  ban.after(d);
}
function infoCell(label, value) { return '<div class="ss-cell"><span>' + label + '</span><b>' + dash(value) + '</b></div>'; }
function statCell(label, value, sub) { return '<div class="ss-stat"><b>' + value + '</b><span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
async function loadStudentCard() {
  if (role() !== 'student') return;
  ensureStudentCard();
  const body = $('ss-body'); if (!body) return;
  const d = await get('/student/dashboard');
  if (!d.success) { body.innerHTML = '<div class="state-box"><i class="fas fa-triangle-exclamation"></i>' + esc(d.message || 'Unable to load your summary.') + '</div>'; return; }
  const p = d.profile, r = d.results, a = d.attendance, ac = d.achievements;
  if ($('dyn-greeting-tag')) $('dyn-greeting-tag').innerText = 'Class Teacher: ' + (d.class_teacher || 'Not assigned yet');
  if ($('dyn-greeting-subtitle')) $('dyn-greeting-subtitle').innerText =
    'Roll No: ' + p.reg_no + ' | Branch: ' + (p.branch || '—') + ' | Year: ' + (p.year_of_study || '—') + ' | Sec: ' + (p.section || '—') + ' | Email: ' + (p.email || '—');
  body.innerHTML =
    '<div class="ss-grid">' + infoCell('Name', p.name) + infoCell('Register No', p.reg_no) + infoCell('Branch', p.branch) +
      infoCell('Year', p.year_of_study) + infoCell('Section', p.section) + infoCell('Class Teacher', d.class_teacher || 'Not assigned yet') +
      infoCell('Email', p.email) + infoCell('Phone', p.phone) + '</div>' +
    '<div class="ss-stats">' +
      statCell('Attendance', a.percent === null ? '—' : a.percent + '%', a.percent === null ? 'not recorded yet' : '') +
      statCell('CGPA', r.cgpa === null ? '—' : r.cgpa, r.count ? r.count + ' subjects' : 'no results yet') +
      statCell('Latest SGPA', r.latest_sgpa === null || r.latest_sgpa === undefined ? '—' : r.latest_sgpa, r.latest_semester ? 'Sem ' + esc(r.latest_semester) : '') +
      statCell('Total Marks', r.total_marks_latest === null || r.total_marks_latest === undefined ? '—' : r.total_marks_latest, r.latest_semester ? 'Sem ' + esc(r.latest_semester) : '') +
      statCell('Achievements', ac.approved, ac.pending + ' pending • ' + ac.rejected + ' rejected') +
    '</div>' +
    '<div class="lib-actions" style="margin-top:10px"><button class="btn-secondary" onclick="showSection(\'results\')">My Results</button>' +
    '<button class="btn-secondary" onclick="showSection(\'achievements\')">My Achievements</button>' +
    '<button class="btn-secondary" onclick="showSection(\'profile\')">My Profile</button></div>';
}

// keep the greeting tag accurate for students (the old text was hard-coded)
const _greet = updatePersonalizedGreeting;
updatePersonalizedGreeting = function () {
  _greet.apply(this, arguments);
  if (role() === 'student' && $('dyn-greeting-tag')) $('dyn-greeting-tag').innerText = 'Class Teacher: …';
};

// ---------------------------------------------------------------- CLASS TEACHER ASSIGNMENT (Admin / HOD)
let ctOpts = null;
function ensureCTSection() {
  addSection('sec-classteachers', back +
    '<div class="card mb-2" style="border-top:4px solid #43e97b"><div class="section-title"><i class="fas fa-chalkboard-teacher"></i> Assign Class Teacher</div>' +
    '<p class="lib-meta" style="margin-bottom:10px">Choose Branch + Year + Section, then the faculty member who will be its Class Teacher. Assigning again replaces the earlier teacher.</p>' +
    '<div class="ct-form"><select id="ct-branch" class="input-field"></select>' +
    '<select id="ct-year" class="input-field"><option value="1">1st Year</option><option value="2" selected>2nd Year</option><option value="3">3rd Year</option><option value="4">4th Year</option></select>' +
    '<input id="ct-section" class="input-field" list="ct-section-list" placeholder="Section (e.g. A or CSE-A)"><datalist id="ct-section-list"></datalist>' +
    '<select id="ct-faculty" class="input-field"></select></div>' +
    '<button class="btn-primary w-100 mt-1" id="ct-save">Assign Class Teacher</button></div>' +
    '<div class="card"><div class="section-title"><i class="fas fa-list"></i> Current Class Teachers</div><div id="ct-list" class="card-list"></div></div>');
  if (!$('ct-save').dataset.w) {
    $('ct-save').dataset.w = 1;
    $('ct-save').onclick = saveCT;
    $('ct-branch').onchange = fillSections;
  }
}
function fillSections() {
  const b = $('ct-branch').value, list = (ctOpts && ctOpts.sections[b]) || [];
  $('ct-section-list').innerHTML = list.map(s => '<option value="' + esc(s) + '">').join('');
}
async function openClassTeachers() {
  ensureCTSection();
  const o = await get('/class-teachers/options');
  if (!o.success) { $('ct-list').innerHTML = '<div class="state-box">' + esc(o.message || 'Unable to load.') + '</div>'; return; }
  ctOpts = o;
  const keepB = $('ct-branch').value, keepF = $('ct-faculty').value;
  $('ct-branch').innerHTML = o.branches.map(b => '<option value="' + esc(b) + '">' + esc(b) + '</option>').join('');
  if (keepB) $('ct-branch').value = keepB;
  $('ct-faculty').innerHTML = '<option value="">Select Faculty…</option>' + o.faculty.map(f =>
    '<option value="' + esc(f.reg_no) + '">' + esc(f.name) + (f.branch ? ' (' + esc(f.branch) + ')' : '') + '</option>').join('');
  if (keepF) $('ct-faculty').value = keepF;
  fillSections();
  loadCTList();
}
async function loadCTList() {
  const d = await get('/class-teachers');
  const box = $('ct-list');
  if (!d.success) { box.innerHTML = '<div class="state-box">' + esc(d.message || 'Unable to load.') + '</div>'; return; }
  if (!d.assignments.length) { box.innerHTML = '<div class="state-box"><i class="fas fa-inbox"></i>No class teachers assigned yet.</div>'; return; }
  box.innerHTML = d.assignments.map(a =>
    '<div class="list-item"><div class="list-icon grad-teal"><i class="fas fa-user-tie"></i></div><div class="list-content">' +
    '<h4>' + esc(a.faculty_name) + '</h4><p>' + esc(a.branch) + ' • Year ' + a.year + ' • ' + esc(a.section) + ' • ' + a.student_count + ' student(s)</p>' +
    '<p class="lib-meta">Assigned by ' + esc(a.assigned_by || '—') + ' on ' + when(a.assigned_at) + '</p></div>' +
    '<div class="lib-actions" style="flex-direction:column"><button class="btn-secondary" data-edit="' + a.id + '">Change</button>' +
    '<button class="btn-danger" data-del="' + a.id + '">Remove</button></div></div>').join('');
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Remove this class teacher assignment?')) return;
    const r = await send('/class-teachers/' + b.dataset.del, null, 'DELETE');
    showToast(r.message || 'Done.'); loadCTList();
  });
  box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const a = d.assignments.find(x => String(x.id) === b.dataset.edit); if (!a) return;
    $('ct-branch').value = a.branch; fillSections(); $('ct-year').value = a.year; $('ct-section').value = a.section; $('ct-faculty').value = a.faculty_reg_no;
    $('ct-faculty').scrollIntoView({behavior: 'smooth', block: 'center'});
  });
}
async function saveCT() {
  const btn = $('ct-save');
  if (!$('ct-section').value.trim()) return showToast('Please enter the Section.');
  if (!$('ct-faculty').value) return showToast('Please select a faculty member.');
  btn.disabled = true;
  try {
    const r = await send('/class-teachers', {branch: $('ct-branch').value, year: $('ct-year').value, section: $('ct-section').value, facultyRegNo: $('ct-faculty').value});
    showToast(r.message || (r.success ? 'Saved.' : 'Unable to save.'));
    if (r.success) { loadCTList(); }
  } finally { btn.disabled = false; }
}

// ---------------------------------------------------------------- RESULTS (own data) + MARKS UPDATE (class teacher)
function prepareResults() {
  const reg = $('res-reg');
  if (reg && role() === 'student') {
    reg.value = currentUser.reg_no; reg.readOnly = true; reg.title = 'You can view only your own results';
    const hint = reg.previousElementSibling;
    if (hint && hint.tagName === 'P') hint.innerText = 'Your results are shown only to you. Request an OTP to continue.';
  }
  if (role() === 'faculty') loadMarksPanel();
}
function mv(v) { return (v === null || v === undefined || v === '') ? '—' : esc(v); }
function renderResults(rows, summary) {
  const sems = {};
  rows.forEach(r => { (sems[r.semester] = sems[r.semester] || []).push(r); });
  const html = Object.keys(sems).sort().map(sem =>
    '<div class="sem-head">Semester ' + esc(sem) + '<span>SGPA: <b>' + (summary.sgpa[sem] === undefined ? '—' : summary.sgpa[sem]) + '</b></span></div>' +
    sems[sem].map(r =>
      '<div class="list-item mb-1 res-card"><div class="list-icon ' + (r.status === 'PASS' ? 'grad-green' : 'grad-danger') + '">' + esc(r.grade) + '</div>' +
      '<div class="list-content"><h4>' + esc(r.subject) + ' <small class="lib-meta">' + esc(r.subject_code) + '</small></h4>' +
      '<p>Credits: ' + mv(r.credits) + ' • Grade Point: ' + mv(r.grade_point) + ' • ' + esc(r.status) + '</p>' +
      '<div class="res-marks"><span>Mid<b>' + mv(r.mid_marks) + '</b></span><span>Internal<b>' + mv(r.internal_marks) + '</b></span>' +
      '<span>External<b>' + mv(r.external_marks) + '</b></span><span>Semester<b>' + mv(r.semester_marks) + '</b></span><span>Total<b>' + mv(r.total) + '</b></span></div></div></div>').join('')
  ).join('');
  return html || '<div class="state-box"><i class="fas fa-inbox"></i>No results published yet.</div>';
}
// Same OTP step as before; the data now comes only from the logged-in user's own record.
verifyResultOTP = async function () {
  const otp = $('res-otp').value;
  if (otp !== '123456') return alert('Invalid OTP');
  const reg = ($('res-reg').value || '').toUpperCase();
  const data = await send('/results/fetch', {regNo: reg});
  if (!data.success) return alert(data.message || 'Unable to load results.');
  $('result-otp-box').classList.add('hidden');
  $('result-data-box').classList.remove('hidden');
  $('results-body').innerHTML = renderResults(data.results, data.summary);
  $('res-sgpa-total').innerText = data.summary.cgpa === null ? '0.00' : Number(data.summary.cgpa).toFixed(2);
  drawResultsChart(data.results.map(r => r.subject), data.results.map(r => r.grade_point));
};

let mk = {sections: [], student: null, rows: []};
function ensureMarksPanel() {
  if ($('marks-panel')) return;
  const sec = $('sec-results'); if (!sec) return;
  const d = document.createElement('div');
  d.id = 'marks-panel'; d.className = 'card mb-2 hidden'; d.style.borderTop = '4px solid #f9d423';
  d.innerHTML = '<div class="section-title"><i class="fas fa-pen-to-square"></i> Update Student Marks <small class="lib-meta">(Class Teacher)</small></div>' +
    '<div class="ct-form"><select id="mk-section" class="input-field"></select><select id="mk-student" class="input-field"><option value="">Select student…</option></select></div>' +
    '<div id="mk-existing" class="mt-1"></div>' +
    '<div id="mk-form" class="hidden"><div class="mk-grid">' +
    '<input id="mk-sem" class="input-field" placeholder="Semester (e.g. 2-1)"><input id="mk-code" class="input-field" placeholder="Subject code">' +
    '<input id="mk-subject" class="input-field" placeholder="Subject name" style="grid-column:span 2">' +
    '<input id="mk-mid" type="number" min="0" max="100" class="input-field" placeholder="Mid marks"><input id="mk-int" type="number" min="0" max="100" class="input-field" placeholder="Internal marks">' +
    '<input id="mk-ext" type="number" min="0" max="100" class="input-field" placeholder="External marks"><input id="mk-semm" type="number" min="0" max="100" class="input-field" placeholder="Semester marks">' +
    '<input id="mk-total" type="number" min="0" max="100" class="input-field" placeholder="Total (auto = internal + external)"><input id="mk-credits" type="number" min="0" max="100" class="input-field" placeholder="Credits">' +
    '<input id="mk-grade" class="input-field" placeholder="Grade (auto if blank)"><input id="mk-gp" type="number" step="0.1" min="0" max="10" class="input-field" placeholder="Grade point (auto if blank)"></div>' +
    '<button class="btn-success w-100 mt-1" id="mk-save">Save Marks</button></div>';
  try {
    const first = $('result-auth-box') || $('student-results-view') || sec.firstElementChild;
    if (first && first.parentNode) {
      first.parentNode.insertBefore(d, first);
    } else {
      sec.appendChild(d);
    }
  } catch(e) {
    try { sec.appendChild(d); } catch(err) {}
  }
  if ($('mk-section')) $('mk-section').onchange = loadMarkStudents;
  if ($('mk-student')) $('mk-student').onchange = loadMarkStudent;
  if ($('mk-save')) $('mk-save').onclick = saveMarks;
}
async function loadMarksPanel() {
  ensureMarksPanel();
  const d = await get('/marks/my-sections');
  const panel = $('marks-panel');
  if (!d.success || !d.sections.length) { panel.classList.add('hidden'); return; }
  mk.sections = d.sections; panel.classList.remove('hidden');
  $('mk-section').innerHTML = d.sections.map(s => '<option value="' + s.id + '">' + esc(s.branch) + ' • Year ' + s.year + ' • ' + esc(s.section) + ' (' + s.student_count + ')</option>').join('');
  loadMarkStudents();
}
async function loadMarkStudents() {
  const d = await get('/marks/students?assignment=' + encodeURIComponent($('mk-section').value));
  $('mk-student').innerHTML = '<option value="">Select student…</option>' + (d.success ? d.students.map(s => '<option value="' + esc(s.reg_no) + '">' + esc(s.reg_no) + ' — ' + esc(s.name) + '</option>').join('') : '');
  $('mk-existing').innerHTML = ''; $('mk-form').classList.add('hidden');
}
async function loadMarkStudent() {
  const reg = $('mk-student').value;
  if (!reg) { $('mk-existing').innerHTML = ''; $('mk-form').classList.add('hidden'); return; }
  const d = await get('/marks/student/' + encodeURIComponent(reg));
  if (!d.success) return showToast(d.message || 'Unable to load.');
  mk.student = reg; mk.rows = d.results; paintMarkRows(d.summary); $('mk-form').classList.remove('hidden');
}
function paintMarkRows(summary) {
  $('mk-existing').innerHTML = '<p class="lib-meta">CGPA: <b>' + (summary && summary.cgpa !== null ? summary.cgpa : '—') + '</b> • tap a subject to edit it, or fill the form below to add one.</p>' +
    (mk.rows.length ? mk.rows.map((r, i) => '<div class="list-item mb-1 mk-row" data-i="' + i + '" style="cursor:pointer"><div class="list-icon grad-blue">' + esc(r.grade) + '</div><div class="list-content"><h4>' + esc(r.subject) + '</h4>' +
      '<p>Sem ' + esc(r.semester) + ' • ' + esc(r.subject_code) + ' • Mid ' + mv(r.mid_marks) + ' • Int ' + mv(r.internal_marks) + ' • Ext ' + mv(r.external_marks) + ' • Total ' + mv(r.total) + '</p></div></div>').join('') : '<div class="state-box">No marks entered for this student yet.</div>');
  $('mk-existing').querySelectorAll('.mk-row').forEach(el => el.onclick = () => {
    const r = mk.rows[+el.dataset.i], set = (id, v) => { $(id).value = (v === null || v === undefined) ? '' : v; };
    set('mk-sem', r.semester); set('mk-code', r.subject_code); set('mk-subject', r.subject); set('mk-mid', r.mid_marks); set('mk-int', r.internal_marks);
    set('mk-ext', r.external_marks); set('mk-semm', r.semester_marks); set('mk-total', r.total); set('mk-credits', r.credits); set('mk-grade', r.grade); set('mk-gp', r.grade_point);
    $('mk-sem').scrollIntoView({behavior: 'smooth', block: 'center'});
  });
}
async function saveMarks() {
  if (!mk.student) return showToast('Select a student first.');
  const btn = $('mk-save'); btn.disabled = true;
  try {
    const d = await send('/marks/save', {regNo: mk.student, semester: $('mk-sem').value, subjectCode: $('mk-code').value, subject: $('mk-subject').value,
      mid: $('mk-mid').value, internal: $('mk-int').value, external: $('mk-ext').value, semesterMarks: $('mk-semm').value, total: $('mk-total').value,
      credits: $('mk-credits').value, grade: $('mk-grade').value, gradePoint: $('mk-gp').value});
    showToast(d.message || (d.success ? 'Saved.' : 'Unable to save.'));
    if (d.success) { mk.rows = d.results; paintMarkRows(d.summary); ['mk-mid','mk-int','mk-ext','mk-semm','mk-total','mk-grade','mk-gp'].forEach(i => $(i).value = ''); }
  } finally { btn.disabled = false; }
}

// ---------------------------------------------------------------- ACHIEVEMENTS
const CATS = ['Academic', 'Technical', 'Sports', 'Cultural', 'Hackathon', 'Research / Paper', 'Certification / Course', 'Other'];
let achFile = null, reviewFilter = 'mine';
function pillFor(state) { return '<span class="pill ' + (state === 'Approved' ? 'ok' : state === 'Rejected' ? 'bad' : 'warn') + '">' + esc(state) + '</span>'; }
function fileLink(a) {
  if (!a.has_file) return '<span class="lib-meta">No proof attached</span>';
  return '<a class="btn-secondary ach-proof" target="_blank" rel="noopener" href="' + API_BASE + '/achievements/' + a.id + '/file?t=' + encodeURIComponent(currentUser.token) + '"><i class="fas fa-paperclip"></i> View proof (' + esc(a.file_name) + ')</a>';
}
function timeline(a) {
  const steps = a.history.map(h => {
    const icon = h.action === 'Rejected' ? 'fa-circle-xmark' : h.action === 'Approved' ? 'fa-circle-check' : 'fa-paper-plane';
    const who = h.stage === 'STUDENT' ? 'Student' : esc(h.actor_role || h.stage);
    return '<div class="tl-step ' + (h.action === 'Rejected' ? 'bad' : 'ok') + '"><i class="fas ' + icon + '"></i><div><b>' + esc(h.action) + '</b> by ' + esc(h.actor_name || '—') + ' <span class="lib-meta">(' + who + ')</span>' +
      '<div class="lib-meta">' + when(h.at) + '</div>' + (h.remarks ? '<div class="tl-remark">“' + esc(h.remarks) + '”</div>' : '') + '</div></div>';
  }).join('');
  const waiting = a.state === 'Pending' ? '<div class="tl-step wait"><i class="fas fa-hourglass-half"></i><div><b>' + esc(a.status) + '</b></div></div>' : '';
  return '<div class="timeline">' + steps + waiting + '</div>';
}
function achCard(a, reviewer) {
  return '<div class="list-item lib-card ach-card"><div class="lib-card-top"><div><h4>' + esc(a.title) + '</h4>' +
    '<div class="lib-meta">' + esc(a.category) + ' • ' + esc(a.ach_date) + (reviewer ? ' • ' + esc(a.student_name) + ' (' + esc(a.reg_no) + ') • ' + esc(a.student_info) : '') + '</div></div>' + pillFor(a.state) + '</div>' +
    '<p style="font-size:13px">' + esc(a.description) + '</p>' +
    '<div class="lib-meta">Status: <b>' + esc(a.status) + '</b></div>' + fileLink(a) + timeline(a) +
    (reviewer && a.can_act ? '<textarea class="input-field" id="rm-' + a.id + '" rows="2" placeholder="Remarks (required when rejecting)" style="resize:none"></textarea>' +
      '<div class="lib-actions"><button class="btn-success" data-act="approve" data-id="' + a.id + '">Approve</button><button class="btn-danger" data-act="reject" data-id="' + a.id + '">Reject</button></div>' : '') + '</div>';
}
function ensureAchSection() {
  addSection('sec-achievements', back +
    '<div id="ach-student" class="hidden">' +
    '<div class="card mb-2" style="border-top:4px solid #f9d423"><div class="section-title"><i class="fas fa-trophy"></i> Submit an Achievement</div>' +
    '<input id="ach-title" class="input-field mb-1" placeholder="Achievement title" maxlength="150">' +
    '<textarea id="ach-desc" class="input-field mb-1" rows="3" placeholder="Description" style="resize:none"></textarea>' +
    '<div class="ct-form"><input id="ach-date" type="date" class="input-field"><select id="ach-cat" class="input-field"><option value="">Category…</option>' + CATS.map(c => '<option>' + c + '</option>').join('') + '</select></div>' +
    '<label class="lib-meta" style="display:block;margin:8px 0 4px">Certificate / proof (image or PDF, up to about 3 MB)</label>' +
    '<input id="ach-file" type="file" accept="image/*,application/pdf" style="color:var(--text-main)"><div id="ach-file-info" class="lib-meta"></div>' +
    '<button class="btn-primary w-100 mt-1" id="ach-submit">Submit for Approval</button>' +
    '<p class="lib-meta" style="margin-top:8px">Approval path: Class Teacher → HOD → Principal.</p></div></div>' +
    '<div class="card"><div class="section-title" id="ach-list-title">My Achievements</div>' +
    '<div id="ach-filter-box" class="lib-filters hidden"><select id="ach-filter" class="input-field"><option value="mine">Awaiting my action</option><option value="all">All achievements</option></select></div>' +
    '<div id="ach-list" class="card-list"></div></div>');
  const f = $('ach-file');
  if (f && !f.dataset.w) {
    f.dataset.w = 1;
    f.onchange = onAchFile;
    $('ach-submit').onclick = submitAch;
    $('ach-date').max = new Date().toISOString().slice(0, 10);
    $('ach-filter').onchange = () => { reviewFilter = $('ach-filter').value; loadAch(); };
    $('ach-list').addEventListener('click', onReviewClick);
  }
}
function readAsDataURL(file) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); }); }
function shrinkToJpeg(dataUrl, max) {
  return new Promise((res, rej) => {
    const im = new Image(); im.onerror = rej;
    im.onload = () => {
      const k = Math.min(1, max / im.width, max / im.height), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    im.src = dataUrl;
  });
}
async function onAchFile(e) {
  const f = e.target.files[0]; achFile = null; $('ach-file-info').innerText = '';
  if (!f) return;
  try {
    if (f.type === 'application/pdf') {
      if (f.size > 2900000) { e.target.value = ''; return showToast('PDF is too large (max about 3 MB).'); }
      achFile = {name: f.name, data: await readAsDataURL(f)};
    } else if (f.type.startsWith('image/')) {
      achFile = {name: f.name.replace(/\.[^.]+$/, '') + '.jpg', data: await shrinkToJpeg(await readAsDataURL(f), 1600)};
    } else { e.target.value = ''; return showToast('Please choose an image or a PDF.'); }
    $('ach-file-info').innerText = 'Attached: ' + achFile.name;
  } catch (er) { e.target.value = ''; showToast('Unable to read that file.'); }
}
async function submitAch() {
  const btn = $('ach-submit');
  const body = {title: $('ach-title').value, description: $('ach-desc').value, date: $('ach-date').value, category: $('ach-cat').value, file: achFile};
  if (!body.title.trim() || !body.description.trim() || !body.date || !body.category) return showToast('Please fill title, description, date and category.');
  btn.disabled = true;
  try {
    const d = await send('/achievements/submit', body);
    showToast(d.message || (d.success ? 'Submitted.' : 'Unable to submit.'));
    if (d.success) {
      ['ach-title', 'ach-desc', 'ach-date', 'ach-cat', 'ach-file'].forEach(i => $(i).value = '');
      achFile = null; $('ach-file-info').innerText = ''; loadAch();
    }
  } finally { btn.disabled = false; }
}
async function onReviewClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id, action = b.dataset.act, remarks = ($('rm-' + id) || {}).value || '';
  if (action === 'reject' && !remarks.trim()) return showToast('Please give a reason for rejecting.');
  b.disabled = true;
  const d = await send('/achievements/' + id + '/decide', {action, remarks});
  showToast(d.message || (d.success ? 'Done.' : 'Unable to complete.'));
  loadAch();
}
async function openAchievements() {
  ensureAchSection();
  const student = role() === 'student';
  $('ach-student').classList.toggle('hidden', !student);
  $('ach-filter-box').classList.toggle('hidden', student);
  $('ach-list-title').innerText = student ? 'My Achievements' : (role() === 'admin' ? 'Student Achievements (view only)' : 'Student Achievements for Review');
  if (role() === 'admin') { reviewFilter = 'all'; $('ach-filter').value = 'all'; $('ach-filter').querySelector('option[value="mine"]').hidden = true; }
  loadAch();
}
async function loadAch() {
  const box = $('ach-list'); if (!box) return;
  const student = role() === 'student';
  const d = await get(student ? '/achievements/mine' : '/achievements/review');
  if (!d.success) { box.innerHTML = '<div class="state-box"><i class="fas fa-triangle-exclamation"></i>' + esc(d.message || 'Unable to load.') + '</div>'; return; }
  let list = d.achievements;
  if (!student && reviewFilter === 'mine') list = list.filter(a => a.can_act);
  box.innerHTML = list.length ? list.map(a => achCard(a, !student)).join('') :
    '<div class="state-box"><i class="fas fa-inbox"></i>' + (student ? 'You have not submitted any achievements yet.' : (reviewFilter === 'mine' ? 'Nothing is waiting for your approval.' : 'No achievements found.')) + '</div>';
}

})();
