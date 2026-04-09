// ============================================================
//  UrbanFlow — app.js v4.1 (Enhanced)
//  Full logic: auth, 4-step wizard, worker workflows, smart assignment
// ============================================================
'use strict';

// ─── State ────────────────────────────────────────────────────
let currentScreen   = 'screen-role-select';
let currentRole     = null;   // 'admin' | 'citizen' | 'worker'
let currentUser     = null;
let auth            = null;
let db              = null;
let isDark          = false;
let citizenMap      = null;
let workerMap       = null;
let scrollObserver  = null;

// Report wizard state
const wizardState = {
  step:         1,
  imageFile:    null,
  imageDataURL: null,
  lat:          null,
  lng:          null,
  address:      '',
  category:     'pothole',
  severity:     'medium',
  instructions: '',
  aiResult:     null,
  camGranted:   false,
  gpsGranted:   false,
};

// Worker work-session state (which task is active)
let activeWorkerTaskId = null;

// Screen groups
const WORKER_SCREENS  = ['screen-worker-tasks','screen-worker-map','screen-attendance','screen-worker-profile','screen-worker-task-active'];
const LOGIN_SCREENS   = ['screen-citizen-login','screen-worker-login','screen-admin-login','screen-role-select'];

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initFirebase();
  initScrollReveal();
  initAccordions();
  populateDemoAccounts();
  updateGlobalNavVisibility(currentScreen);
});

// ─── Clock ────────────────────────────────────────────────────
function initClock() {
  const tick = () => {
    const now = new Date();
    const el = document.getElementById('status-time');
    if (el) el.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  };
  tick(); setInterval(tick, 10000);
}

// ─── Firebase ─────────────────────────────────────────────────
function initFirebase() {
  if (window.firebase && !URBANFLOW_CONFIG.isMock) {
    try {
      firebase.initializeApp(URBANFLOW_CONFIG.firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();

      auth.onAuthStateChanged((user) => {
        if (user) {
          // Find matching mock user to map role & data
          const found = Object.values(MOCK_USERS).find(u => u.email === user.email);
          if (found) {
            currentUser = found;
            currentRole = found.role;
            populateUserUI();
          }
        }
      });
    } catch(e) { console.warn('Firebase init failed', e); }
  }
}

// =============================================================
//  ROLE SELECTION
// =============================================================
function selectRole(role) {
  if (role === 'admin') {
    navigateTo('screen-admin-login');
  } else if (role === 'citizen') {
    navigateTo('screen-citizen-login');
  } else if (role === 'worker') {
    navigateTo('screen-worker-login');
  }
}

function fillAdminDemo() {
  const e = document.getElementById('admin-login-email');
  const p = document.getElementById('admin-login-pwd');
  if (e) e.value = 'admin@demo.com';
  if (p) p.value = 'password';
  setTimeout(() => loginAdmin(), 400);
}

async function loginAdmin() {
  const email = document.getElementById('admin-login-email')?.value.trim();
  const pwd   = document.getElementById('admin-login-pwd')?.value.trim();
  const btn   = document.getElementById('admin-login-btn');
  btn?.classList.add('btn-loading');
  showLoading('Authenticating Admin…');

  try {
    if (auth && !URBANFLOW_CONFIG.isMock) {
      await auth.signInWithEmailAndPassword(email, pwd);
    } else {
      await fakeDelay(800);
    }
  } catch(e) {
    showToast(e.message || 'Login failed', 'error');
    hideLoading();
    btn?.classList.remove('btn-loading');
    return;
  }

  hideLoading();
  btn?.classList.remove('btn-loading');
  // Open admin.html in a new tab
  window.open('admin.html', '_blank');
  showToast('Admin dashboard opened in new tab!', 'success');
}

// =============================================================
//  DEMO ACCOUNT PICKERS
// =============================================================
function populateDemoAccounts() {
  const citizenList = document.getElementById('citizen-demo-list');
  if (citizenList) {
    citizenList.innerHTML = CITIZEN_DEMO_ACCOUNTS.map(u => `
      <div class="demo-account-card" onclick="fillCitizenDemo('${u.email}','password')">
        <div class="demo-avatar-circle">${u.avatar}</div>
        <div class="flex-1">
          <div class="title-sm">${u.name}</div>
          <div class="body-xs text-muted">${u.desc}</div>
        </div>
        <span class="material-icons-outlined text-muted" style="font-size:18px">login</span>
      </div>
    `).join('');
  }

  const workerList = document.getElementById('worker-demo-list');
  if (workerList) {
    workerList.innerHTML = WORKER_DEMO_ACCOUNTS.map(u => `
      <div class="demo-account-card" style="border-color:rgba(224,166,76,0.2)" onclick="fillWorkerDemo('${u.email}','password')">
        <div class="demo-avatar-circle" style="background:linear-gradient(135deg,#E0A64C,#C8851A)">${u.avatar}</div>
        <div class="flex-1">
          <div class="title-sm">${u.name}</div>
          <div class="body-xs text-muted">${u.desc}</div>
        </div>
        <span class="material-icons-outlined text-muted" style="font-size:18px">login</span>
      </div>
    `).join('');
  }
}

function fillCitizenDemo(email, pwd) {
  const eEl = document.getElementById('citizen-email');
  const pEl = document.getElementById('citizen-password');
  if (eEl) { eEl.value = email; eEl.classList.add('input-filled'); }
  if (pEl) { pEl.value = pwd;   pEl.classList.add('input-filled'); }
  // Small bounce then login
  const btn = document.getElementById('citizen-login-btn');
  if (btn) { btn.classList.add('btn-pulse'); setTimeout(() => btn.classList.remove('btn-pulse'), 600); }
  setTimeout(() => loginCitizen(), 400);
}

function fillWorkerDemo(email, pwd) {
  const eEl = document.getElementById('worker-email');
  const pEl = document.getElementById('worker-password');
  if (eEl) { eEl.value = email; eEl.classList.add('input-filled'); }
  if (pEl) { pEl.value = pwd;   pEl.classList.add('input-filled'); }
  setTimeout(() => loginWorker(), 400);
}

// =============================================================
//  NAVIGATION
// =============================================================
function navigateTo(screenId) {
  if (screenId === currentScreen) return;
  const cur  = document.getElementById(currentScreen);
  const next = document.getElementById(screenId);
  if (!next) { console.warn('Screen not found:', screenId); return; }

  if (cur) {
    cur.removeAttribute('data-active');
    cur.setAttribute('data-leaving','true');
    setTimeout(() => cur.removeAttribute('data-leaving'), 450);
  }
  next.setAttribute('data-active','true');
  next.scrollTop = 0;
  currentScreen = screenId;
  updateGlobalNavVisibility(screenId);
  setTimeout(() => initScrollReveal(), 80);

  if (LOGIN_SCREENS.includes(screenId)) replayLoginAnim(screenId);
  if (screenId === 'screen-heatmap'   && !citizenMap) setTimeout(initCitizenMap, 300);
  if (screenId === 'screen-worker-map'&& !workerMap)  setTimeout(initWorkerMap,  300);
}

function navTo(screenId, el) {
  navigateTo(screenId);
  if (el) {
    const nav = el.closest('.bottom-nav');
    if (nav) { nav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); }
    el.classList.add('active');
  }
}

