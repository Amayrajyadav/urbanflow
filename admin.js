// ============================================================
//  UrbanFlow — admin.js
//  Admin dashboard: auth, charts, table, map, workers
// ============================================================

'use strict';

// ─── State ────────────────────────────────────────────────────
let adminUser      = null;
let auth           = null;
let db             = null;
let adminMap       = null;
let barChart       = null;
let pieChart       = null;
let hourlyChart    = null;
let currentSection = 'dashboard';
let allReports     = [...MOCK_REPORTS];
let assigningReportId = null;
let sortKey        = 'created_at';
let sortDir        = 'desc';
let currentPage    = 1;
const PAGE_SIZE    = 8;
let isDarkAdmin    = false;

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFirebaseAdmin();
  animateLoginFields();
  // Allow Enter key on login
  document.getElementById('admin-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') adminLogin();
  });
});

function initFirebaseAdmin() {
  if (!URBANFLOW_CONFIG.isMock && window.firebase) {
    try {
      if (!firebase.apps.length) firebase.initializeApp(URBANFLOW_CONFIG.firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
    } catch(e) { console.warn('Firebase init failed:', e); }
  }
}

function animateLoginFields() {
  const fields = document.querySelectorAll('.login-card .form-group, .btn-admin');
  fields.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    setTimeout(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 200 + i * 80);
  });
}

// =============================================================
//  AUTH
// =============================================================

async function adminLogin() {
  const email = document.getElementById('admin-email')?.value.trim();
  const pwd   = document.getElementById('admin-password')?.value;
  const btn   = document.getElementById('admin-login-btn');

  if (btn) {
    btn.innerHTML = '<div style="width:18px;height:18px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite"></div>';
    btn.disabled = true;
  }

  try {
    if (auth && !URBANFLOW_CONFIG.isMock) {
      const cred = await auth.signInWithEmailAndPassword(email, pwd);
      if (cred.user.email !== 'admin@demo.com') throw new Error('Not an admin account');
      adminUser = { ...MOCK_USERS.admin };
    } else {
      await delay(900);
      adminUser = { ...MOCK_USERS.admin };
    }
    showAdminApp();
  } catch(e) {
    showAdminToast(e.message || 'Login failed', 'error');
  } finally {
    if (btn) {
      btn.innerHTML = '<span class="btn-text-inner">Sign in to Dashboard</span><span class="material-icons-outlined">arrow_forward</span>';
      btn.disabled = false;
    }
  }
}

async function showAdminApp() {
  const overlay = document.getElementById('admin-login-overlay');
  const app     = document.getElementById('admin-app');

  if (overlay) {
    overlay.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    overlay.style.opacity = '0';
    overlay.style.transform = 'scale(1.05)';
    setTimeout(() => overlay.style.display = 'none', 400);
  }
  if (app) app.style.display = 'flex';

  // Populate sidebar user
  const sName = document.getElementById('sidebar-name');
  const sInit = document.getElementById('sidebar-avatar-initials');
  const name  = adminUser?.name || 'Admin';
  if (sName) sName.textContent = name;
  if (sInit) sInit.textContent = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

  // Load all data
  await loadAllData();
  renderDashboard();
  renderReportsTable();
  renderWorkers();

  showAdminToast(`Welcome, ${name}!`, 'success');
}

function adminLogout() {
  if (auth) auth.signOut();
  location.reload();
}

