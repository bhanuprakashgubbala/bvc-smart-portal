// upgrades.js - additive upgrade layer. Loaded AFTER app.js; it wraps/extends existing
// functions (library, transport, toast, modals) and never deletes an existing feature.
(function () {
'use strict';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = id => document.getElementById(id);
const REQUEST_ROLES = ['student', 'faculty', 'hod', 'principal'];
const isLibStaff = () => currentUser && (currentUser.role === 'admin' || currentUser.role === 'librarian');

// ------------------------------------------------------------------ SOUND
const Sound = {
  on: (function(){ try { return localStorage.getItem('bvc_sound') !== 'off'; } catch (e) { return true; } })(),
  ctx: null,
  tone(freqs, dur, vol) {
    if (!this.on) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      let t = this.ctx.currentTime;
      freqs.forEach(f => {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t + dur + 0.02);
        t += dur * 0.7;
      });
    } catch (e) { /* audio blocked - never force it */ }
  },
  click()   { this.tone([620], 0.05, 0.035); },
  open()    { this.tone([420, 560], 0.07, 0.04); },
  close()   { this.tone([520, 380], 0.07, 0.035); },
  success() { this.tone([520, 780], 0.1, 0.05); },
  error()   { this.tone([260, 200], 0.14, 0.05); },
  notify()  { this.tone([700, 880], 0.08, 0.04); },
  set(on) {
    this.on = on;
    try { localStorage.setItem('bvc_sound', on ? 'on' : 'off'); } catch (e) {}
    refreshSoundBtn();
    if (on) this.success();
  }
};
function refreshSoundBtn() {
  const b = $('sound-toggle'); if (!b) return;
  b.innerHTML = '<i class="fas ' + (Sound.on ? 'fa-volume-up' : 'fa-volume-mute') + '"></i>';
  b.title = Sound.on ? 'Sound effects: ON (click to mute)' : 'Sound effects: OFF (click to enable)';
  b.setAttribute('aria-pressed', String(Sound.on));
}
window.toggleSound = () => Sound.set(!Sound.on);

// ---- toast wrapper: same toast system, plus type styling + matching sound
const _toast = showToast;
showToast = function (message) {
  _toast.apply(this, arguments);
  const c = $('toast-container');
  const el = c && c.lastElementChild;
  const m = String(message || '').toLowerCase();
  let kind = 'info';
  if (/(error|fail|unable|invalid|required|denied|not found|already|no copies|wrong|cannot|rejected)/.test(m)) kind = 'error';
  else if (/(success|saved|submitted|approved|issued|returned|added|updated|created|done|registered)/.test(m)) kind = 'success';
  if (el) {
    el.classList.add('toast-' + kind);
    if (kind === 'success' && !/^[✓✔]/.test(el.innerText)) el.innerText = '✓ ' + el.innerText;
    if (kind === 'error' && !/^⚠/.test(el.innerText)) el.innerText = '⚠ ' + el.innerText;
    setTimeout(() => el.classList.add('toast-leave'), 2700);
  }
  Sound[kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'notify']();
};

// ---- modal close animation + sound (original closeModal still does the real work)
const _closeModal = closeModal;
closeModal = function (id) {
  const m = $(id);
  if (m && !m.classList.contains('hidden')) {
    m.classList.add('closing'); Sound.close();
    setTimeout(() => { m.classList.remove('closing'); _closeModal(id); }, 180);
  } else { _closeModal(id); }
};

// ---- opening a module
const _showSection = showSection;
showSection = function (id) {
  try { if (_showSection) _showSection.apply(this, arguments); } catch (e) { console.warn('upgrades _showSection error:', e); }
  try { Sound.open(); } catch (e) {}
  if (id === 'library') { try { switchLibraryTab('catalog'); } catch (e) {} }
};

// ---- global click sound + ripple (user-gesture triggered only)
document.addEventListener('click', function (e) {
  const t = e.target.closest('button, .app-item, .nav-links li, .icon-btn, .list-item[onclick], .profile-avatar');
  if (!t) return;
  if (t.id !== 'sound-toggle') Sound.click();
  if (t.tagName === 'BUTTON') {
    const r = t.getBoundingClientRect(), d = document.createElement('span');
    d.className = 'ripple-dot'; d.style.left = (e.clientX - r.left) + 'px'; d.style.top = (e.clientY - r.top) + 'px';
    t.appendChild(d); setTimeout(() => d.remove(), 600);
  }
}, true);