function updateGlobalNavVisibility(screenId) {
  const cNav = document.getElementById('global-citizen-nav');
  const wNav = document.getElementById('global-worker-nav');
  if (cNav) cNav.style.display = 'none';
  if (wNav) wNav.style.display = 'none';

  if (WORKER_SCREENS.includes(screenId)) {
    if (wNav) wNav.style.display = 'flex';
    document.body.classList.add('worker-mode');
    document.body.classList.remove('login-mode');
  } else if (LOGIN_SCREENS.includes(screenId)) {
    document.body.classList.add('login-mode');
    document.body.classList.remove('worker-mode');
  } else {
    if (cNav) cNav.style.display = 'flex';
    document.body.classList.remove('worker-mode','login-mode');
  }

  // Role select has no nav
  if (screenId === 'screen-role-select') {
    document.body.classList.add('login-mode');
    document.body.classList.remove('worker-mode');
  }
}

function replayLoginAnim(screenId) {
  const screen = document.getElementById(screenId);
  if (!screen) return;
  screen.querySelectorAll('[class*="login-anim-"]').forEach(el => {
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = '';
  });
}

// ─── Scroll Reveal ────────────────────────────────────────────
function initScrollReveal() {
  if (scrollObserver) scrollObserver.disconnect();
  scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); scrollObserver.unobserve(e.target); } });
  }, { threshold: 0.1 });

  const active = document.querySelector('.screen[data-active="true"], .rw-panel.active');
  if (!active) return;
  active.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => {
    scrollObserver.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) el.classList.add('visible');
  });
}

// ─── Accordion ────────────────────────────────────────────────
function initAccordions() {
  document.querySelectorAll('.accordion-header').forEach(h => {
    h.addEventListener('click', () => {
      const item = h.parentElement;
      item.classList.toggle('active');
      const icon = h.querySelector('.material-icons-outlined');
      if (icon) icon.textContent = item.classList.contains('active') ? 'expand_less' : 'expand_more';
    });
  });
}

// ─── Theme ────────────────────────────────────────────────────
function toggleTheme() {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
  const toggle = document.getElementById('profile-dark-toggle');
  if (toggle) toggle.classList.toggle('active', isDark);
}