function toggleAdminPwd() {
  const inp = document.getElementById('admin-password');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// =============================================================
//  DATA
// =============================================================

async function loadAllData() {
  try {
    if (supaClient) {
      const [{ data: rData }, { data: wData }] = await Promise.all([
        supaClient.from('reports').select('*').order('created_at', { ascending:false }),
        supaClient.from('workers').select('*'),
      ]);
      if (rData) allReports = rData;
    }
    // else use MOCK_REPORTS from config.js
  } catch(e) {
    console.warn('loadAllData error:', e);
  }
}

function refreshAll() {
  const btn = document.querySelector('.icon-btn[title="Refresh"] .material-icons-outlined');
  if (btn) { btn.style.animation = 'spin 0.8s linear'; setTimeout(() => btn.style.animation='', 800); }
  loadAllData().then(() => {
    renderDashboard();
    renderReportsTable();
    showAdminToast('Data refreshed', 'success');
  });
}

// =============================================================
//  NAVIGATION
// =============================================================

function showSection(name, linkEl) {
  currentSection = name;

  // Hide all sections
  document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));

  // Show target
  const section = document.getElementById(`section-${name}`);
  if (section) {
    section.classList.remove('hidden');
    section.style.animation = 'cardSlideUp 0.35s cubic-bezier(0.16,1,0.3,1) both';
  }

  // Update sidebar links
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  if (linkEl) linkEl.classList.add('active');

  // Update topbar
  const titles = {
    dashboard: ['Dashboard', 'Overview of all city road reports'],
    reports:   ['Reports',   'All submitted road damage reports'],
    map:       ['Live Map',  'Real-time report locations'],
    workers:   ['Workers',   'Field worker management'],
    settings:  ['Settings',  'System configuration'],
  };
  const [title, subtitle] = titles[name] || ['UrbanFlow', ''];
  const tEl = document.getElementById('topbar-title');
  const sEl = document.getElementById('topbar-subtitle');
  if (tEl) tEl.textContent = title;
  if (sEl) sEl.textContent = subtitle;

  // Lazy-init map
  if (name === 'map' && !adminMap) {
    setTimeout(initAdminMap, 300);
    renderMapList();
  }

  // Re-render charts on dashboard nav
  if (name === 'dashboard') {
    setTimeout(() => {
      renderBarChart();
      renderPieChart();
      renderHourlyChart();
    }, 100);
  }
}

// =============================================================
//  DASHBOARD
// =============================================================

function renderDashboard() {
  const total     = allReports.length;
  const pending   = allReports.filter(r=>r.status==='submitted').length;
  const assigned  = allReports.filter(r=>r.status==='assigned').length;
  const completed = allReports.filter(r=>r.status==='completed').length;
  const workers   = MOCK_WORKERS.length;

  animateStatNum('stat-total',     total);
  animateStatNum('stat-pending',   pending);
  animateStatNum('stat-completed', completed);
  animateStatNum('stat-workers',   workers);
  const badge = document.getElementById('reports-badge');
  if (badge) badge.textContent = pending;

  renderDashRecentList();
  setTimeout(() => {
    renderBarChart();
    renderPieChart();
    renderHourlyChart();
  }, 200);
}

function renderDashRecentList() {
  const container = document.getElementById('dash-recent-list');
  if (!container) return;
  const recent = [...allReports].slice(0,6);
  container.innerHTML = recent.map(r => `
    <div class="dash-mini-item" onclick="showSection('reports',document.getElementById('link-reports'))">
      <img src="${r.image_url||''}" class="dash-mini-img" onerror="this.style.background='var(--border)'">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${catLabel(r.category)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${r.address||'Unknown'} · ${timeAgo(r.created_at)}</div>
      </div>
      <span class="badge badge-${r.status}">${statusLabel(r.status)}</span>
    </div>
  `).join('');
}

// =============================================================
//  CHARTS
// =============================================================

const CHART_COLORS = {
  primary:'rgba(44,123,229,0.85)',
  success:'rgba(0,210,122,0.85)',
  warning:'rgba(224,166,76,0.85)',
  danger :'rgba(230,55,87,0.85)',
  muted  :'rgba(149,170,201,0.3)',
};

const CHART_DEFAULTS = {
  font:{ family:"'Inter',sans-serif", size:12 },
  color:'#95AAC9',
};

function renderBarChart() {
  const canvas = document.getElementById('bar-chart');
  if (!canvas) return;
  if (barChart) barChart.destroy();

  const cats = ['pothole','crack','water_logging','garbage'];
  const counts = cats.map(c => allReports.filter(r=>r.category===c).length);

  barChart = new Chart(canvas, {
    type:'bar',
    data:{
      labels:['Pothole','Crack','Water Logging','Garbage'],
      datasets:[{
        label:'Reports',
        data:counts,
        backgroundColor:[CHART_COLORS.danger,CHART_COLORS.primary,CHART_COLORS.success,CHART_COLORS.warning],
        borderRadius:8,
        borderSkipped:false,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{ duration:800, easing:'easeOutQuart' },
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label: ctx => ` ${ctx.parsed.y} reports` } }
      },
      scales:{
        x:{ grid:{ display:false }, ticks:{ ...CHART_DEFAULTS, color:CHART_DEFAULTS.color } },
        y:{ grid:{ color:'rgba(149,170,201,0.1)' }, ticks:{ ...CHART_DEFAULTS, color:CHART_DEFAULTS.color, stepSize:1 }, beginAtZero:true },
      }
    }
  });
}