// ------------------------------------------------------------------ HELPERS
const skeleton = n => Array.from({length: n}, () => '<div class="skel"></div>').join('');
const empty = (icon, msg) => '<div class="state-box"><i class="fas ' + icon + '"></i>' + esc(msg) + '</div>';
async function api(path, opts) {
  opts = Object.assign({}, opts);
  if (currentUser && currentUser.token) opts.headers = Object.assign({}, opts.headers, {'X-Auth-Token': currentUser.token});   // secure login token
  const res = await fetch(API_BASE + path, opts);
  return res.json();
}
const post = (path, body) => api(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
async function busy(btn, fn) {          // disables a button while an async action runs
  if (btn) { btn.disabled = true; }
  try { return await fn(); } finally { if (btn) btn.disabled = false; }
}
const fmtDate = d => d ? String(d).slice(0, 10) : '—';

// ------------------------------------------------------------------ LIBRARY
let libTimer = null, libCats = null;
function ensureCatalogControls() {
  if ($('lib-filter-row')) return;
  const box = $('lib-panel-catalog'), list = $('library-body');
  if (!box || !list) return;
  const row = document.createElement('div');
  row.className = 'lib-filters'; row.id = 'lib-filter-row';
  row.innerHTML =
    '<select id="lib-cat" class="input-field" aria-label="Category"><option value="">All categories</option></select>' +
    '<select id="lib-avail" class="input-field" aria-label="Availability"><option value="">All books</option><option value="available">Available now</option><option value="issued">Has issued copies</option></select>' +
    '<select id="lib-sort" class="input-field" aria-label="Sort"><option value="title">Sort: Title</option><option value="author">Sort: Author</option><option value="availability">Sort: Most available</option></select>';
  box.insertBefore(row, list);
  ['lib-cat', 'lib-avail', 'lib-sort'].forEach(i => $(i).addEventListener('change', () => fetchBooks()));
  const s = $('lib-search'); if (s) s.placeholder = 'Search by Title, Author, ISBN, Book ID, Category or Subject...';
}
function bookCard(b) {
  const canReq = currentUser && REQUEST_ROLES.includes(currentUser.role);
  const st = b.available > 0 ? '<span class="pill ok">Available</span>' : '<span class="pill bad">All issued</span>';
  const rets = [];
  if (b.due_today) rets.push('Returning today: <b>' + b.due_today + '</b>');
  if (b.due_tomorrow) rets.push('Returning tomorrow: <b>' + b.due_tomorrow + '</b>');
  b.future_returns.forEach(f => rets.push(esc(f.date) + ': <b>' + f.count + '</b>'));
  if (b.overdue) rets.push('<span style="color:#ff6b7a">Overdue: <b>' + b.overdue + '</b></span>');
  return '<div class="list-item lib-card">' +
    '<div class="lib-card-top"><div><strong>' + esc(b.title) + '</strong> by ' + esc(b.author) +
    '<div class="lib-meta">ISBN: ' + esc(b.isbn) + ' • ID: ' + b.id + (b.category ? ' • ' + esc(b.category) : '') + (b.subject ? ' • ' + esc(b.subject) : '') + '</div></div>' + st + '</div>' +
    '<div class="lib-counts"><div><b>' + b.copies + '</b>Total</div><div><b>' + b.available + '</b>Available</div><div><b>' + b.issued + '</b>Issued</div><div><b>' + b.pending_requests + '</b>Requested</div></div>' +
    (rets.length ? '<div class="lib-returns"><i class="fas fa-undo-alt"></i> Expected returns — ' + rets.join(' • ') + '</div>' : '') +
    (canReq ? '<div class="lib-actions"><button class="btn-primary" onclick="reserveBook(' + b.id + ', this)"><i class="fas fa-paper-plane"></i> ' + (b.available > 0 ? 'Request Book' : 'Request (join waitlist)') + '</button></div>' : '') +
    '</div>';
}
fetchBooks = async function () {
  ensureCatalogControls();
  const list = $('library-body'); if (!list) return;
  list.innerHTML = skeleton(3);
  const q = encodeURIComponent(($('lib-search') || {}).value || '');
  const cat = encodeURIComponent(($('lib-cat') || {}).value || '');
  const av = encodeURIComponent(($('lib-avail') || {}).value || '');
  const so = encodeURIComponent(($('lib-sort') || {}).value || 'title');
  try {
    const d = await api('/library/search?q=' + q + '&category=' + cat + '&availability=' + av + '&sort=' + so);
    if (!d.success) throw new Error('bad response');
    const sel = $('lib-cat');
    if (sel && JSON.stringify(libCats) !== JSON.stringify(d.categories)) {
      const cur = sel.value; libCats = d.categories;
      sel.innerHTML = '<option value="">All categories</option>' + d.categories.map(c => '<option>' + esc(c) + '</option>').join('');
      sel.value = cur;
    }
    list.innerHTML = d.books.length ? d.books.map(bookCard).join('') : empty('fa-book-open', 'No books match your search.');
  } catch (e) {
    list.innerHTML = empty('fa-exclamation-triangle', 'Unable to load the catalog. Please try again.');
  }
};
filterBooks = function () { clearTimeout(libTimer); libTimer = setTimeout(fetchBooks, 250); };

reserveBook = async function (bookId, btn) {
  if (!currentUser) return;
  await busy(btn, async () => {
    try {
      const d = await post('/library/reserve', {regNo: currentUser.reg_no, book_id: bookId});
      showToast(d.message || (d.success ? 'Book request submitted successfully' : 'Unable to submit request. Please try again.'));
      if (d.success) fetchBooks();
    } catch (e) { showToast('Unable to submit request. Please try again.'); }
  });
};

fetchBorrowHistory = async function () {
  const box = $('borrowings-body');
  if (!currentUser || !box || !REQUEST_ROLES.includes(currentUser.role)) return;
  box.innerHTML = skeleton(2);
  try {
    const [h, r] = await Promise.all([api('/library/history/' + encodeURIComponent(currentUser.reg_no)), api('/library/requests?reg_no=' + encodeURIComponent(currentUser.reg_no))]);
    const today = new Date().toISOString().slice(0, 10);
    let html = '';
    if (r.requests.length) html += '<div class="section-title" style="font-size:14px">My Requests</div>' + r.requests.map(q =>
      '<div class="list-item" style="flex-direction:column;background:rgba(0,0,0,.2)"><div style="display:flex;justify-content:space-between;width:100%"><strong>' + esc(q.title) + '</strong><span class="pill ' + (q.status === 'Approved' ? 'ok' : q.status === 'Rejected' ? 'bad' : 'warn') + '">' + esc(q.status) + '</span></div><span class="lib-meta">Requested: ' + fmtDate(q.requested_date) + (q.remarks ? ' • Note: ' + esc(q.remarks) : '') + '</span></div>').join('');
    html += '<div class="section-title" style="font-size:14px;margin-top:10px">My Borrowings</div>';
    html += h.history.length ? h.history.map(x => {
      const od = x.status === 'Issued' && x.due_date && fmtDate(x.due_date) < today;
      return '<div class="list-item" style="flex-direction:column;background:rgba(0,0,0,.2)"><div style="display:flex;justify-content:space-between;width:100%"><strong>' + esc(x.title) + '</strong><span class="pill ' + (x.status === 'Returned' ? 'ok' : od ? 'bad' : 'warn') + '">' + (od ? 'Overdue' : esc(x.status)) + '</span></div><span class="lib-meta">Issued: ' + fmtDate(x.issue_date) + ' | Due: ' + fmtDate(x.due_date) + (x.return_date ? ' | Returned: ' + fmtDate(x.return_date) : '') + (x.fine_calculated ? ' | Fine: ₹' + x.fine_calculated : '') + '</span></div>';
    }).join('') : empty('fa-history', 'No borrowing history yet.');
    box.innerHTML = html;
  } catch (e) { box.innerHTML = empty('fa-exclamation-triangle', 'Unable to load your borrowings.'); }
};

function ensureAdminLibraryUI() {
  const panel = $('lib-panel-admin');
  if (!panel || $('lib-extra-stats')) return;
  const first = panel.querySelector('.card');
  const extra = document.createElement('div');
  extra.innerHTML =
    '<div class="card mb-2"><div class="stat-grid" id="lib-extra-stats"></div></div>' +
    '<div class="card mb-2" style="border-top:4px solid #43e97b"><div class="section-title">Book Requests</div><div class="card-list" id="lib-requests-body" style="max-height:320px;overflow-y:auto"></div></div>' +
    '<div class="card mb-2" style="border-top:4px solid #a29bfe"><div class="section-title">Library Transactions</div>' +
    '<select id="lib-tx-filter" class="input-field mb-1"><option value="all">All</option><option value="issued">Issued</option><option value="returned">Returned</option><option value="overdue">Overdue</option></select>' +
    '<div class="card-list" id="lib-tx-body" style="max-height:300px;overflow-y:auto"></div></div>';
  Array.from(extra.children).reverse().forEach(n => first.after(n));
  $('lib-tx-filter').addEventListener('change', loadTransactions);
  const issuedTo = $('add-book-issued-to');
  if (issuedTo && !$('add-book-copies')) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'grid-column:span 2;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px';
    wrap.innerHTML = '<input type="number" min="1" id="add-book-copies" class="input-field mb-1" placeholder="Copies (e.g. 10)"><input type="text" id="add-book-category" class="input-field mb-1" placeholder="Category"><input type="text" id="add-book-subject" class="input-field mb-1" placeholder="Subject">';
    issuedTo.after(wrap);
  }
}
async function loadRequests() {
  const box = $('lib-requests-body'); if (!box) return;
  box.innerHTML = skeleton(2);
  try {
    const d = await api('/library/requests?status=Pending');
    box.innerHTML = d.requests.length ? d.requests.map(q =>
      '<div class="list-item" style="flex-direction:column;background:rgba(0,0,0,.25)"><div><strong>' + esc(q.title) + '</strong><div class="lib-meta">' + esc(q.requester_name || q.reg_no) + ' (' + esc(q.reg_no) + (q.requester_role ? ', ' + esc(q.requester_role) : '') + ') • ' + fmtDate(q.requested_date) + ' • Copies available: <b>' + q.available + '</b></div></div>' +
      '<div class="lib-actions"><button class="btn-success" ' + (q.available > 0 ? '' : 'disabled title="No copy available"') + ' onclick="decideBookRequest(' + q.id + ',\'approve\',this)">Approve & Issue</button><button class="btn-danger" onclick="decideBookRequest(' + q.id + ',\'reject\',this)">Reject</button></div></div>').join('')
      : empty('fa-inbox', 'No pending book requests.');
  } catch (e) { box.innerHTML = empty('fa-exclamation-triangle', 'Unable to load requests.'); }
}
window.decideBookRequest = async function (id, action, btn) {
  let remarks = '';
  if (action === 'reject') { remarks = prompt('Reason for rejection (optional):') || ''; }
  await busy(btn, async () => {
    const d = await post('/library/request/decide', {id, action, remarks, by: currentUser.reg_no});
    showToast(d.message || (d.success ? 'Done' : 'Unable to process request.'));
    fetchLibraryStats();
  });
};
async function loadTransactions() {
  const box = $('lib-tx-body'); if (!box) return;
  const f = ($('lib-tx-filter') || {}).value || 'all';
  box.innerHTML = skeleton(2);
  try {
    const d = await api('/library/transactions?filter=' + f);
    box.innerHTML = d.transactions.length ? d.transactions.map(t =>
      '<div class="list-item" style="justify-content:space-between;background:rgba(0,0,0,.25)"><div><strong>' + esc(t.title) + '</strong><div class="lib-meta">' + esc(t.user_name || '') + ' ' + esc(t.reg_no) + ' • Issued ' + fmtDate(t.issue_date) + ' • Due ' + fmtDate(t.due_date) + (t.return_date ? ' • Returned ' + fmtDate(t.return_date) : '') + (t.fine_calculated ? ' • Fine ₹' + t.fine_calculated : '') + '</div></div><span class="pill ' + (t.overdue ? 'bad' : t.status === 'Returned' ? 'ok' : 'warn') + '">' + (t.overdue ? 'Overdue' : esc(t.status)) + '</span></div>').join('')
      : empty('fa-exchange-alt', 'No transactions for this filter.');
  } catch (e) { box.innerHTML = empty('fa-exclamation-triangle', 'Unable to load transactions.'); }
}
fetchLibraryStats = async function () {
  ensureAdminLibraryUI();
  try {
    const d = await api('/library/admin/stats');
    if (!d.success) return;
    const s = d.stats;
    $('lib-stat-total').innerText = s.total;
    $('lib-stat-issued').innerText = s.issued;
    $('lib-stat-fines').innerText = '₹' + s.fines;
    const x = $('lib-extra-stats');
    if (x) x.innerHTML = [['Total Copies', s.copies_total, '#fff'], ['Available', s.available, '#43e97b'], ['Pending Requests', s.pending_requests, '#f9d423'], ['Overdue', s.overdue, '#ff4757'], ['Due Today', s.due_today, '#ff9f43'], ['Returned', s.returned, '#a29bfe']]
      .map(a => '<div style="background:rgba(255,255,255,.05);padding:12px;border-radius:10px"><h4 style="margin:0;color:var(--text-muted);font-size:12px">' + a[0] + '</h4><div style="font-size:22px;font-weight:bold;color:' + a[2] + '">' + a[1] + '</div></div>').join('');
    const t = $('librarian-tracking-body');
    if (t) t.innerHTML = d.recent.length ? d.recent.map(h => '<div class="list-item" style="justify-content:space-between;align-items:center"><div><strong>' + esc(h.reg_no) + '</strong> -> ' + esc(h.title) + '<br><span class="lib-meta">Issued: ' + fmtDate(h.issue_date) + ' • Due: ' + fmtDate(h.due_date) + '</span></div><span class="pill ' + (h.status === 'Returned' ? 'ok' : 'warn') + '">' + esc(h.status) + '</span></div>').join('') : empty('fa-book', 'No library activity yet.');
    loadRequests(); loadTransactions();
  } catch (e) { showToast('Unable to load library statistics.'); }
};