// ─── Password toggle ──────────────────────────────────────────
function togglePassword(inputId, iconId) {
  const inp  = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!inp || !icon) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  icon.textContent = inp.type === 'password' ? 'visibility' : 'visibility_off';
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3200) {
  document.querySelector('.toast')?.remove();
  const icons = { success:'check_circle', error:'error', info:'info', warning:'warning' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="material-icons-outlined" style="font-size:16px">${icons[type]||'info'}</span>${msg}`;
  document.getElementById('app-shell').appendChild(t);
  setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 350); }, duration);
}

// ─── Loading ──────────────────────────────────────────────────
function showLoading(text = 'Loading…') {
  const o = document.getElementById('loading-overlay');
  const t = document.getElementById('loading-text');
  if (o) o.classList.add('show');
  if (t) t.textContent = text;
}
function hideLoading() {
  document.getElementById('loading-overlay')?.classList.remove('show');
}
function fakeDelay(ms) { return new Promise(r => setTimeout(r, ms)); }

// =============================================================
//  AUTHENTICATION
// =============================================================
async function loginCitizen() {
  const email = document.getElementById('citizen-email')?.value.trim();
  const pwd   = document.getElementById('citizen-password')?.value;
  const btn   = document.getElementById('citizen-login-btn');
  btn?.classList.add('btn-loading');
  showLoading('Signing in…');

  try {
    if (auth && !URBANFLOW_CONFIG.isMock) {
      const cred = await auth.signInWithEmailAndPassword(email, pwd);
      const found = Object.values(MOCK_USERS).find(u => u.email === cred.user.email && u.role === 'citizen');
      currentUser = found || { email: cred.user.email, name: cred.user.email.split('@')[0], role: 'citizen' };
    } else {
      await fakeDelay(700);
      const found = Object.values(MOCK_USERS).find(u => u.email === email && u.role === 'citizen');
      currentUser = found || MOCK_USERS.citizen;
    }
    currentRole = 'citizen';
    afterLogin();
  } catch(e) {
    showToast(e.message || 'Login failed', 'error');
  } finally {
    btn?.classList.remove('btn-loading');
    hideLoading();
  }
}

async function loginWorker() {
  const email = document.getElementById('worker-email')?.value.trim();
  const pwd   = document.getElementById('worker-password')?.value;
  const btn   = document.getElementById('worker-login-btn');
  btn?.classList.add('btn-loading');
  showLoading('Authenticating…');

  try {
    if (auth && !URBANFLOW_CONFIG.isMock) {
      const cred = await auth.signInWithEmailAndPassword(email, pwd);
      const found = Object.values(MOCK_USERS).find(u => u.email === cred.user.email && u.role === 'worker');
      currentUser = found || { email: cred.user.email, name: cred.user.email.split('@')[0], role: 'worker', id: cred.user.uid };
    } else {
      await fakeDelay(800);
      const found = Object.values(MOCK_USERS).find(u => u.email === email && u.role === 'worker');
      currentUser = found || MOCK_USERS.worker;
    }
    currentRole = 'worker';
    afterLogin();
  } catch(e) {
    showToast(e.message || 'Auth failed', 'error');
  } finally {
    btn?.classList.remove('btn-loading');
    hideLoading();
  }
}

async function loginWithGoogle(role) {
  await fakeDelay(400);
  currentUser = { ...MOCK_USERS[role] };
  currentRole = role;
  afterLogin();
}

function afterLogin() {
  hideLoading();
  populateUserUI();
  if (currentRole === 'worker') {
    navigateTo('screen-worker-tasks');
    loadWorkerTasks();
  } else {
    navigateTo('screen-home');
    loadHomeData();
    loadMyReports();
  }
  showToast(`Welcome, ${currentUser?.name?.split(' ')[0] || 'User'}! 👋`, 'success');
}

function logout() {
  if (auth) auth.signOut();
  currentUser = null; currentRole = null;
  navigateTo('screen-role-select');
  showToast('Logged out successfully', 'info');
}

function populateUserUI() {
  if (!currentUser) return;
  const name  = currentUser.name  || 'User';
  const email = currentUser.email || '';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

  // Citizen
  setText('profile-name',  name);
  setText('profile-email', email);
  setText('profile-phone', currentUser.phone || '');
  setInitials('profile-avatar-big', initials);
  setInitials('home-avatar', initials);

  // Home greeting
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  setText('home-greeting', `${greet}, ${name.split(' ')[0]} 👋`);

  // Worker
  if (currentRole === 'worker') {
    const workerData = MOCK_WORKERS.find(w => w.id === currentUser.id);
    setText('worker-name-display', name);
    setText('worker-zone-chip',    currentUser.zone || 'Zone 1');
    setText('worker-profile-name', name);
    setText('worker-profile-id',   `WORKER ID #${currentUser.id?.toUpperCase()}`);
    setText('worker-profile-zone', currentUser.zone || 'Zone 1');
    setText('wp-zone-text',        currentUser.zone || 'North District');
    setInitials('worker-header-avatar',    initials);
    setInitials('worker-profile-avatar',   initials);
    setText('wp-phone', currentUser.phone || '—');
    if (workerData) {
      setText('wstat-active', workerData.active_tasks);
      setText('wstat-done',   workerData.tasks_completed);
      setText('wstat-score',  workerData.credibility_score + '%');
      setText('wp-active',    workerData.active_tasks);
      setText('wp-done',      workerData.tasks_completed);
      setText('wp-score',     workerData.credibility_score + '%');
    }
  }

  // Profile stats
  const myReports   = MOCK_REPORTS.filter(r => r.user_id === currentUser.id);
  const myCompleted = myReports.filter(r => r.status === 'completed').length;
  const myPending   = myReports.filter(r => r.status === 'submitted').length;
  setText('profile-total-reports', myReports.length);
  setText('profile-resolved',      myCompleted);
  setText('profile-pending-count', myPending);
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setInitials(id, val) {
  const el = document.getElementById(id);
  if (el) { el.textContent = val; el.className = (el.className || '') + ' has-initials'; }
}

// =============================================================
//  HOME DATA
// =============================================================
async function loadHomeData() {
  await fakeDelay(500);
  const myReports   = MOCK_REPORTS.filter(r => r.user_id === currentUser?.id);
  const totalAll    = myReports.length;
  const pending     = myReports.filter(r => r.status === 'submitted').length;
  const completed   = myReports.filter(r => r.status === 'completed').length;

  animateCount('home-total',     totalAll);
  animateCount('home-pending',   pending);
  animateCount('home-completed', completed);

  renderHomeList(myReports.slice(0,3));
}

function renderHomeList(reports) {
  const c = document.getElementById('home-reports-list');
  if (!c) return;
  if (!reports.length) {
    c.innerHTML = `<div class="card text-center" style="padding:32px">
      <span class="material-icons-outlined text-muted" style="font-size:40px">assignment_late</span>
      <div class="title-sm mt-4 text-muted">No reports yet</div>
      <button class="btn btn-primary mt-4" onclick="startReportWizard()">Report your first issue</button>
    </div>`;
    return;
  }
  c.innerHTML = reports.map((r, i) => `
    <div class="list-card reveal reveal-d${i+3}" onclick="openReportDetail('${r.id}')" style="cursor:pointer">
      <div class="list-card-img" style="background-image:url('${r.image_url||''}')"></div>
      <div class="list-card-content">
        <div class="chip chip-${r.status} mb-1">${catLabel(r.category)}</div>
        <div class="title-sm mb-1">${r.address || '—'}</div>
        <div class="body-xs text-muted">${timeAgo(r.created_at)}</div>
      </div>
      <span class="material-icons-outlined text-muted">chevron_right</span>
    </div>
  `).join('');
  setTimeout(() => initScrollReveal(), 50);
}

// =============================================================
//  MY REPORTS
// =============================================================
async function loadMyReports(filter = 'all') {
  await fakeDelay(250);
  let reports = MOCK_REPORTS.filter(r => r.user_id === currentUser?.id);
  if (filter !== 'all') reports = reports.filter(r => r.status === filter);
  renderMyReports(reports);
}

function renderMyReports(reports) {
  const c = document.getElementById('my-reports-list');
  if (!c) return;
  if (!reports.length) {
    c.innerHTML = `<div class="card text-center" style="padding:32px"><span class="material-icons-outlined text-muted" style="font-size:40px">inbox</span><div class="title-sm mt-4 text-muted">No reports found</div></div>`;
    return;
  }
  c.innerHTML = reports.map((r, i) => `
    <div class="report-status-card reveal reveal-d${Math.min(i+1,6)}" onclick="openReportDetail('${r.id}')">
      <div class="flex-between mb-2">
        <div class="chip chip-${r.status}">${statusLabel(r.status)}</div>
        <div class="body-xs text-muted">${timeAgo(r.created_at)}</div>
      </div>
      <div class="flex-row gap-sm">
        <div style="width:60px;height:60px;border-radius:10px;background-image:url('${r.image_url||''}');background-size:cover;background-color:var(--border);flex-shrink:0"></div>
        <div class="flex-1">
          <div class="title-sm mb-1">${catLabel(r.category)} — ${r.severity ? r.severity.toUpperCase() : 'MEDIUM'} severity</div>
          <div class="body-xs text-muted flex-row gap-sm"><span class="material-icons-outlined" style="font-size:13px">location_on</span>${r.address || '—'}</div>
          ${r.instructions ? `<div class="body-xs text-muted mt-1" style="font-style:italic">"${r.instructions.slice(0,60)}${r.instructions.length>60?'…':''}"</div>` : ''}
          ${r.assigned_worker_id ? `<div class="body-xs text-primary mt-1 flex-row gap-sm"><span class="material-icons-outlined" style="font-size:13px">engineering</span>Worker assigned</div>` : ''}
        </div>
      </div>
    </div>
  `).join('');
  setTimeout(() => initScrollReveal(), 50);
}

function filterMyReports(filter, el) {
  el?.closest('.flex-row')?.querySelectorAll('.chip').forEach(c => { c.classList.remove('chip-info'); c.style.opacity='0.6'; });
  if (el) { el.style.opacity='1'; el.classList.add('chip-info'); }
  loadMyReports(filter);
}

function openReportDetail(reportId) {
  const r = MOCK_REPORTS.find(rr => rr.id === reportId) || MOCK_REPORTS[0];
  const c = document.getElementById('report-detail-content');
  if (!c) return;
  c.innerHTML = `
    ${r.image_url ? `<img src="${r.image_url}" class="report-detail-img reveal" alt="Report image">` : ''}
    <div class="flex-between mb-3 reveal reveal-d1">
      <div>
        <div class="chip chip-${r.status} mb-1">${statusLabel(r.status)}</div>
        <h2 class="title-md">${catLabel(r.category)} — ${(r.severity||'medium').toUpperCase()}</h2>
      </div>
      <div class="text-right">
        <div class="body-xs text-muted">${timeAgo(r.created_at)}</div>
        <div class="body-xs text-muted mt-1">#${r.id.slice(-6).toUpperCase()}</div>
      </div>
    </div>
    ${r.instructions ? `
    <div class="card reveal reveal-d2" style="margin-bottom:12px;background:rgba(44,123,229,0.04)">
      <div class="body-xs text-muted mb-1">YOUR INSTRUCTIONS</div>
      <div class="body-sm" style="font-style:italic">"${r.instructions}"</div>
    </div>` : ''}
    <div class="card reveal reveal-d2" style="margin-bottom:12px">
      <div class="body-xs text-muted mb-2">LOCATION</div>
      <div class="flex-row gap-sm mb-2"><span class="material-icons-outlined text-danger" style="font-size:20px">location_on</span><div class="body-sm">${r.address||'—'}</div></div>
      ${r.latitude ? `<div class="body-xs text-muted">GPS: ${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}</div>` : ''}
    </div>
    ${r.ai_result ? `
    <div class="card reveal reveal-d3" style="margin-bottom:12px;border-color:rgba(44,123,229,0.2)">
      <div class="body-xs text-muted mb-2">AI DETECTION</div>
      <div class="flex-between">
        <div class="flex-row gap-sm"><span class="material-icons-outlined text-primary" style="font-size:20px">auto_awesome</span><div class="title-sm">${r.ai_result.label?.replace('_',' ').toUpperCase()}</div></div>
        <div class="title-sm text-primary">${Math.round((r.ai_result.confidence||0)*100)}%</div>
      </div>
      <div class="progress-bar-bg mt-2"><div class="progress-bar-fill" style="width:${Math.round((r.ai_result.confidence||0)*100)}%"></div></div>
    </div>` : ''}
    <div class="card reveal reveal-d3">
      <div class="body-xs text-muted mb-3">REPAIR TIMELINE</div>
      <div class="status-timeline">
        <div class="timeline-step"><div class="timeline-dot done"><span class="material-icons-outlined" style="font-size:14px">check</span></div><div><div class="title-sm">Submitted</div><div class="body-xs text-muted">${formatDate(r.created_at)}</div></div></div>
        <div class="timeline-step"><div class="timeline-dot ${r.status !== 'submitted' ? 'done' : 'pending'}"><span class="material-icons-outlined" style="font-size:14px">${r.status !== 'submitted' ? 'check' : 'schedule'}</span></div><div><div class="title-sm">Worker Assigned</div><div class="body-xs text-muted">${r.assigned_worker_id ? 'Assigned' : 'Pending'}</div></div></div>
        <div class="timeline-step"><div class="timeline-dot ${r.work_started_at ? 'done' : 'pending'}"><span class="material-icons-outlined" style="font-size:14px">${r.work_started_at ? 'check' : 'schedule'}</span></div><div><div class="title-sm">Work In Progress</div><div class="body-xs text-muted">${r.work_started_at ? formatDate(r.work_started_at) : 'Not started'}</div></div></div>
        <div class="timeline-step"><div class="timeline-dot ${r.status === 'completed' ? 'done' : 'pending'}"><span class="material-icons-outlined" style="font-size:14px">${r.status === 'completed' ? 'check' : 'schedule'}</span></div><div><div class="title-sm">Repair Complete</div><div class="body-xs text-muted">${r.work_completed_at ? formatDate(r.work_completed_at) : 'Pending'}</div></div></div>
      </div>
    </div>
  `;
  setTimeout(() => initScrollReveal(), 80);
  navigateTo('screen-report-detail');
}

// =============================================================
//  REPORT WIZARD (4-step)
// =============================================================
function startReportWizard() {
  // Reset wizard state
  Object.assign(wizardState, { step:1, imageFile:null, imageDataURL:null, lat:null, lng:null, address:'', category:'pothole', severity:'medium', instructions:'', aiResult:null });
  resetWizardUI();
  navigateTo('screen-report');
  setTimeout(() => { gotoWizardStep(1); initScrollReveal(); }, 100);
}

function resetWizardUI() {
  // Step 1
  const camPerm = document.getElementById('cam-perm-card');
  const camSect = document.getElementById('cam-section');
  if (camPerm) camPerm.style.display = 'block';
  if (camSect) camSect.style.display = 'none';
  const emptyState   = document.getElementById('cam-empty-state');
  const previewState = document.getElementById('cam-preview-state');
  if (emptyState)   emptyState.style.display = 'block';
  if (previewState) previewState.style.display = 'none';
  const step1Next = document.getElementById('step1-next-btn');
  if (step1Next) step1Next.style.display = 'none';
  const inp = document.getElementById('report-img-input');
  if (inp) inp.value = '';

  // Step 2
  const locPerm = document.getElementById('loc-perm-card');
  const locSect = document.getElementById('loc-section');
  if (locPerm) locPerm.style.display = 'block';
  if (locSect) locSect.style.display = 'none';
  const step2Next = document.getElementById('step2-next-btn');
  if (step2Next) step2Next.style.display = 'none';

  // Step 3 AI reset
  const s3chip = document.getElementById('s3-ai-chip');
  const s3label = document.getElementById('s3-ai-label');
  const s3bar   = document.getElementById('s3-ai-bar');
  if (s3chip)  { s3chip.textContent = 'SCANNING'; s3chip.className = 'chip chip-pending'; }
  if (s3label) s3label.textContent = 'Analyzing…';
  if (s3bar)   s3bar.style.width = '0%';

  // Category
  document.querySelectorAll('#s3-cat-grid .category-box').forEach((b,i) => b.classList.toggle('active', i===0));

  // Severity
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.toggle('active', b.dataset.sev === 'medium'));

  // Instructions
  const instr = document.getElementById('s3-instructions');
  if (instr) instr.value = '';
}