function renderPieChart() {
  const canvas = document.getElementById('pie-chart');
  if (!canvas) return;
  if (pieChart) pieChart.destroy();

  const submitted = allReports.filter(r=>r.status==='submitted').length;
  const assigned  = allReports.filter(r=>r.status==='assigned').length;
  const completed = allReports.filter(r=>r.status==='completed').length;

  pieChart = new Chart(canvas, {
    type:'doughnut',
    data:{
      labels:['Pending','Assigned','Completed'],
      datasets:[{
        data:[submitted, assigned, completed],
        backgroundColor:[CHART_COLORS.warning, CHART_COLORS.primary, CHART_COLORS.success],
        borderWidth:0,
        hoverOffset:8,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{ animateRotate:true, duration:900, easing:'easeInOutQuart' },
      cutout:'65%',
      plugins:{
        legend:{ position:'bottom', labels:{ padding:16, font:CHART_DEFAULTS.font, color:CHART_DEFAULTS.color } },
      }
    }
  });
}

function renderHourlyChart() {
  const canvas = document.getElementById('hourly-chart');
  if (!canvas) return;
  if (hourlyChart) hourlyChart.destroy();

  const hours = Array.from({length:24}, (_,i) => i);
  const counts = hours.map(h => {
    return allReports.filter(r => {
      const rh = new Date(r.created_at).getHours();
      return rh === h;
    }).length;
  });
  const labels = hours.map(h => `${h.toString().padStart(2,'0')}:00`);

  hourlyChart = new Chart(canvas, {
    type:'line',
    data:{
      labels,
      datasets:[{
        label:'Reports',
        data:counts,
        borderColor:'rgba(44,123,229,0.9)',
        backgroundColor:createGradient(canvas.getContext('2d')),
        borderWidth:2.5,
        tension:0.4,
        pointRadius:4,
        pointBackgroundColor:'#2C7BE5',
        pointBorderColor:'#fff',
        pointBorderWidth:2,
        fill:true,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{ duration:1000, easing:'easeOutQuart' },
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ grid:{ display:false }, ticks:{ ...CHART_DEFAULTS, color:CHART_DEFAULTS.color, maxTicksLimit:8 } },
        y:{ grid:{ color:'rgba(149,170,201,0.1)' }, ticks:{ ...CHART_DEFAULTS, color:CHART_DEFAULTS.color, stepSize:1 }, beginAtZero:true },
      }
    }
  });
}

function createGradient(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0,'rgba(44,123,229,0.25)');
  gradient.addColorStop(1,'rgba(44,123,229,0)');
  return gradient;
}

function animateStatNum(elId, target) {
  const el = document.getElementById(elId);
  if (!el) return;
  const start = 0;
  const dur = 700;
  const t0 = performance.now();
  function step(now) {
    const progress = Math.min((now-t0)/dur, 1);
    const ease = 1 - Math.pow(1-progress, 3);
    el.textContent = Math.round(start + (target-start)*ease);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// =============================================================
//  REPORTS TABLE
// =============================================================

function applyFilters() {
  const status   = document.getElementById('filter-status')?.value;
  const category = document.getElementById('filter-category')?.value;
  const date     = document.getElementById('filter-date')?.value;
  const search   = (document.getElementById('report-search')?.value || '').toLowerCase();

  let filtered = [...allReports];
  if (status)   filtered = filtered.filter(r => r.status === status);
  if (category) filtered = filtered.filter(r => r.category === category);
  if (date)     filtered = filtered.filter(r => r.created_at?.startsWith(date));
  if (search)   filtered = filtered.filter(r =>
    (r.address||'').toLowerCase().includes(search) ||
    (r.category||'').toLowerCase().includes(search) ||
    (r.id||'').toLowerCase().includes(search)
  );

  // Sort
  filtered.sort((a,b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (typeof av === 'string') av = av.toLowerCase(), bv = (bv||'').toLowerCase();
    return sortDir==='asc' ? (av>bv?1:-1) : (av<bv?1:-1);
  });

  currentPage = 1;
  renderTableRows(filtered);
  renderPagination(filtered.length);
}

function sortTable(key) {
  if (sortKey === key) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey = key; sortDir = 'asc';
  }
  applyFilters();
}

function renderReportsTable() {
  applyFilters();
}

function renderTableRows(reports) {
  const tbody = document.getElementById('reports-tbody');
  if (!tbody) return;

  const paged = reports.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);

  if (!paged.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">No reports match your filters</td></tr>`;
    return;
  }

  tbody.innerHTML = paged.map((r,i) => {
    const worker = MOCK_WORKERS.find(w => w.id === r.assigned_worker_id);
    return `
      <tr style="animation:cardSlideUp 0.35s ease ${i*0.04}s both">
        <td><img src="${r.image_url||''}" onerror="this.style.background='var(--border)';this.src=''"></td>
        <td style="font-family:monospace;font-size:12px;color:var(--text-muted)">#${r.id.slice(-6).toUpperCase()}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:8px;height:8px;border-radius:50%;background:${catColor(r.category)};flex-shrink:0"></div>
            <span style="font-weight:500">${catLabel(r.category)}</span>
          </div>
        </td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.address||'Unknown'}</td>
        <td style="font-family:monospace;font-size:11px;color:var(--text-muted)">${r.latitude?.toFixed(4)||'—'}, ${r.longitude?.toFixed(4)||'—'}</td>
        <td><span class="badge badge-${r.status}">${statusLabel(r.status)}</span></td>
        <td>${worker ? `<div style="display:flex;align-items:center;gap:6px"><div style="width:24px;height:24px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">${worker.name[0]}</div><span>${worker.name}</span></div>` : `<button class="btn-admin btn-outline-admin btn-sm" onclick="openAssignModal('${r.id}')">Assign</button>`}</td>
        <td style="color:var(--text-muted);font-size:12px">${timeAgo(r.created_at)}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn-admin btn-outline-admin btn-icon" title="Assign worker" onclick="openAssignModal('${r.id}')">
              <span class="material-icons-outlined" style="font-size:16px">assignment_ind</span>
            </button>
            <button class="btn-admin btn-outline-admin btn-icon" title="Mark completed" onclick="adminCompleteReport('${r.id}')">
              <span class="material-icons-outlined" style="font-size:16px">check_circle</span>
            </button>
            <button class="btn-admin btn-icon" style="background:rgba(230,55,87,0.1);border:1.5px solid rgba(230,55,87,0.2);color:var(--danger)" title="Delete" onclick="deleteReport('${r.id}')">
              <span class="material-icons-outlined" style="font-size:16px">delete_outline</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPagination(totalCount) {
  const container = document.getElementById('pagination');
  if (!container) return;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  if (totalPages <= 1) { container.innerHTML=''; return; }

  let html = `
    <button class="page-btn" onclick="changePage(${currentPage-1})" ${currentPage===1?'disabled style="opacity:0.4"':''}>
      <span class="material-icons-outlined" style="font-size:16px">chevron_left</span>
    </button>`;
  for (let p=1; p<=totalPages; p++) {
    html += `<button class="page-btn ${p===currentPage?'active':''}" onclick="changePage(${p})">${p}</button>`;
  }
  html += `<button class="page-btn" onclick="changePage(${currentPage+1})" ${currentPage===totalPages?'disabled style="opacity:0.4"':''}>
      <span class="material-icons-outlined" style="font-size:16px">chevron_right</span>
    </button>`;
  container.innerHTML = html;
}

function changePage(p) {
  const totalPages = Math.ceil(allReports.length / PAGE_SIZE);
  if (p < 1 || p > totalPages) return;
  currentPage = p;
  applyFilters();
}

function exportReports() {
  // Simple CSV export
  const headers = ['ID','Category','Status','Address','Latitude','Longitude','Date'];
  const rows = allReports.map(r => [
    r.id, r.category, r.status, r.address||'', r.latitude||'', r.longitude||'', r.created_at
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `urbanflow_reports_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showAdminToast('Reports exported as CSV', 'success');
}

function globalSearch(query) {
  document.getElementById('report-search').value = query;
  applyFilters();
}

// =============================================================
//  ASSIGN WORKER
// =============================================================

function openAssignModal(reportId) {
  assigningReportId = reportId;
  const report = allReports.find(r => r.id === reportId);
  const modal  = document.getElementById('assign-modal');
  const info   = document.getElementById('assign-modal-report-info');
  const select = document.getElementById('assign-worker-select');

  if (info) info.textContent = `Assigning worker to: ${catLabel(report?.category)} — ${report?.address||'Unknown'}`;

  if (select) {
    select.innerHTML = MOCK_WORKERS.map(w =>
      `<option value="${w.id}">${w.name} (Score: ${w.credibility_score}% | Done: ${w.tasks_completed})</option>`
    ).join('');
  }

  modal?.classList.remove('hidden');
}

async function confirmAssign() {
  if (!assigningReportId) return;
  const workerId = document.getElementById('assign-worker-select')?.value;
  const worker   = MOCK_WORKERS.find(w => w.id === workerId);

  try {
    if (supaClient) {
      await supaClient.from('reports').update({ assigned_worker_id:workerId, status:'assigned' }).eq('id', assigningReportId);
    } else {
      const r = allReports.find(r => r.id === assigningReportId);
      if (r) { r.assigned_worker_id = workerId; r.status = 'assigned'; }
    }

    closeModal();
    renderReportsTable();
    renderDashboard();
    showAdminToast(`Assigned to ${worker?.name}!`, 'success');
  } catch(e) {
    showAdminToast('Assignment failed', 'error');
  }
}

function closeModal() {
  const modal = document.getElementById('assign-modal');
  modal?.classList.add('hidden');
  assigningReportId = null;
}

async function adminCompleteReport(reportId) {
  try {
    if (supaClient) {
      await supaClient.from('reports').update({ status:'completed' }).eq('id', reportId);
    } else {
      const r = allReports.find(r => r.id === reportId);
      if (r) r.status = 'completed';
    }
    renderReportsTable();
    renderDashboard();
    showAdminToast('Report marked as completed', 'success');
  } catch(e) {
    showAdminToast('Update failed', 'error');
  }
}

function deleteReport(reportId) {
  if (!confirm('Delete this report permanently?')) return;
  const idx = allReports.findIndex(r => r.id === reportId);
  if (idx !== -1) allReports.splice(idx, 1);
  renderReportsTable();
  renderDashboard();
  showAdminToast('Report deleted', 'success');
}

// =============================================================
//  MAP
// =============================================================

function initAdminMap() {
  const el = document.getElementById('admin-leaflet-map');
  if (!el || adminMap) return;

  adminMap = L.map('admin-leaflet-map', { zoomControl:false }).setView(
    [URBANFLOW_CONFIG.defaultLat, URBANFLOW_CONFIG.defaultLng],
    URBANFLOW_CONFIG.defaultZoom
  );

  L.tileLayer(URBANFLOW_CONFIG.mapTiles, {
    attribution:URBANFLOW_CONFIG.mapAttrib, maxZoom:19
  }).addTo(adminMap);

  L.control.zoom({ position:'bottomright' }).addTo(adminMap);

  const colors = { pothole:'#E63757', crack:'#2C7BE5', water_logging:'#00D27A', garbage:'#E0A64C' };

  allReports.forEach(r => {
    if (!r.latitude) return;
    const color = colors[r.category] || '#2C7BE5';
    const icon  = L.divIcon({
      className:'',
      html:`<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
      iconSize:[14,14], iconAnchor:[7,7]
    });
    L.marker([r.latitude, r.longitude], { icon })
      .addTo(adminMap)
      .bindPopup(`
        <div style="font-family:'Inter',sans-serif;min-width:180px">
          <div style="font-weight:700;margin-bottom:4px">${catLabel(r.category)}</div>
          <div style="font-size:12px;color:#666;margin-bottom:6px">${r.address||''}</div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="background:${statusColor(r.status)};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase">${statusLabel(r.status)}</span>
            <span style="font-size:11px;color:#999">${timeAgo(r.created_at)}</span>
          </div>
        </div>
      `);
  });
}

function renderMapList() {
  const container = document.getElementById('map-report-list');
  if (!container) return;
  container.innerHTML = allReports.map(r => `
    <div class="map-report-item" onclick="panToReport(${r.latitude},${r.longitude})">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:8px;height:8px;border-radius:50%;background:${catColor(r.category)}"></div>
          <span style="font-size:13px;font-weight:600">${catLabel(r.category)}</span>
        </div>
        <span class="badge badge-${r.status}">${statusLabel(r.status)}</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted)">${r.address||'Unknown'}</div>
    </div>
  `).join('');
}

function panToReport(lat, lng) {
  if (adminMap && lat && lng) adminMap.setView([lat, lng], 16, { animate:true });
}

// =============================================================
//  WORKERS
// =============================================================

function renderWorkers() {
  const tbody = document.getElementById('workers-tbody');
  if (!tbody) return;

  const avatarColors = ['#2C7BE5','#E0A64C','#00D27A','#E63757','#7B68EE'];

  tbody.innerHTML = MOCK_WORKERS.map((w, i) => {
    const color = avatarColors[i % avatarColors.length];
    const scoreColor = w.credibility_score >= 90 ? '#00D27A' : w.credibility_score >= 70 ? '#E0A64C' : '#E63757';
    return `
      <tr style="animation:cardSlideUp 0.4s ease ${i*0.06}s both">
        <td>
          <div class="worker-name-cell">
            <div class="worker-avatar-sm" style="background:${color}">${w.name.split(' ').map(p=>p[0]).join('')}</div>
            <div>
              <div style="font-weight:600">${w.name}</div>
              <div style="font-size:11px;color:var(--text-muted)">${w.email}</div>
            </div>
          </div>
        </td>
        <td style="font-family:monospace;font-size:12px;color:var(--text-muted)">W-${w.id.slice(-3).toUpperCase()}</td>
        <td><span style="font-weight:700;color:var(--success)">${w.tasks_completed}</span></td>
        <td>
          <span style="background:rgba(44,123,229,0.1);color:var(--primary);padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700">${w.active_tasks}</span>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="score-bar-bg">
              <div class="score-bar-fill" style="width:${w.credibility_score}%;background:${scoreColor}"></div>
            </div>
            <span style="font-size:13px;font-weight:700;color:${scoreColor}">${w.credibility_score}%</span>
          </div>
        </td>
        <td style="color:var(--text-muted);font-size:12px">Zone ${i+1}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn-admin btn-outline-admin btn-sm" onclick="viewWorkerReports('${w.id}')">
              <span class="material-icons-outlined" style="font-size:14px">assignment</span>
              Reports
            </button>
            <button class="btn-admin btn-outline-admin btn-icon" title="Message worker">
              <span class="material-icons-outlined" style="font-size:16px">chat</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Animate score bars
  setTimeout(() => {
    document.querySelectorAll('.score-bar-fill').forEach(bar => {
      const w = bar.style.width;
      bar.style.width = '0%';
      setTimeout(() => { bar.style.width = w; }, 100);
    });
  }, 300);
}

function viewWorkerReports(workerId) {
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-category').value = '';
  showSection('reports', document.getElementById('link-reports'));
  // Filter table to this worker's reports
  const workerReports = allReports.filter(r => r.assigned_worker_id === workerId);
  renderTableRows(workerReports);
  renderPagination(workerReports.length);
}

// =============================================================
//  SETTINGS
// =============================================================

function adminToggleDark() {
  isDarkAdmin = !isDarkAdmin;
  document.documentElement.setAttribute('data-theme', isDarkAdmin ? 'dark' : '');
  const toggle = document.getElementById('admin-dark-toggle');
  if (toggle) toggle.classList.toggle('active', isDarkAdmin);
}

function saveSettings() {
  const url = document.getElementById('setting-ai-url')?.value;
  if (url) URBANFLOW_CONFIG.aiEndpoint = url;
  showAdminToast('Settings saved!', 'success');
}

// =============================================================
//  TOAST (Admin)
// =============================================================

function showAdminToast(msg, type='info', dur=3000) {
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();

  const icons = { success:'check_circle', error:'error', info:'info' };
  const t = document.createElement('div');
  t.className = `admin-toast ${type}`;
  t.innerHTML = `<span class="material-icons-outlined" style="font-size:18px">${icons[type]||'info'}</span>${msg}`;
  document.body.appendChild(t);

  setTimeout(() => {
    t.style.transition = 'opacity 0.3s, transform 0.3s';
    t.style.opacity = '0';
    t.style.transform = 'translateX(100%)';
    setTimeout(() => t.remove(), 300);
  }, dur);
}

// =============================================================
//  HELPERS
// =============================================================

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

function catLabel(c) {
  const map = { pothole:'Pothole', crack:'Road Crack', water_logging:'Water Logging', garbage:'Garbage' };
  return map[c] || c;
}
function catColor(c) {
  const map = { pothole:'#E63757', crack:'#2C7BE5', water_logging:'#00D27A', garbage:'#E0A64C' };
  return map[c] || '#95AAC9';
}
function statusLabel(s) {
  const map = { submitted:'Pending', assigned:'Assigned', completed:'Completed' };
  return map[s] || s;
}
function statusColor(s) {
  const map = { submitted:'#E0A64C', assigned:'#2C7BE5', completed:'#00D27A' };
  return map[s] || '#95AAC9';
}
function timeAgo(isoDate) {
  if (!isoDate) return '—';
  const diff = (Date.now() - new Date(isoDate).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff/60)}m ago`;
  if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
  return `${Math.round(diff/86400)}d ago`;
}
