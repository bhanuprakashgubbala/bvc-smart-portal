// layout_fixes.js - sidebar behaviour, active menu state, section access guard and hardened logout.
// Loaded last, wraps existing functions (same pattern as upgrades.js / portal_features.js). Nothing is removed.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------- SIDEBAR
  function sidebarOpen() { const s = $('app-sidebar'); return !!(s && s.classList.contains('open')); }
  function setSidebar(open) {
    const s = $('app-sidebar'), o = $('sidebar-overlay');
    if (!s || !o) return;
    s.classList.toggle('open', open);
    o.classList.toggle('hidden', !open);
    s.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.querySelectorAll('.top-app-bar .icon-btn .fa-bars').forEach(i => i.parentElement.setAttribute('aria-expanded', open));
    if (open) {
      const sc = $('sidebar-scroll'), act = s.querySelector('.nav-links li.active');
      if (sc && act) act.scrollIntoView({ block: 'nearest' });
    }
  }
  window.toggleSidebar = function () { setSidebar(!sidebarOpen()); };

  // keyboard access: Esc closes sidebar / top modal, Enter or Space activates a menu row
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (sidebarOpen()) { setSidebar(false); return; }
      const open = Array.from(document.querySelectorAll('.modal-overlay:not(.hidden)')).pop();
      if (open && open.id && typeof closeModal === 'function') closeModal(open.id);
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.nav-links li')) {
      e.preventDefault(); e.target.click();
    }
  });

  // make every menu row focusable, including rows added later by other scripts
  function enhanceNav() {
    document.querySelectorAll('.app-sidebar .nav-links li').forEach(li => {
      if (!li.hasAttribute('tabindex')) { li.setAttribute('tabindex', '0'); li.setAttribute('role', 'button'); }
    });
  }
  new MutationObserver(enhanceNav).observe($('app-sidebar') || document.body, { childList: true, subtree: true });
  enhanceNav();

  // ---------------------------------------------------------------- ACTIVE MENU ITEM + ACCESS GUARD
  const ROLE_ONLY = { registration: ['admin'], classteachers: ['admin', 'hod'] };
  function activate(id) {
    document.querySelectorAll('.app-sidebar .nav-links li.active').forEach(li => li.classList.remove('active'));
    const li = $('nav-' + (id === 'registration' ? 'admin-reg' : id));
    if (li) li.classList.add('active');
  }
  if (typeof showSection === 'function') {
    const _show = showSection;
    showSection = function (id) {
      if (typeof currentUser === 'undefined' || !currentUser) return;                       // not logged in
      const allowed = ROLE_ONLY[id];
      if (allowed && !allowed.includes(currentUser.role)) {
        if (typeof showToast === 'function') showToast('You do not have access to that section.');
        return;
      }
      const r = _show.apply(this, arguments);
      activate(id);
      if (typeof updateSidebarNavForSection === 'function') {
        updateSidebarNavForSection(id);
      }
      const main = document.querySelector('.main-content'); if (main) main.scrollTop = 0;
      return r;
    };
    window.showSection = showSection;
  }

  // ---------------------------------------------------------------- LOGOUT (all roles share one path)
  function wipeSession() {
    try { localStorage.removeItem('bvc_user'); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try { currentUser = null; } catch (e) {}
    try { globalData = {}; } catch (e) {}
  }
  window.logout = function () {
    setSidebar(false);
    wipeSession();
    const mp = $('main-portal'); if (mp) mp.classList.add('hidden');
    // replace() removes the protected page from history so Back cannot return to it
    location.replace(location.pathname);
  };

  // protected pages must not reappear from the back/forward cache after logout
  window.addEventListener('pageshow', function (e) {
    let saved = null; try { saved = localStorage.getItem('bvc_user'); } catch (x) {}
    const mp = $('main-portal');
    if (e.persisted && !saved && mp && !mp.classList.contains('hidden')) {
      mp.classList.add('hidden');
      const ls = $('login-screen'); if (ls) ls.classList.remove('hidden');
    }
  });
  // logging out in one tab logs out the other tabs too
  window.addEventListener('storage', function (e) {
    if (e.key === 'bvc_user' && !e.newValue) {
      const mp = $('main-portal'); if (mp) mp.classList.add('hidden');
      const ls = $('login-screen'); if (ls) ls.classList.remove('hidden');
    }
  });

  // close the menu when the viewport changes (rotation / zoom) so it is never left half-open
  window.addEventListener('orientationchange', function () { setSidebar(false); });
})();