function gotoWizardStep(step) {
  if (step < 1 || step > 4) return;
  const prev = wizardState.step;
  wizardState.step = step;

  // Animate panels
  const prevPanel = document.getElementById(`rwp-${prev}`);
  const nextPanel = document.getElementById(`rwp-${step}`);
  if (prevPanel) {
    prevPanel.classList.remove('active');
    prevPanel.classList.add(step > prev ? 'slide-out-left' : 'slide-out-right');
    setTimeout(() => { prevPanel.classList.remove('slide-out-left','slide-out-right'); }, 400);
  }
  if (nextPanel) {
    nextPanel.classList.add(step > prev ? 'slide-in-right' : 'slide-in-left');
    setTimeout(() => {
      nextPanel.classList.add('active');
      nextPanel.classList.remove('slide-in-right','slide-in-left');
      nextPanel.scrollTop = 0;
      initScrollReveal();
    }, 50);
  }

  // Update progress dots
  for (let i=1; i<=4; i++) {
    const dot  = document.getElementById(`wdot-${i}`);
    const line = document.getElementById(`wline-${i}`);
    if (dot) {
      dot.classList.toggle('wstep-active',    i === step);
      dot.classList.toggle('wstep-done',      i < step);
      dot.classList.toggle('wstep-upcoming',  i > step);
    }
    if (line && i < 4) line.classList.toggle('wstep-line-done', i < step);
  }

  // Update header title
  const titles = {1:'Step 1 — Photo', 2:'Step 2 — Location', 3:'Step 3 — Details', 4:'Step 4 — Review'};
  const headerTitle = document.getElementById('report-header-title');
  if (headerTitle) headerTitle.textContent = titles[step];

  // Step-specific on-enter logic
  if (step === 3) onEnterStep3();
  if (step === 4) onEnterStep4();
}

function reportWizardBack() {
  if (wizardState.step > 1) {
    gotoWizardStep(wizardState.step - 1);
  } else {
    navigateTo('screen-home');
  }
}

// ─── Step 1: Camera ───────────────────────────────────────────
async function requestCameraAccess() {
  const btn = document.getElementById('cam-allow-btn');
  if (btn) { btn.innerHTML = '<div class="spinner-sm"></div> Requesting…'; btn.disabled = true; }

  try {
    // Try to get real permission
    const stream = await navigator.mediaDevices.getUserMedia({ video:true });
    stream.getTracks().forEach(t => t.stop()); // Release immediately
    wizardState.camGranted = true;
    showCameraSection();
    showToast('Camera access granted!', 'success');
  } catch(e) {
    // No camera on desktop / denied
    console.warn('Camera permission:', e.message);
    wizardState.camGranted = true; // Allow fallback file picker
    showCameraSection();
    showToast('Opening file picker…', 'info');
  }

  if (btn) { btn.innerHTML = '<span class="material-icons-outlined">camera_alt</span>Allow Camera Access'; btn.disabled = false; }
}

function skipCameraPermission() {
  wizardState.camGranted = true;
  showCameraSection();
}

function showCameraSection() {
  const camPerm = document.getElementById('cam-perm-card');
  const camSect = document.getElementById('cam-section');
  if (camPerm) { camPerm.style.transition = 'opacity 0.3s'; camPerm.style.opacity='0'; setTimeout(() => camPerm.style.display='none', 300); }
  if (camSect) { setTimeout(() => { camSect.style.display='block'; camSect.style.animation='revealUp 0.4s ease both'; }, 300); }
}

function handleReportImageCaptured(event) {
  const file = event.target.files[0];
  if (!file) return;
  wizardState.imageFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    wizardState.imageDataURL = e.target.result;
    const preview = document.getElementById('report-img-preview');
    if (preview) preview.src = e.target.result;

    const emptyState   = document.getElementById('cam-empty-state');
    const previewState = document.getElementById('cam-preview-state');
    if (emptyState)   { emptyState.style.transition='opacity 0.3s'; emptyState.style.opacity='0'; setTimeout(()=>{emptyState.style.display='none';},300); }
    if (previewState) { setTimeout(()=>{ previewState.style.display='block'; previewState.style.animation='revealUp 0.4s ease both'; }, 300); }

    const nextBtn = document.getElementById('step1-next-btn');
    if (nextBtn) { nextBtn.style.display='flex'; nextBtn.style.animation='revealUp 0.4s ease both'; }

    // Pre-load AI preview image for step 3
    const s3pre = document.getElementById('s3-ai-preview-area');
    if (s3pre) s3pre.style.backgroundImage = `url('${e.target.result}')`;

    showToast('Photo captured! Tap Next to continue.', 'success');
  };
  reader.readAsDataURL(file);
}