submitNewBook = async function () {     // repaired: the original only changed in-browser memory, never the database
  const v = id => (($(id) || {}).value || '').trim();
  const title = v('add-book-title'), author = v('add-book-author'), isbn = v('add-book-isbn');
  const status = v('add-book-status'), issuedTo = v('add-book-issued-to');
  if (!title || !author || !isbn) return showToast('Title, Author, and ISBN are required!');
  if (status === 'Issued' && !issuedTo) return showToast('Please specify who the book is issued to.');
  const d = await post('/library/add', {title, author, isbn, status, issued_to: status === 'Issued' ? issuedTo : null,
    copies: v('add-book-copies') || null, category: v('add-book-category') || null, subject: v('add-book-subject') || null});
  showToast(d.success ? 'Book saved successfully!' : 'Unable to save book: ' + d.message);
  if (d.success) { ['add-book-title','add-book-author','add-book-isbn','add-book-issued-to','add-book-copies','add-book-category','add-book-subject'].forEach(i => { if ($(i)) $(i).value = ''; }); fetchLibraryStats(); }
};
issueBookToStudent = async function () {
  const isbn = v2('issue-isbn'), regNo = v2('issue-reg');
  if (!isbn || !regNo) return showToast('Enter ISBN and Reg No (required).');
  const d = await post('/library/issue', {isbn, regNo});
  showToast(d.message || 'Done'); if (d.success) fetchLibraryStats();
};
returnBookFromStudent = async function () {
  const isbn = v2('issue-isbn'), regNo = v2('issue-reg');
  if (!isbn) return showToast('ISBN is required.');
  const d = await post('/library/return', {isbn, regNo});
  showToast(d.message || 'Done'); if (d.success) fetchLibraryStats();
};
function v2(id) { return (($(id) || {}).value || '').trim(); }