// ─── Step 2: GPS ──────────────────────────────────────────────
async function requestGPSAccess() {
  const btn = document.getElementById('gps-allow-btn');
  if (btn) { btn.innerHTML = '<div class="spinner-sm"></div> Fetching GPS…'; btn.disabled = true; }

  if (!navigator.geolocation) {
    useDemoLocation();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      wizardState.lat = pos.coords.latitude;
      wizardState.lng = pos.coords.longitude;
      wizardState.gpsGranted = true;
      showLocationSection();
      if (btn) { btn.innerHTML = '<span class="material-icons-outlined">gps_fixed</span>Use My GPS Location'; btn.disabled = false; }
      showToast('GPS location captured!', 'success');
    },
    () => {
      useDemoLocation();
      if (btn) { btn.innerHTML = '<span class="material-icons-outlined">gps_fixed</span>Use My GPS Location'; btn.disabled = false; }
    },
    { timeout: 8000, maximumAge: 30000 }
  );
}

function useDemoLocation() {
  // Demo: slightly randomised around New Delhi
  wizardState.lat = URBANFLOW_CONFIG.defaultLat + (Math.random()-0.5)*0.02;
  wizardState.lng = URBANFLOW_CONFIG.defaultLng + (Math.random()-0.5)*0.02;
  wizardState.gpsGranted = true;
  showLocationSection();
  showToast('Using demo location (GPS unavailable)', 'info');
}

function resetGPS() {
  const locSect = document.getElementById('loc-section');
  const locPerm = document.getElementById('loc-perm-card');
  const step2Next = document.getElementById('step2-next-btn');
  if (locSect) locSect.style.display = 'none';
  if (locPerm) locPerm.style.display = 'block';
  if (step2Next) step2Next.style.display = 'none';
  wizardState.lat = null; wizardState.lng = null; wizardState.gpsGranted = false;
}

function showLocationSection() {
  const locPerm = document.getElementById('loc-perm-card');
  const locSect = document.getElementById('loc-section');
  const step2Next = document.getElementById('step2-next-btn');
  const coordsEl  = document.getElementById('loc-coords-display');
  const addrEl    = document.getElementById('loc-address-display');

  if (locPerm) { locPerm.style.transition='opacity 0.3s'; locPerm.style.opacity='0'; setTimeout(()=>locPerm.style.display='none', 300); }
  if (locSect) { setTimeout(()=>{ locSect.style.display='block'; locSect.style.animation='revealUp 0.4s ease both'; },300); }
  if (step2Next) { setTimeout(()=>{ step2Next.style.display='flex'; step2Next.style.animation='revealUp 0.4s ease both'; },400); }

  if (coordsEl) coordsEl.textContent = `${wizardState.lat?.toFixed(6)}, ${wizardState.lng?.toFixed(6)}`;

  // Reverse geocode (demo)
  wizardState.address = getDemoAddress(wizardState.lat, wizardState.lng);
  if (addrEl) { addrEl.textContent = '…'; setTimeout(()=>{ addrEl.textContent = wizardState.address; }, 800); }
}

function getDemoAddress(lat, lng) {
  const areas = ['Connaught Place, New Delhi', 'Karol Bagh, New Delhi', 'Rohini, New Delhi', 'Dwarka, New Delhi',
    'Nehru Place, New Delhi', 'Saket, New Delhi', 'Lajpat Nagar, New Delhi'];
  // Pick based on lat/lng to be consistent
  const idx = Math.floor(Math.abs((lat + lng) * 100)) % areas.length;
  return areas[idx];
}

// ─── Step 3: Details + AI ─────────────────────────────────────
async function onEnterStep3() {
  // Run AI if image exists
  if (wizardState.imageFile) {
    runWizardAI(wizardState.imageFile);
  }
}

async function runWizardAI(file) {
  const chip = document.getElementById('s3-ai-chip');
  const scan = document.getElementById('s3-scan-line');
  const bbox = document.getElementById('s3-bbox');
  const tag  = document.getElementById('s3-ai-tag');
  const label= document.getElementById('s3-ai-label');
  const conf = document.getElementById('s3-ai-conf');
  const bar  = document.getElementById('s3-ai-bar');

  if (chip) { chip.textContent='SCANNING'; chip.className='chip chip-pending'; }
  if (scan) scan.style.display = 'block';
  if (bbox) bbox.style.display = 'none';

  try {
    let result;
    if (!URBANFLOW_CONFIG.isMock) {
      const fd = new FormData(); fd.append('image', file);
      const res = await fetch(URBANFLOW_CONFIG.aiEndpoint, { method:'POST', body:fd });
      if (!res.ok) throw new Error('AI error');
      const data = await res.json();
      result = data.detections?.[0] || { label:'pothole', confidence:0.88 };
    } else {
      await fakeDelay(1800);
      const labels = ['pothole','crack','water_logging','garbage'];
      result = { label:labels[Math.floor(Math.random()*labels.length)], confidence:0.76 + Math.random()*0.22 };
    }

    wizardState.aiResult = result;
    const pct = Math.round(result.confidence * 100);

    if (chip)  { chip.textContent='DETECTED'; chip.className='chip chip-done'; }
    if (scan)  scan.style.display = 'none';
    if (bbox)  { bbox.style.display='flex'; }
    if (tag)   tag.textContent = `${pct}% ${result.label.replace('_',' ')}`;
    if (label) label.textContent = result.label.replace('_',' ').toUpperCase();
    if (conf)  conf.textContent = `${pct}%`;
    if (bar)   { bar.style.width='0%'; setTimeout(()=>{bar.style.width=`${pct}%`;},100); }

    // Auto-select category
    const catBox = document.querySelector(`#s3-cat-grid [data-cat="${result.label}"]`);
    if (catBox) selectWizardCat(catBox);
    wizardState.category = result.label;

    showToast(`AI detected: ${result.label.replace('_',' ')} (${pct}%)`, 'success');
  } catch(e) {
    if (chip)  { chip.textContent='MANUAL'; chip.className='chip chip-pending'; }
    if (scan)  scan.style.display = 'none';
    if (label) label.textContent = 'Select manually below';
    showToast('AI unavailable — please select category manually', 'info');
  }
}

function selectWizardCat(el) {
  document.querySelectorAll('#s3-cat-grid .category-box').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  wizardState.category = el.dataset.cat;
}

function selectSeverity(el) {
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  wizardState.severity = el.dataset.sev;
}

// ─── Step 4: Review ───────────────────────────────────────────
function onEnterStep4() {
  wizardState.instructions = document.getElementById('s3-instructions')?.value?.trim() || '';

  // Populate review card
  const img  = document.getElementById('review-img');
  if (img && wizardState.imageDataURL) { img.src = wizardState.imageDataURL; img.style.display='block'; }

  setText('review-location', wizardState.address || `${wizardState.lat?.toFixed(6)}, ${wizardState.lng?.toFixed(6)}`);
  const ai = wizardState.aiResult;
  setText('review-ai', ai ? `${ai.label.replace('_',' ')} — ${Math.round(ai.confidence*100)}% confidence` : 'Manual selection');
  setText('review-cat-sev', `${catLabel(wizardState.category)} • ${wizardState.severity.toUpperCase()} severity`);

  const instrRow = document.getElementById('review-instr-row');
  if (wizardState.instructions && instrRow) {
    instrRow.style.display = 'flex';
    setText('review-instructions', wizardState.instructions);
  } else if (instrRow) { instrRow.style.display = 'none'; }

  // Smart assignment check
  checkSmartAssignment();
}

async function checkSmartAssignment() {
  if (!wizardState.lat) return;
  await fakeDelay(600);
  const result = findSmartAssignWorker({ latitude:wizardState.lat, longitude:wizardState.lng });
  const banner = document.getElementById('smart-assign-banner');
  const text   = document.getElementById('smart-assign-text');

  if (result && banner && text) {
    const worker = MOCK_WORKERS.find(w => w.id === result.workerId);
    banner.classList.remove('hidden');
    if (result.reason === 'nearby_completed') {
      text.textContent = `${worker?.name || 'A worker'} recently completed work ${Math.round(result.distanceM)}m away — they'll be assigned for efficiency!`;
    } else {
      text.textContent = `${worker?.name || 'A worker'} has the fewest active tasks and will be assigned.`;
    }
  }
}

// =============================================================
//  SMART ASSIGNMENT ALGORITHM
// =============================================================
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function findSmartAssignWorker(newReport) {
  const radius = URBANFLOW_CONFIG.smartAssignRadius; // km
  const completedNearby = MOCK_REPORTS.filter(r => {
    if (r.status !== 'completed' || !r.assigned_worker_id || !r.latitude) return false;
    return haversineKm(r.latitude, r.longitude, newReport.latitude, newReport.longitude) <= radius;
  });

  if (completedNearby.length > 0) {
    completedNearby.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const near = completedNearby[0];
    const wid  = near.assigned_worker_id;
    const active = MOCK_REPORTS.filter(r => r.assigned_worker_id === wid && r.status === 'assigned').length;
    if (active < 4) {
      const distM = Math.round(haversineKm(near.latitude, near.longitude, newReport.latitude, newReport.longitude) * 1000);
      return { workerId: wid, reason: 'nearby_completed', distanceM: distM };
    }
  }

  // Fallback: assign to worker with fewest active tasks
  const workers = MOCK_WORKERS.map(w => ({
    ...w,
    activeCount: MOCK_REPORTS.filter(r => r.assigned_worker_id === w.id && r.status === 'assigned').length
  })).sort((a,b) => a.activeCount - b.activeCount);

  return workers[0] ? { workerId: workers[0].id, reason: 'load_balancing' } : null;
}

// ─── Final Submit ─────────────────────────────────────────────
async function finalSubmitReport() {
  const btn = document.getElementById('final-submit-btn');
  btn?.classList.add('btn-loading');
  showLoading('Submitting report…');

  try {
    await fakeDelay(1200);

    const assignment = findSmartAssignWorker({ latitude: wizardState.lat, longitude: wizardState.lng });
    const worker     = assignment ? MOCK_WORKERS.find(w => w.id === assignment.workerId) : null;

    const newReport = {
      id:                  `r-${Date.now()}`,
      user_id:             currentUser?.id,
      category:            wizardState.category,
      status:              assignment ? 'assigned' : 'submitted',
      latitude:            wizardState.lat  || URBANFLOW_CONFIG.defaultLat,
      longitude:           wizardState.lng  || URBANFLOW_CONFIG.defaultLng,
      address:             wizardState.address || 'New Delhi',
      image_url:           wizardState.imageDataURL || 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=400',
      ai_result:           wizardState.aiResult,
      instructions:        wizardState.instructions,
      severity:            wizardState.severity,
      assigned_worker_id:  assignment?.workerId || null,
      created_at:          new Date().toISOString(),
      work_started_at:     null, work_started_photo: null,
      work_completed_at:   null, work_completed_photo: null,
    };

    MOCK_REPORTS.unshift(newReport);

    hideLoading();
    btn?.classList.remove('btn-loading');

    let msg = 'Report submitted! 🎉';
    if (worker && assignment.reason === 'nearby_completed') {
      msg = `Submitted! ⚡ ${worker.name} auto-assigned (nearby area).`;
    } else if (worker) {
      msg = `Submitted! 👷 ${worker.name} has been assigned.`;
    }
    showToast(msg, 'success', 4000);

    loadHomeData();
    loadMyReports();
    setTimeout(() => navigateTo('screen-my-reports'), 1800);
  } catch(e) {
    hideLoading();
    btn?.classList.remove('btn-loading');
    showToast(e.message || 'Submit failed', 'error');
  }
}

// =============================================================
//  WORKER TASK MANAGEMENT
// =============================================================
function getWorkerTasks(workerId) {
  return MOCK_REPORTS.filter(r => r.assigned_worker_id === workerId);
}

async function loadWorkerTasks() {
  await fakeDelay(300);
  const tasks = getWorkerTasks(currentUser?.id);
  renderWorkerTaskList(tasks);

  // Show smart assignment notification if latest task was smart-assigned
  const latestTask = tasks[0];
  const notif = document.getElementById('worker-smart-notif');
  const notifText = document.getElementById('worker-smart-text');
  if (latestTask && notif && latestTask.status === 'assigned') {
    notif.classList.remove('hidden');
    if (notifText) notifText.textContent = `New task assigned: ${catLabel(latestTask.category)} at ${latestTask.address}`;
    setTimeout(() => notif.classList.add('hidden'), 5000);
  }
}

function renderWorkerTaskList(tasks) {
  const c = document.getElementById('worker-tasks-list');
  if (!c) return;

  if (!tasks.length) {
    c.innerHTML = `<div class="card text-center" style="padding:32px">
      <span class="material-icons-outlined text-muted" style="font-size:40px">assignment_turned_in</span>
      <div class="title-sm mt-4 text-muted">No tasks assigned</div>
      <div class="body-sm text-muted mt-2">Check back later</div>
    </div>`;
    return;
  }

  const active    = tasks.filter(t => t.status === 'assigned' && !t.work_started_at);
  const inProg    = tasks.filter(t => t.status === 'assigned' &&  t.work_started_at);
  const completed = tasks.filter(t => t.status === 'completed');

  const renderGroup = (label, list, color) => {
    if (!list.length) return '';
    return `
      <div class="body-xs text-muted mb-2 mt-2" style="color:${color}">${label}</div>
      ${list.map((t, i) => renderWorkerTaskCard(t, i)).join('')}
    `;
  };

  c.innerHTML = [
    renderGroup('🔴 IN PROGRESS', inProg, 'var(--danger)'),
    renderGroup('🟡 PENDING START', active, 'var(--tertiary)'),
    renderGroup('✅ COMPLETED', completed, 'var(--success)'),
  ].join('');

  setTimeout(() => initScrollReveal(), 50);
}