// role UI: also let faculty/HOD/principal see their own borrowings & requests
const _setupRoleUI = setupRoleUI;
setupRoleUI = function () {
  try { if (_setupRoleUI) _setupRoleUI.apply(this, arguments); } catch(e) { console.warn('upgrades _setupRoleUI error:', e); }
  try {
    if (currentUser) {
      const tab = $('tab-lib-borrowings');
      if (tab) tab.style.display = REQUEST_ROLES.includes(currentUser.role) ? 'block' : 'none';
    }
  } catch(e) {}
};

// ------------------------------------------------------------------ TRANSPORT
let busInfo = {};
const STATUS_TXT = {ACTIVE: '🟢 On Route', STOPPED: '⚪ Not Running', PAUSED: '🟡 Paused', EMERGENCY: '🔴 Emergency'};
function busExtraHtml(b) {
  if (!b) return '';
  const used = b.total_seats ? Math.round(100 * b.filled_seats / b.total_seats) : 0;
  const live = b.data_source === 'LIVE_GPS';
  const stops = b.stops.length ? '<div class="stop-line">' + b.stops.map((s, i) => '<div class="' + (i === b.stops.length - 1 ? 'dest' : '') + '">' + esc(s) + (i === 0 ? ' <small>(start)</small>' : i === b.stops.length - 1 ? ' <small>(destination)</small>' : '') + '</div>').join('') + '</div>' : '';
  return '<div class="bus-extra">' +
    '<div class="bus-live-head"><b>' + esc(STATUS_TXT[b.status] || b.status) + '</b><span class="bus-source ' + (live ? 'live' : '') + '">' + (live ? 'Live GPS' : 'No live GPS feed — status from driver controls') + '</span></div>' +
    '<div style="font-size:13px">Route: <b>' + esc(b.route) + '</b><br>Driver: <b>' + esc(b.driver_name) + '</b>' + (b.driver_phone ? ' • <a href="tel:' + esc(b.driver_phone) + '" style="color:#fff">' + esc(b.driver_phone) + '</a>' : '') + '</div>' +
    (b.status === 'ACTIVE' && b.destination ? '<div style="font-size:13px">Heading to: <b>' + esc(b.destination) + '</b></div>' : '') +
    stops +
    '<div style="font-size:12px">Seats: <b>' + b.filled_seats + '/' + b.total_seats + '</b> filled • ' + b.free_seats + ' free</div><div class="cap-bar"><span style="width:' + used + '%"></span></div>' +
    '<div style="font-size:12px;color:var(--text-muted)">Pickup requests pending: ' + b.pending_pickups + ' • Open alerts: ' + b.open_alerts + (b.last_updated ? ' • Last update: ' + esc(b.last_updated) : '') + '</div>' +
    '<div style="font-size:11px;color:var(--text-muted)">Current/next-stop & ETA need stop coordinates and a live GPS feed; they are shown only when that data exists.</div></div>';
}
async function refreshBusExtras() {
  try {
    const d = await api('/bus/details'); if (!d.success) return;
    d.data.forEach(b => busInfo[b.bus_no] = b);
    const panel = $('bus-telemetry-panel');
    if (panel) {
      let ex = $('bus-extra'); if (!ex) { ex = document.createElement('div'); ex.id = 'bus-extra'; panel.appendChild(ex); }
      ex.innerHTML = (typeof currentSelectedBus !== 'undefined' && currentSelectedBus) ? busExtraHtml(busInfo[currentSelectedBus]) : '';
    }
    const fleet = $('admin-bus-view');
    if (fleet && currentUser && currentUser.role === 'admin') {
      fleet.querySelectorAll('.fleet-card').forEach(n => n.remove());
      d.data.forEach(b => {
        const c = document.createElement('div'); c.className = 'card fleet-card';
        c.innerHTML = '<b>🚌 ' + esc(b.bus_no) + '</b><div style="font-size:12px;margin:4px 0">' + esc(STATUS_TXT[b.status] || b.status) + '</div><div style="font-size:11px;color:var(--text-muted)">' + esc(b.route) + '<br>' + b.filled_seats + '/' + b.total_seats + ' seats • ' + esc(b.driver_name) + '</div>';
        c.onclick = () => { const s = $('bus-selector'); if (s) { s.value = b.bus_no; } selectBus(b.bus_no); };
        fleet.appendChild(c);
      });
    }
  } catch (e) { /* details are optional; original telemetry still works */ }
}
const _loadBuses = loadBuses;
loadBuses = async function () { await _loadBuses.apply(this, arguments); await refreshBusExtras(); };
const _updateTelemetry = updateTelemetry;
updateTelemetry = function (bus) {
  _updateTelemetry.apply(this, arguments);
  if (!bus) return;
  const badge = $('bus-status-badge');
  const info = busInfo[bus.bus_no];
  if (badge) badge.innerText = (STATUS_TXT[bus.status] || bus.status) + (info && info.data_source === 'LIVE_GPS' ? ' • LIVE GPS' : ' • NO LIVE GPS');
  const ns = $('telemetry-next-stop');
  if (ns && info && bus.status === 'ACTIVE' && info.destination) ns.innerText = info.destination;
};