function renderWorkerTaskCard(task, i) {
  const isInProgress  = task.status === 'assigned' && task.work_started_at;
  const isCompleted   = task.status === 'completed';
  const statusClass   = isCompleted ? 'chip-done' : isInProgress ? 'chip-urgent' : 'chip-assigned';
  const statusText    = isCompleted ? 'COMPLETED' : isInProgress ? 'IN PROGRESS' : 'START TASK';

  return `
    <div class="worker-task-card reveal reveal-d${Math.min(i+2,6)}" onclick="openWorkerTask('${task.id}')">
      <div class="worker-task-card-img" style="background-image:url('${task.image_url||''}')">
        <div class="chip ${statusClass}" style="position:absolute;top:10px;right:10px;z-index:2;font-size:10px">${statusText}</div>
        ${task.severity === 'high' ? `<div class="chip chip-urgent" style="position:absolute;top:10px;left:10px;z-index:2;font-size:10px">HIGH</div>` : ''}
      </div>
      <div class="worker-task-card-body">
        <div class="flex-between mb-1">
          <h3 class="title-sm">${catLabel(task.category)}</h3>
          <span class="body-xs text-muted">${timeAgo(task.created_at)}</span>
        </div>
        <div class="body-xs text-muted flex-row mb-2">
          <span class="material-icons-outlined" style="font-size:14px;margin-right:3px">location_on</span>${task.address || '—'}
        </div>
        ${task.instructions ? `<div class="body-xs text-muted mb-2" style="font-style:italic">"${task.instructions.slice(0,55)}${task.instructions.length>55?'…':''}"</div>` : ''}
        <div class="worker-task-actions">
          <button class="btn btn-primary flex-1" style="padding:10px" onclick="event.stopPropagation();openWorkerTask('${task.id}')">
            <span class="material-icons-outlined" style="font-size:16px">${isCompleted ? 'visibility' : isInProgress ? 'work' : 'play_arrow'}</span>
            ${isCompleted ? 'View' : isInProgress ? 'Continue' : 'Start Work'}
          </button>
          <button class="btn btn-outline" style="padding:10px;width:44px" onclick="event.stopPropagation();openExternalNavigationFor('${task.id}')">
            <span class="material-icons-outlined" style="margin:0;font-size:20px">navigation</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─── Task Active Screen ───────────────────────────────────────
function openWorkerTask(taskId) {
  activeWorkerTaskId = taskId;
  const task = MOCK_REPORTS.find(r => r.id === taskId);
  if (!task) return;
  renderWorkerTaskActive(task);
  navigateTo('screen-worker-task-active');
}

function renderWorkerTaskActive(task) {
  const c = document.getElementById('wta-content');
  if (!c) return;

  const isInProgress  = task.status === 'assigned' && task.work_started_at;
  const isCompleted   = task.status === 'completed';
  const isNotStarted  = task.status === 'assigned' && !task.work_started_at;

  c.innerHTML = `
    <!-- Issue Photo -->
    <div class="wta-hero" style="background-image:url('${task.image_url||''}')">
      <div class="wta-hero-overlay">
        <div class="chip chip-${task.status} mb-2">${catLabel(task.category)}</div>
        <div class="title-md mb-1">${task.address || '—'}</div>
        <div class="body-xs text-muted">${timeAgo(task.created_at)} • ${(task.severity||'medium').toUpperCase()} severity</div>
      </div>
    </div>

    <div class="content-pad">
      <!-- Instructions from citizen -->
      ${task.instructions ? `
      <div class="card mb-4" style="background:rgba(44,123,229,0.04);border-color:rgba(44,123,229,0.2)">
        <div class="body-xs text-muted mb-1 flex-row gap-sm"><span class="material-icons-outlined" style="font-size:14px">notes</span>CITIZEN INSTRUCTIONS</div>
        <div class="body-sm" style="font-style:italic;line-height:1.6">"${task.instructions}"</div>
      </div>` : ''}

      <!-- Navigate -->
      <button class="btn btn-outline btn-full mb-4" onclick="openExternalNavigationFor('${task.id}')">
        <span class="material-icons-outlined">navigation</span>
        Navigate to Location
        <span class="body-xs text-muted" style="margin-left:auto">${task.latitude?.toFixed(4)}, ${task.longitude?.toFixed(4)}</span>
      </button>

      <!-- ── NOT STARTED STATE ── -->
      ${isNotStarted ? `
      <div class="work-state-card" id="wta-not-started">
        <div class="work-state-icon" style="background:rgba(224,166,76,0.1)">
          <span class="material-icons-outlined" style="color:var(--tertiary);font-size:36px">work_outline</span>
        </div>
        <div class="title-md mb-1">Ready to Start?</div>
        <div class="body-sm text-muted mb-4">Take a check-in photo to officially log the start of this repair task. This photo will be used for verification.</div>

        <input type="file" id="checkin-img-input" accept="image/*" capture="user" style="display:none" onchange="handleCheckinPhoto(event)">
        <div class="checkin-preview hidden" id="checkin-preview">
          <img id="checkin-preview-img" style="width:100%;border-radius:12px;max-height:200px;object-fit:cover;margin-bottom:12px">
          <div class="body-xs text-success flex-row gap-sm"><span class="material-icons-outlined" style="font-size:14px">check_circle</span>Check-in photo ready</div>
        </div>

        <button class="btn btn-outline btn-full mb-3" onclick="document.getElementById('checkin-img-input').click()">
          <span class="material-icons-outlined">selfie</span>
          Take Check-in Photo
        </button>
        <button class="btn btn-full" id="start-work-btn" style="background:linear-gradient(135deg,#E0A64C,#C8851A);color:#fff;opacity:0.5;pointer-events:none" onclick="confirmStartWork()">
          <span class="btn-text">Start Work</span>
          <span class="material-icons-outlined" style="font-size:18px">play_arrow</span>
        </button>
        <div class="body-xs text-muted text-center mt-2">Take a photo first, then start work</div>
      </div>
      ` : ''}

      <!-- ── IN PROGRESS STATE ── -->
      ${isInProgress ? `
      <div class="work-state-card" id="wta-in-progress">
        <div class="work-session-badge">
          <span class="material-icons-outlined">timer</span>
          Work Session Active — Started ${formatTime(task.work_started_at)}
        </div>

        ${task.work_started_photo ? `
        <div class="mb-3">
          <div class="body-xs text-muted mb-1">CHECK-IN PHOTO</div>
          <img src="${task.work_started_photo}" style="width:100%;border-radius:10px;max-height:160px;object-fit:cover">
        </div>` : ''}

        <div class="body-sm text-muted mb-4">Repair is in progress. Once you've completed the job, take a completion photo and submit.</div>

        <input type="file" id="checkout-img-input" accept="image/*" capture="environment" style="display:none" onchange="handleCheckoutPhoto(event)">
        <div class="checkin-preview hidden" id="checkout-preview">
          <img id="checkout-preview-img" style="width:100%;border-radius:12px;max-height:200px;object-fit:cover;margin-bottom:12px">
          <div class="body-xs text-success flex-row gap-sm"><span class="material-icons-outlined" style="font-size:14px">check_circle</span>Completion photo ready</div>
        </div>

        <button class="btn btn-outline btn-full mb-3" onclick="document.getElementById('checkout-img-input').click()">
          <span class="material-icons-outlined">add_a_photo</span>
          Take Completion Photo
        </button>
        <button class="btn btn-success btn-full" id="complete-work-btn" style="opacity:0.5;pointer-events:none" onclick="confirmCompleteWork()">
          <span class="btn-text">Submit Completion</span>
          <span class="material-icons-outlined" style="font-size:18px">check_circle</span>
        </button>
        <div class="body-xs text-muted text-center mt-2">Take a photo of the repaired site first</div>
      </div>
      ` : ''}

      <!-- ── COMPLETED STATE ── -->
      ${isCompleted ? `
      <div class="work-state-card completed-state">
        <div class="completion-badge">
          <span class="material-icons-outlined" style="font-size:36px">verified</span>
          <div class="title-md mb-1">Task Completed</div>
          <div class="body-sm text-muted">Finished ${formatDate(task.work_completed_at)}</div>
        </div>
        ${(task.work_started_photo || task.work_completed_photo) ? `
        <div class="before-after-grid mt-4">
          ${task.work_started_photo ? `<div>
            <div class="body-xs text-muted mb-1">BEFORE REPAIR</div>
            <img src="${task.work_started_photo}" style="width:100%;border-radius:10px;height:120px;object-fit:cover">
          </div>` : ''}
          ${task.work_completed_photo ? `<div>
            <div class="body-xs text-muted mb-1">AFTER REPAIR</div>
            <img src="${task.work_completed_photo}" style="width:100%;border-radius:10px;height:120px;object-fit:cover">
          </div>` : ''}
        </div>` : ''}
      </div>
      ` : ''}
    </div>
  `;
  setTimeout(() => initScrollReveal(), 80);
}

// Worker check-in photo
let checkinPhotoDataURL   = null;
let checkoutPhotoDataURL  = null;

function handleCheckinPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    checkinPhotoDataURL = e.target.result;
    const preview    = document.getElementById('checkin-preview');
    const previewImg = document.getElementById('checkin-preview-img');
    if (previewImg) previewImg.src = e.target.result;
    if (preview) { preview.classList.remove('hidden'); preview.style.animation='revealUp 0.4s ease both'; }
    const btn = document.getElementById('start-work-btn');
    if (btn) { btn.style.opacity='1'; btn.style.pointerEvents='auto'; }
    showToast('Check-in photo ready!', 'success');
  };
  reader.readAsDataURL(file);
}

function handleCheckoutPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    checkoutPhotoDataURL = e.target.result;
    const preview    = document.getElementById('checkout-preview');
    const previewImg = document.getElementById('checkout-preview-img');
    if (previewImg) previewImg.src = e.target.result;
    if (preview) { preview.classList.remove('hidden'); preview.style.animation='revealUp 0.4s ease both'; }
    const btn = document.getElementById('complete-work-btn');
    if (btn) { btn.style.opacity='1'; btn.style.pointerEvents='auto'; }
    showToast('Completion photo ready!', 'success');
  };
  reader.readAsDataURL(file);
}

async function confirmStartWork() {
  const task = MOCK_REPORTS.find(r => r.id === activeWorkerTaskId);
  if (!task || !checkinPhotoDataURL) return;

  showLoading('Logging work start…');
  await fakeDelay(800);

  task.work_started_at    = new Date().toISOString();
  task.work_started_photo = checkinPhotoDataURL || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face';

  hideLoading();
  checkinPhotoDataURL = null;
  showToast('Work session started! Navigate to the site.', 'success');

  // Refresh the task view
  renderWorkerTaskActive(task);
  loadWorkerTasks();
}

async function confirmCompleteWork() {
  const task = MOCK_REPORTS.find(r => r.id === activeWorkerTaskId);
  if (!task || !checkoutPhotoDataURL) return;

  showLoading('Submitting completion…');
  await fakeDelay(1200);

  task.status              = 'completed';
  task.work_completed_at   = new Date().toISOString();
  task.work_completed_photo= checkoutPhotoDataURL;

  // Update worker stats
  const workerData = MOCK_WORKERS.find(w => w.id === currentUser?.id);
  if (workerData) { workerData.tasks_completed++; workerData.active_tasks = Math.max(0, workerData.active_tasks-1); }

  hideLoading();
  checkoutPhotoDataURL = null;
  showToast('Task marked as completed! ✅ Great work!', 'success', 4000);

  renderWorkerTaskActive(task);
  loadWorkerTasks();
}

function openExternalNavigationFor(taskId) {
  const task = MOCK_REPORTS.find(r => r.id === taskId);
  if (task?.latitude) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${task.latitude},${task.longitude}`, '_blank');
  } else {
    showToast('No GPS coordinates for this task', 'error');
  }
}