// ------------------------------------------------------------------ MY PROFILE + SAVED SIGNATURE
const PROFILE_ROLES = ['faculty', 'hod', 'principal', 'admin', 'student'];
let myProfile = null, padDirty = false;
const hasProfile = () => currentUser && PROFILE_ROLES.includes(currentUser.role);

// shrink an image file in the browser before uploading (keeps PNG transparency for signatures)
function shrinkImage(file, maxW, maxH, mime) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('read'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('img'));
      img.onload = () => {
        const k = Math.min(1, maxW / img.width, maxH / img.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const x = c.getContext('2d');
        if (mime === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
        x.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL(mime, 0.85));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function ensureProfileSection() {
  if ($('sec-profile')) return;
  const ref = $('sec-quicklinks'); if (!ref) return;
  const sec = document.createElement('section');
  sec.id = 'sec-profile'; sec.className = 'content-section hidden';
  sec.innerHTML =
    '<button class="btn-secondary mb-2" style="font-size:12px;padding:5px 12px;border-radius:20px;display:inline-flex;align-items:center;gap:5px" onclick="showSection(\'dashboard\')"><i class="fas fa-arrow-left"></i> Back to Home</button>' +
    '<div class="card mb-2" style="text-align:center">' +
      '<div id="pf-photo" class="profile-avatar" style="width:90px;height:90px;font-size:34px;margin:0 auto 10px;background-size:cover;background-position:center">G</div>' +
      '<h3 id="pf-title" style="margin:0">My Profile</h3><div id="pf-role" class="lib-meta" style="text-transform:uppercase;margin-bottom:10px"></div>' +
      '<div class="lib-actions" style="justify-content:center"><label class="btn-secondary" style="cursor:pointer;padding:6px 14px;border-radius:10px;font-size:12px"><i class="fas fa-camera"></i> Change photo<input type="file" id="pf-photo-file" accept="image/*" style="display:none"></label>' +
      '<button class="btn-secondary" id="pf-photo-remove" style="font-size:12px">Remove photo</button></div></div>' +
    '<div class="card mb-2"><div class="section-title"><i class="fas fa-user-edit"></i> Personal Information</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
      '<input id="pf-name" class="input-field mb-1" placeholder="Full name" style="grid-column:span 2">' +
      '<input id="pf-phone" class="input-field mb-1" placeholder="Phone (10 digits)" inputmode="numeric" maxlength="10">' +
      '<input id="pf-email" class="input-field mb-1" placeholder="Email">' +
      '<input id="pf-designation" class="input-field mb-1" placeholder="Designation (e.g. Asst. Professor)" style="grid-column:span 2">' +
      '<input id="pf-id" class="input-field mb-1" disabled title="Assigned by admin">' +
      '<input id="pf-branch" class="input-field mb-1" disabled title="Assigned by admin">' +
      '<details style="grid-column:span 2;margin-bottom:8px"><summary style="cursor:pointer;font-size:13px">Change password (optional)</summary>' +
      '<input id="pf-curpw" type="password" class="input-field mb-1" placeholder="Current password" style="margin-top:8px">' +
      '<input id="pf-newpw" type="password" class="input-field mb-1" placeholder="New password (min 4 characters)"></details>' +
      '<button class="btn-primary w-100" style="grid-column:span 2" id="pf-save">Save Personal Information</button></div>' +
      '<p class="lib-meta">If you change your name or phone, use the new details the next time you log in.</p></div>' +
    '<div class="card mb-2" style="border-top:4px solid #f9d423"><div class="section-title"><i class="fas fa-signature"></i> My Signature</div>' +
      '<p id="pf-sig-note" class="lib-meta" style="margin-bottom:10px">Save your signature once. It is then used automatically for every approval and substitute acceptance — you will not be asked for it again.</p>' +
      '<div id="pf-sig-status" style="margin-bottom:10px"></div>' +
      '<div style="background:#fff;border-radius:12px;padding:8px;text-align:center;margin-bottom:10px;min-height:80px"><img id="pf-sig-img" alt="Saved signature" style="max-width:100%;max-height:110px;display:none"><span id="pf-sig-none" style="color:#666;font-size:12px;line-height:80px">No signature saved yet</span></div>' +
      '<div class="lib-actions" style="margin-bottom:12px"><label class="btn-secondary" style="cursor:pointer;padding:6px 14px;border-radius:10px;font-size:12px"><i class="fas fa-upload"></i> Upload signature image<input type="file" id="pf-sig-file" accept="image/*" style="display:none"></label>' +
      '<button class="btn-danger" id="pf-sig-remove" style="font-size:12px">Remove saved signature</button></div>' +
      '<div class="lib-meta" style="margin-bottom:6px">Or draw it below:</div>' +
      '<canvas id="pf-pad" width="520" height="160" style="width:100%;max-width:520px;height:auto;background:#fff;border-radius:12px;touch-action:none;display:block"></canvas>' +
      '<div class="lib-actions" style="margin-top:8px"><button class="btn-secondary" id="pf-pad-clear">Clear</button><button class="btn-success" id="pf-pad-save">Save drawn signature</button></div></div>';
  ref.parentNode.insertBefore(sec, ref);
  wireProfile();
}

function wireProfile() {
  $('pf-save').onclick = saveProfileInfo;
  $('pf-photo-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const img = await shrinkImage(f, 256, 256, 'image/jpeg'); await saveImage(img); }
    catch (er) { showToast('Unable to read that image. Please try another file.'); }
    e.target.value = '';
  };
  $('pf-photo-remove').onclick = () => saveImage(null);
  $('pf-sig-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const img = await shrinkImage(f, 500, 180, 'image/png'); await saveSignature(img); }
    catch (er) { showToast('Unable to read that image. Please try another file.'); }
    e.target.value = '';
  };
  $('pf-sig-remove').onclick = () => { if (confirm('Remove your saved signature? You will be asked for it again on approvals.')) saveSignature(null); };
  // drawing pad
  const cv = $('pf-pad'), cx = cv.getContext('2d'); let drawing = false;
  cx.lineWidth = 2.5; cx.lineCap = 'round'; cx.strokeStyle = '#111';
  const pos = ev => { const r = cv.getBoundingClientRect(), t = ev.touches ? ev.touches[0] : ev; return [(t.clientX - r.left) * cv.width / r.width, (t.clientY - r.top) * cv.height / r.height]; };
  const start = ev => { ev.preventDefault(); drawing = true; padDirty = true; const [x, y] = pos(ev); cx.beginPath(); cx.moveTo(x, y); };
  const move = ev => { if (!drawing) return; ev.preventDefault(); const [x, y] = pos(ev); cx.lineTo(x, y); cx.stroke(); };
  const end = () => { drawing = false; };
  cv.addEventListener('mousedown', start); cv.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  cv.addEventListener('touchstart', start, {passive: false}); cv.addEventListener('touchmove', move, {passive: false}); cv.addEventListener('touchend', end);
  $('pf-pad-clear').onclick = () => { cx.clearRect(0, 0, cv.width, cv.height); padDirty = false; };
  $('pf-pad-save').onclick = () => {
    if (!padDirty) return showToast('Please draw your signature first (required).');
    const out = document.createElement('canvas'); out.width = 400; out.height = 125;
    out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
    saveSignature(out.toDataURL('image/png'));
  };
}

function paintProfile() {
  if (!myProfile) return;
  const p = myProfile;
  $('pf-title').innerText = p.name; $('pf-role').innerText = p.role + (p.branch ? ' • ' + p.branch : '');
  $('pf-name').value = p.name || ''; $('pf-phone').value = p.phone || ''; $('pf-email').value = p.email || '';
  $('pf-designation').value = p.designation || ''; $('pf-id').value = 'ID: ' + p.reg_no; $('pf-branch').value = 'Branch: ' + (p.branch || '—');
  const ph = $('pf-photo');
  if (p.profile_image) { ph.style.backgroundImage = 'url(' + p.profile_image + ')'; ph.innerText = ''; }
  else { ph.style.backgroundImage = ''; ph.innerText = (p.name || 'G').charAt(0).toUpperCase(); }
  const has = !!p.signature;
  $('pf-sig-img').style.display = has ? 'inline-block' : 'none'; if (has) $('pf-sig-img').src = p.signature;
  $('pf-sig-none').style.display = has ? 'none' : 'inline';
  $('pf-sig-status').innerHTML = has ? '<span class="pill ok">✓ Signature saved — used automatically</span>' : '<span class="pill warn">No signature saved — you will be asked on each approval</span>';
  $('pf-sig-remove').style.display = has ? 'inline-block' : 'none';
  const stu = p.role === 'student';           // students: name/branch/year/section are set by admin; phone, email, photo, signature are editable
  $('pf-name').disabled = stu; $('pf-name').title = stu ? 'Name is managed by the college office' : '';
  $('pf-designation').style.display = stu ? 'none' : '';
  if (stu) {
    $('pf-branch').value = 'Branch: ' + (p.branch || '—') + ' • Year ' + (p.year_of_study || '—') + ' • Sec ' + (p.section || '—');
    $('pf-role').innerText = 'student • ' + (p.branch || '') + ' • Year ' + (p.year_of_study || '—') + ' • ' + (p.section || '');
    $('pf-id').value = 'Register No: ' + p.reg_no;
    $('pf-sig-note').innerText = 'Save your digital signature here. It stays on your profile and is used for your documents; you can replace or remove it any time.';
    $('pf-sig-status').innerHTML = has ? '<span class="pill ok">✓ Digital signature saved</span>' : '<span class="pill warn">No digital signature saved yet</span>';
  }
  applyAvatar();
}
function applyAvatar() {
  ['user-avatar', 'sidebar-avatar'].forEach(id => {
    const a = $(id); if (!a || !myProfile) return;
    if (myProfile.profile_image) { a.style.backgroundImage = 'url(' + myProfile.profile_image + ')'; a.style.backgroundSize = 'cover'; a.style.backgroundPosition = 'center'; a.innerText = ''; }
  });
}
async function loadMyProfile() {
  if (!hasProfile()) { myProfile = null; return null; }
  try {
    const d = await api('/profile/' + encodeURIComponent(currentUser.reg_no));
    if (d.success) { myProfile = d.profile; ensureProfileSection(); paintProfile(); }
    else myProfile = null;
  } catch (e) { /* profile is optional; the rest of the portal keeps working */ }
  return myProfile;
}
async function saveProfileInfo() {
  const btn = $('pf-save');
  await busy(btn, async () => {
    const body = {regNo: currentUser.reg_no, name: $('pf-name').value, phone: $('pf-phone').value, email: $('pf-email').value,
                  designation: $('pf-designation').value, currentPassword: $('pf-curpw').value, newPassword: $('pf-newpw').value};
    try {
      const d = await post('/profile/update', body);
      showToast(d.message || (d.success ? 'Profile updated successfully.' : 'Unable to update profile.'));
      if (d.success) {
        $('pf-curpw').value = ''; $('pf-newpw').value = '';
        Object.assign(currentUser, {name: d.user.name, phone: d.user.phone, email: d.user.email, designation: d.user.designation});
        try { localStorage.setItem('bvc_user', JSON.stringify(currentUser)); } catch (e) {}
        if ($('sidebar-name')) $('sidebar-name').innerText = currentUser.name;
        await loadMyProfile();
      }
    } catch (e) { showToast('Unable to update profile. Please try again.'); }
  });
}
async function saveSignature(sig) {
  try {
    const d = await post('/profile/signature', {regNo: currentUser.reg_no, signature: sig});
    showToast(d.message || (d.success ? 'Signature saved.' : 'Unable to save signature.'));
    if (d.success) { if (myProfile) myProfile.signature = sig; paintProfile(); }
  } catch (e) { showToast('Unable to save signature. Please try again.'); }
}
async function saveImage(img) {
  try {
    const d = await post('/profile/image', {regNo: currentUser.reg_no, image: img});
    showToast(d.message || (d.success ? 'Profile photo updated.' : 'Unable to save photo.'));
    if (d.success) {
      if (myProfile) myProfile.profile_image = img;
      paintProfile();
      if (!img) { ['user-avatar', 'sidebar-avatar'].forEach(id => { const a = $(id); if (a) { a.style.backgroundImage = ''; a.innerText = (currentUser.name || 'G').charAt(0).toUpperCase(); } }); }
    }
  } catch (e) { showToast('Unable to save photo. Please try again.'); }
}

function ensureProfileNav() {
  if ($('nav-profile')) return;
  const home = $('nav-dashboard'); if (!home) return;
  const li = document.createElement('li');
  li.id = 'nav-profile'; li.className = 'hidden';
  li.setAttribute('onclick', "showSection('profile'); toggleSidebar();");
  li.innerHTML = '<i class="fas fa-user-circle"></i> My Profile';
  home.after(li);
}
ensureProfileNav();
const _showSection2 = showSection;
showSection = function (id) {
  try {
    if (id === 'profile' && !hasProfile()) return;
    if (id === 'profile') ensureProfileSection();
  } catch(e) {}
  try { if (_showSection2) _showSection2.apply(this, arguments); } catch (e) { console.warn('upgrades _showSection2 error:', e); }
  try {
    if (id === 'profile') { $('section-title').innerText = 'My Profile'; loadMyProfile(); }
  } catch(e) {}
};
// extend the (already wrapped) role UI: show My Profile link + load photo/signature at login
const _setupRoleUI2 = setupRoleUI;
setupRoleUI = function () {
  try { if (_setupRoleUI2) _setupRoleUI2.apply(this, arguments); } catch(e) { console.warn('upgrades _setupRoleUI2 error:', e); }
  try {
    ensureProfileNav(); ensureProfileSection();
    const nav = $('nav-profile'); if (nav) nav.classList.toggle('hidden', !hasProfile());
    if (hasProfile()) {
      loadMyProfile();
      [$('user-avatar'), $('sidebar-avatar')].forEach(a => { if (a && !a.dataset.pf) { a.dataset.pf = 1; a.style.cursor = 'pointer'; a.title = 'My Profile'; a.addEventListener('click', ev => { if (hasProfile()) { if ($('app-sidebar').classList.contains('open')) toggleSidebar(); showSection('profile'); } }); } });
    }
  } catch(e) { console.warn('upgrades profile error:', e); }
};

// approvals: use the saved signature automatically; only ask when none is saved
const _openSig = window.openSignatureModal;
window.openSignatureModal = async function (id, roleStr) {
  if (hasProfile()) {
    let p = myProfile;
    try { const d = await api('/profile/' + encodeURIComponent(currentUser.reg_no)); if (d.success) { p = myProfile = d.profile; } } catch (e) {}
    if (p && p.signature) {
      try {
        const d = await post('/leave/action', {id, role: roleStr, action: 'approve', signature: p.signature, signerRegNo: currentUser.reg_no});
        if (d.success === false) throw new Error(d.message);
        showToast('Approved using your saved signature. Workflow advanced.');
        if (typeof loadLeaveRequests === 'function') loadLeaveRequests();
      } catch (e) { showToast('Unable to complete the approval. Please try again.'); }
      return;
    }
    showToast('No saved signature yet — upload one now, or save it once in My Profile.');
  }
  return _openSig.apply(this, arguments);
};
// hint inside the manual modal when nothing is saved
(function () {
  const m = $('action-signature-modal'); if (!m || $('sig-profile-hint')) return;
  const p = m.querySelector('p'); if (!p) return;
  const h = document.createElement('p'); h.id = 'sig-profile-hint'; h.className = 'lib-meta'; h.style.marginBottom = '10px';
  h.innerHTML = 'Tip: open <b>My Profile</b> in the side menu and save your signature once — you will not be asked again.';
  p.after(h);
})();

// ------------------------------------------------------------------ INIT
document.addEventListener('DOMContentLoaded', refreshSoundBtn);
refreshSoundBtn();
})();