function openExternalNavigation() {
  const task = MOCK_REPORTS.find(r => r.assigned_worker_id === currentUser?.id && r.status === 'assigned');
  if (task?.latitude) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${task.latitude},${task.longitude}`, '_blank');
  }
}

async function markAttendance() {
  const el = document.getElementById('last-checkin');
  const now = new Date();
  
  if (db && currentUser && !URBANFLOW_CONFIG.isMock) {
    try {
      showLoading('Recording attendance…');
      await db.collection('attendance').add({
        worker_id: currentUser.id,
        login_time: firebase.firestore.FieldValue.serverTimestamp()
      });
      hideLoading();
    } catch(e) {
      hideLoading();
      showToast('Error recording attendance: ' + e.message, 'error');
      return;
    }
  }
  
  showToast('Daily attendance marked!', 'success');
  if (el) el.textContent = `Today, ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} ${now.getHours()<12?'AM':'PM'}`;
}

// =============================================================
//  LEAFLET MAPS
// =============================================================
function initCitizenMap() {
  const el = document.getElementById('citizen-leaflet-map');
  if (!el || citizenMap) return;
  citizenMap = L.map('citizen-leaflet-map', { zoomControl:false }).setView([URBANFLOW_CONFIG.defaultLat, URBANFLOW_CONFIG.defaultLng], URBANFLOW_CONFIG.defaultZoom);
  L.tileLayer(URBANFLOW_CONFIG.mapTiles, { attribution:URBANFLOW_CONFIG.mapAttrib, maxZoom:19 }).addTo(citizenMap);
  L.control.zoom({ position:'bottomright' }).addTo(citizenMap);
  addReportMarkers(citizenMap);
}

function initWorkerMap() {
  const el = document.getElementById('worker-leaflet-map');
  if (!el || workerMap) return;
  const myTask = MOCK_REPORTS.find(r => r.assigned_worker_id === currentUser?.id && r.status === 'assigned');
  const center = myTask ? [myTask.latitude, myTask.longitude] : [URBANFLOW_CONFIG.defaultLat, URBANFLOW_CONFIG.defaultLng];
  workerMap = L.map('worker-leaflet-map', { zoomControl:false }).setView(center, 15);
  L.tileLayer(URBANFLOW_CONFIG.mapTiles, { attribution:URBANFLOW_CONFIG.mapAttrib, maxZoom:19 }).addTo(workerMap);
  L.control.zoom({ position:'bottomright' }).addTo(workerMap);
  addReportMarkers(workerMap);
  // Worker marker
  const wIcon = L.divIcon({ className:'', html:`<div style="width:38px;height:38px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 8px rgba(44,123,229,0.2);color:white"><span class="material-icons-outlined" style="font-size:20px">person_pin_circle</span></div>`, iconSize:[38,38], iconAnchor:[19,19] });
  L.marker(center, { icon: wIcon }).addTo(workerMap).bindPopup('<b>Your Location</b>');
}

function addReportMarkers(map) {
  const colors = { pothole:'#E63757', crack:'#2C7BE5', water_logging:'#00D27A', garbage:'#E0A64C' };
  MOCK_REPORTS.forEach(r => {
    if (!r.latitude) return;
    const color = colors[r.category] || '#2C7BE5';
    const icon = L.divIcon({ className:'', html:`<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`, iconSize:[14,14], iconAnchor:[7,7] });
    L.marker([r.latitude, r.longitude], { icon }).addTo(map)
      .bindPopup(`<b>${catLabel(r.category)}</b><br>${r.address||''}<br><small>${statusLabel(r.status)}</small>`);
  });
}

function centerMap() {
  if (citizenMap) citizenMap.setView([URBANFLOW_CONFIG.defaultLat, URBANFLOW_CONFIG.defaultLng], URBANFLOW_CONFIG.defaultZoom);
}

// =============================================================
//  HELPERS
// =============================================================
function animateCount(elId, target) {
  const el = document.getElementById(elId);
  if (!el) return;
  const dur = 700, t0 = performance.now();
  const step = (now) => {
    const p = Math.min((now-t0)/dur, 1);
    const e = 1 - Math.pow(1-p, 3);
    el.textContent = Math.round(target * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function catLabel(c)   { return ({pothole:'Pothole',crack:'Road Crack',water_logging:'Water Logging',garbage:'Garbage'})[c] || c; }
function statusLabel(s){ return ({submitted:'Pending',assigned:'Assigned',completed:'Completed'})[s] || s; }
function timeAgo(iso)  {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)    return `${Math.round(d)}s ago`;
  if (d < 3600)  return `${Math.round(d/60)}m ago`;
  if (d < 86400) return `${Math.round(d/3600)}h ago`;
  return `${Math.round(d/86400)}d ago`;
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
