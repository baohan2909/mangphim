// ════════════════════════════════════════════════════════════════
// [v12 v2] MODULE ADMIN — design pro, click stat → detail
// ════════════════════════════════════════════════════════════════
const ADM2 = {
  currentTab: 'tongquan',
  dashboardData: null,
  searchTimer: null,
  phienTimer: null,
  activeDetail: null,
};


// ─── Init ──────────────────────────────────────────────────
function adm2InitPage() {
  if (!SESSION || SESSION.vaiTro !== 'ADMIN') {
    document.querySelector('#page-admin .adm2-wrap').innerHTML =
      '<div class="adm2-empty">Không có quyền truy cập.</div>';
    return;
  }
  adm2LoadDashboard();
  if (ADM2.currentTab === 'phienbh') adm2StartPhienAutoRefresh();
}

function adm2SwitchTab(tab) {
  ADM2.currentTab = tab;
  document.querySelectorAll('.adm2-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.adm2-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('adm2-pane-' + tab).classList.add('active');

  if (tab === 'tongquan') { adm2LoadDashboard(); adm2StopPhienAutoRefresh(); adm2StopLiveTimer(); }
  if (tab === 'taikhoan') { adm2StopPhienAutoRefresh(); adm2StopLiveTimer(); adm2SearchAcc(); }
  if (tab === 'phienbh')  { adm2StopPhienAutoRefresh(); adm2StopLiveTimer(); }
  if (tab === 'chamcong') { adm2StopPhienAutoRefresh(); adm2StopLiveTimer(); }
  if (tab === 'phanquyen'){ adm2StopPhienAutoRefresh(); adm2StopLiveTimer(); if (typeof pqInit === 'function') pqInit(); }
  if (tab === 'khancap'){ adm2StopPhienAutoRefresh(); adm2StopLiveTimer(); if (typeof xkcInit === 'function') xkcInit(); }
}

// ─── Helpers ───────────────────────────────────────────────
function adm2Esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function adm2FmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' });
}
function adm2FmtDuration(min) {
  if (min == null) return '';
  const m = Math.max(0, Math.round(Number(min)));
  if (m < 60) return m + ' phút';
  return Math.floor(m/60) + 'h' + (m%60 ? (m%60+'p') : '');
}

// ─── Toast ────────────────────────────────────────────────
function adm2Toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'adm2-toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 200); }, 2400);
}

// ─── Modal custom (thay prompt/alert/confirm) ─────────────
function adm2Modal(opts) {
  // opts: { title, sub, type:'prompt'|'select'|'confirm', value, options, okLabel, danger, onOk }
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'adm2-modal-bg';
    const inputHtml = opts.type === 'prompt'
      ? `<input class="adm2-modal-input" id="adm2-modal-input" type="${opts.password ? 'text' : 'text'}" value="${adm2Esc(opts.value || '')}" placeholder="${adm2Esc(opts.placeholder || '')}" />`
      : opts.type === 'select'
        ? `<select class="adm2-modal-select" id="adm2-modal-input">${(opts.options||[]).map(o => `<option value="${adm2Esc(o.value)}"${o.value===opts.value?' selected':''}>${adm2Esc(o.label || o.value)}</option>`).join('')}</select>`
        : '';
    bg.innerHTML = `
      <div class="adm2-modal" onclick="event.stopPropagation()">
        <div class="adm2-modal-head">
          <div class="adm2-modal-title">${adm2Esc(opts.title || '')}</div>
          ${opts.sub ? `<div class="adm2-modal-sub">${adm2Esc(opts.sub)}</div>` : ''}
        </div>
        ${inputHtml ? `<div class="adm2-modal-body">${inputHtml}</div>` : ''}
        <div class="adm2-modal-foot">
          <button class="adm2-btn adm2-btn-secondary" id="adm2-modal-cancel">Hủy</button>
          <button class="adm2-btn ${opts.danger ? 'adm2-btn-danger' : 'adm2-btn-primary'}" id="adm2-modal-ok">${adm2Esc(opts.okLabel || 'OK')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    const inp = bg.querySelector('#adm2-modal-input');
    if (inp) setTimeout(() => inp.focus(), 50);
    const close = (val) => { bg.remove(); resolve(val); };
    bg.querySelector('#adm2-modal-cancel').onclick = () => close(null);
    bg.querySelector('#adm2-modal-ok').onclick = () => close(inp ? inp.value : true);
    bg.onclick = () => close(null);
    if (inp) inp.onkeydown = e => { if (e.key === 'Enter') close(inp.value); };
  });
}

async function adm2Confirm(title, sub, danger) {
  return !!(await adm2Modal({ title, sub, type:'confirm', okLabel: danger ? 'Xác nhận' : 'OK', danger }));
}

// ─── RPC wrapper ──────────────────────────────────────────
async function adm2Rpc(fn, params) {
  const { data, error } = await supa.rpc(fn, params);
  if (error) throw new Error(error.message || 'Network error');
  if (data && data.success === false) throw new Error(data.error || 'Lỗi');
  return data;
}

// ─── 1. DASHBOARD - các stat card ─────────────────────────
const ADM2_STATS_CONFIG = [
  // key, label, icon (svg path), color, click handler
  { key:'nv', label:'Nhân viên', color:'blue',
    icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    value: d => d.nv_active, suffix: d => '/' + d.nv_total, detail:'nv' },
  { key:'ql', label:'Quản lý', color:'violet',
    icon:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    value: d => d.ql_active, suffix: d => '/' + d.ql_total, detail:'ql' },
  { key:'ch', label:'Cửa hàng', color:'emerald',
    icon:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    value: d => d.ch_active, suffix: d => '/' + d.ch_total, detail:'ch' },
  { key:'mk', label:'Đã đổi mật khẩu', color:'slate',
    icon:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    value: d => d.nv_da_doi_mk, detail:'mk' },
  { key:'cc', label:'Chấm công hôm nay', color:'blue',
    icon:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    value: d => d.cc_hom_nay, detail:'cc' },
  { key:'cb', label:'Duyệt chấm công', color:'amber',
    icon:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    value: d => d.cb_chua_duyet, warn: d => d.cb_chua_duyet > 0, detail:'cb' },
  { key:'phien_mo', label:'Phiên đang mở', color:'amber',
    icon:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    value: d => d.phien_dang_mo, warn: d => d.phien_dang_mo > 0, detail:'phien_mo' },
  { key:'phien_today', label:'Phiên hôm nay', color:'emerald',
    icon:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    value: d => d.phien_da_mua_hom_nay, suffix: d => '/' + d.phien_hom_nay, detail:'phien_today' },
  { key:'dn', label:'Duyệt nghỉ phép', color:'rose',
    icon:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    value: d => d.don_nghi_cho_duyet, warn: d => d.don_nghi_cho_duyet > 0, detail:'dn' },
  // [v10.85] NV chưa kết thúc ca ngày trước
  { key:'chua_ra_ca', label:'Ca tự động đóng', color:'amber',
    icon:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/><path d="M3.5 3.5l17 17" stroke-width="1.5" opacity="0.5"/>',
    value: d => d.chua_ket_thuc_ca || 0, warn: d => (d.chua_ket_thuc_ca||0) > 0, detail:'chua_ra_ca' },
  // [v10.85] Card Settings
  { key:'settings', label:'Cài đặt hệ thống', color:'slate',
    icon:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    value: d => '⚙', warn: d => false, detail:'settings' },
];

async function adm2LoadDashboard() {
  const el = document.getElementById('adm2-stats');
  el.innerHTML = '<div class="adm2-empty" style="grid-column:1/-1">Đang tải...</div>';
  try {
    const data = await adm2Rpc('fn_admin_dashboard', { p_admin: SESSION.ma });
    const d = data.data; ADM2.dashboardData = d;
    // [v10.85] Đếm ca bị auto-close CHƯA được bổ sung RA_CA
    try {
      const vnNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
      const yToday = vnNow.getFullYear() + '-' + pad(vnNow.getMonth()+1) + '-' + pad(vnNow.getDate());
      const min30 = new Date(vnNow); min30.setDate(min30.getDate() - 30);
      const yMin = min30.getFullYear() + '-' + pad(min30.getMonth()+1) + '-' + pad(min30.getDate());
      const [acRes, bsRes] = await Promise.all([
        supa.from('cham_cong').select('ma_nv, ngay')
          .like('ghi_chu', '%AUTO-CLOSED%').lt('ngay', yToday).gte('ngay', yMin),
        supa.from('cham_cong').select('ma_nv, ngay')
          .eq('nguon', 'BO_SUNG_NV').eq('loai', 'RA_CA').lt('ngay', yToday).gte('ngay', yMin)
      ]);
      const boSung = new Set((bsRes.data||[]).map(r => r.ma_nv + '_' + r.ngay));
      const chuaBS = (acRes.data||[]).filter(r => !boSung.has(r.ma_nv + '_' + r.ngay));
      d.chua_ket_thuc_ca = chuaBS.length;
    } catch(e) { d.chua_ket_thuc_ca = 0; }
    el.innerHTML = ADM2_STATS_CONFIG.map(s => {
      const val = s.value(d);
      const sfx = s.suffix ? s.suffix(d) : '';
      const cls = s.warn && s.warn(d) ? 'warn' : '';
      return `
        <div class="adm2-stat" onclick="adm2OpenDetail('${s.detail}')">
          <div class="adm2-stat-chev">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="adm2-stat-icon ${s.color}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
          </div>
          <div class="adm2-stat-label">${s.label}</div>
          <div class="adm2-stat-value ${cls}">${val}<span class="adm2-stat-suffix">${sfx}</span></div>
        </div>
      `;
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="adm2-empty" style="color:#DC2626;grid-column:1/-1">Lỗi: ' + adm2Esc(e.message) + '</div>';
  }
}

// ─── Stat detail panel ────────────────────────────────────
function adm2CloseDetail() {
  document.getElementById('adm2-detail-wrap').innerHTML = '';
  ADM2.activeDetail = null;
  // [v5.3] Nếu không còn card trên trang → tắt timer cho đỡ tốn CPU
  if (!document.querySelector('#adm2-phien-list .bh-live-card, #adm2-detail-body .bh-live-card')) {
    adm2StopLiveTimer();
  }
}

function adm2OpenDetail(key) {
  if (ADM2.activeDetail === key) { adm2CloseDetail(); return; }
  ADM2.activeDetail = key;
  const w = document.getElementById('adm2-detail-wrap');
  w.innerHTML = `
    <div class="adm2-detail">
      <div class="adm2-detail-head">
        <div class="adm2-detail-title" id="adm2-detail-title">Đang tải...</div>
        <button class="adm2-detail-close" onclick="adm2CloseDetail()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="adm2-detail-body" id="adm2-detail-body">
        <div class="adm2-empty">Đang tải...</div>
      </div>
    </div>
  `;
  w.scrollIntoView({ behavior:'smooth', block:'nearest' });

  // Dispatch theo key
  const titleEl = document.getElementById('adm2-detail-title');
  const bodyEl  = document.getElementById('adm2-detail-body');
  const map = {
    nv:        { title:'Danh sách nhân viên',                  loader: () => adm2DetailListAcc('NV', null, bodyEl) },
    ql:        { title:'Danh sách quản lý',                    loader: () => adm2DetailListAcc('QL', null, bodyEl) },
    ch:        { title:'Cửa hàng không hoạt động',             loader: () => adm2DetailListAcc('CH', 'INACTIVE', bodyEl) },
    mk:        { title:'Tài khoản đã đổi mật khẩu',            loader: () => adm2DetailDaDoiMK(bodyEl) },
    cc:        { title:'Chấm công hôm nay',                    loader: () => adm2DetailCCHomNay(bodyEl) },
    cb:        { title:'Duyệt chấm công',                      loader: () => adm2DetailCanhBao(bodyEl) },
    phien_mo:  { title:'Phiên đang mở',                        loader: () => adm2DetailPhienDangMo(bodyEl) },
    phien_today:{title:'Phiên hôm nay',                        loader: () => adm2DetailPhienHomNay(bodyEl) },
    dn:        { title:'Duyệt nghỉ phép',                      loader: () => adm2DetailDonNghi(bodyEl) },
    chua_ra_ca:{ title:'Ca hệ thống tự động đóng',            loader: () => adm2DetailChuaRaCa(bodyEl) },
    settings:  { title:'Cài đặt hệ thống',                     loader: () => adm2DetailSettings(bodyEl) },
  };
  const m = map[key];
  if (m) { titleEl.textContent = m.title; m.loader(); }
}

// Detail: list account theo filter
async function adm2DetailListAcc(loai, statusFilter, bodyEl) {
  try {
    const data = await adm2Rpc('fn_admin_search_account', { p_admin: SESSION.ma, p_keyword:'', p_loai:loai, p_limit:200 });
    let list = data.data || [];
    if (statusFilter) list = list.filter(a => String(a.trang_thai||'').toUpperCase() !== 'ACTIVE');
    adm2RenderAccRows(list, bodyEl);
  } catch (e) { bodyEl.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: '+adm2Esc(e.message)+'</div>'; }
}

async function adm2DetailDaDoiMK(bodyEl) {
  try {
    const data = await adm2Rpc('fn_admin_search_account', { p_admin: SESSION.ma, p_keyword:'', p_loai:'ALL', p_limit:500 });
    const list = (data.data || []).filter(a => a.da_doi_mk);
    adm2RenderAccRows(list, bodyEl);
  } catch (e) { bodyEl.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: '+adm2Esc(e.message)+'</div>'; }
}

// [v10.85] Ca bị hệ thống tự đóng (AUTO-CLOSED) — filter click + lọc ngày
let _craFilter = 'all';   // all | da | chua
let _craTuNgay = '';
let _craDenNgay = '';
let _craRawData = null;   // cache {data, boSungMap}

async function adm2DetailChuaRaCa(bodyEl) {
  try {
    _craFilter = 'all'; _craTuNgay = ''; _craDenNgay = '';
    const vnNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const yToday = vnNow.getFullYear() + '-' + pad(vnNow.getMonth()+1) + '-' + pad(vnNow.getDate());
    const min30 = new Date(vnNow); min30.setDate(min30.getDate() - 30);
    const yMin = min30.getFullYear() + '-' + pad(min30.getMonth()+1) + '-' + pad(min30.getDate());
    const [acRes, bsRes] = await Promise.all([
      supa.from('cham_cong')
        .select('ma_nv, ten_nv_snapshot, ten_ch_snapshot, ma_ch, ngay, thoi_gian, ghi_chu, device_info')
        .like('ghi_chu', '%AUTO-CLOSED%').lt('ngay', yToday).gte('ngay', yMin)
        .order('ngay', { ascending: false }),
      supa.from('cham_cong').select('ma_nv, ngay, thoi_gian')
        .eq('nguon', 'BO_SUNG_NV').eq('loai', 'RA_CA').lt('ngay', yToday).gte('ngay', yMin)
    ]);
    if (acRes.error) { bodyEl.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: ' + adm2Esc(acRes.error.message) + '</div>'; return; }
    const data = acRes.data || [];
    if (!data.length) { bodyEl.innerHTML = '<div class="adm2-empty">✓ Không có ca nào bị tự động đóng trong 30 ngày</div>'; return; }
    const boSungMap = {};
    (bsRes.data||[]).forEach(r => { boSungMap[r.ma_nv + '_' + r.ngay] = r.thoi_gian; });
    // [v10.85] Build doiMap để detect đội sale
    window._doiSaleMap = _buildDoiSaleMap(data);
    _craRawData = { data, boSungMap, yMin: yMin, yMax: yToday };
    _craRenderBody(bodyEl);
  } catch (e) { bodyEl.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: ' + adm2Esc(e.message) + '</div>'; }
}

function _craSetFilter(f){ _craFilter = (_craFilter === f) ? 'all' : f; _craRenderBody(document.getElementById('adm2-detail-body')); }
function _craSetNgay(){ 
  _craTuNgay = document.getElementById('cra-tu').value || '';
  _craDenNgay = document.getElementById('cra-den').value || '';
  _craRenderBody(document.getElementById('adm2-detail-body'));
}
function _craResetNgay(){ _craTuNgay=''; _craDenNgay=''; _craRenderBody(document.getElementById('adm2-detail-body')); }

function _craRenderBody(bodyEl){
  if (!_craRawData) return;
  const { data, boSungMap } = _craRawData;
  const dow = ['CN','T2','T3','T4','T5','T6','T7'];

  // Tổng thống kê (toàn bộ, không theo filter ngày để giữ ổn định? -> theo ngày luôn cho khớp)
  let pool = data.slice();
  if (_craTuNgay) pool = pool.filter(r => r.ngay >= _craTuNgay);
  if (_craDenNgay) pool = pool.filter(r => r.ngay <= _craDenNgay);

  let soDaBS = 0, soChuaBS = 0;
  pool.forEach(r => { if (boSungMap[r.ma_nv + '_' + r.ngay]) soDaBS++; else soChuaBS++; });

  // Áp filter trạng thái
  let shown = pool.slice();
  if (_craFilter === 'da')   shown = shown.filter(r => boSungMap[r.ma_nv + '_' + r.ngay]);
  if (_craFilter === 'chua') shown = shown.filter(r => !boSungMap[r.ma_nv + '_' + r.ngay]);

  const cardDa = `<div onclick="_craSetFilter('da')" style="flex:1;cursor:pointer;background:${_craFilter==='da'?'#059669':'#ECFDF5'};border:1.5px solid ${_craFilter==='da'?'#059669':'#A7F3D0'};border-radius:10px;padding:10px;text-align:center;transition:.15s">
      <div style="font-size:20px;font-weight:700;color:${_craFilter==='da'?'#fff':'#059669'}">${soDaBS}</div>
      <div style="font-size:11px;color:${_craFilter==='da'?'#fff':'#047857'};font-weight:600">Đã bổ sung lại</div>
    </div>`;
  const cardChua = `<div onclick="_craSetFilter('chua')" style="flex:1;cursor:pointer;background:${_craFilter==='chua'?'#D97706':'#FEF3C7'};border:1.5px solid ${_craFilter==='chua'?'#D97706':'#FDE68A'};border-radius:10px;padding:10px;text-align:center;transition:.15s">
      <div style="font-size:20px;font-weight:700;color:${_craFilter==='chua'?'#fff':'#D97706'}">${soChuaBS}</div>
      <div style="font-size:11px;color:${_craFilter==='chua'?'#fff':'#B45309'};font-weight:600">Chưa bổ sung</div>
    </div>`;

  let html = `<div style="display:flex;gap:8px;margin-bottom:10px">${cardDa}${cardChua}</div>`;
  // Bộ lọc ngày
  html += `<div style="display:flex;gap:6px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
    <span style="font-size:11px;color:#6B7280;font-weight:600">Từ</span>
    <input type="date" id="cra-tu" value="${_craTuNgay}" onchange="_craSetNgay()" style="flex:1;min-width:120px;padding:7px 8px;border:1px solid #D1D5DB;border-radius:7px;font-size:12px">
    <span style="font-size:11px;color:#6B7280;font-weight:600">đến</span>
    <input type="date" id="cra-den" value="${_craDenNgay}" onchange="_craSetNgay()" style="flex:1;min-width:120px;padding:7px 8px;border:1px solid #D1D5DB;border-radius:7px;font-size:12px">
    ${(_craTuNgay||_craDenNgay)?`<button onclick="_craResetNgay()" style="padding:7px 10px;border:1px solid #E5E7EB;background:#F9FAFB;border-radius:7px;font-size:11px;cursor:pointer;color:#6B7280">Xóa lọc</button>`:''}
  </div>`;

  if (!shown.length) { 
    bodyEl.innerHTML = html + '<div class="adm2-empty">Không có ca nào khớp bộ lọc.</div>';
    return;
  }

  const byDay = {};
  shown.forEach(r => { if (!byDay[r.ngay]) byDay[r.ngay]=[]; byDay[r.ngay].push(r); });
  const days = Object.keys(byDay).sort().reverse();

  html += days.map(ng => {
    const dt = new Date(ng + 'T00:00:00');
    const header = dow[dt.getDay()] + ', ' + pad(dt.getDate()) + '/' + pad(dt.getMonth()+1) + '/' + dt.getFullYear();
    const rows = byDay[ng].slice().sort((a,b) => {
      const aBS = boSungMap[a.ma_nv+'_'+a.ngay] ? 1 : 0;
      const bBS = boSungMap[b.ma_nv+'_'+b.ngay] ? 1 : 0;
      return aBS - bBS;
    }).map(r => {
      const gioVao = r.thoi_gian ? new Date(r.thoi_gian).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh' }) : '--';
      const bsThoiGian = boSungMap[r.ma_nv + '_' + r.ngay];
      const daBS = !!bsThoiGian;
      const gioRa = daBS ? new Date(bsThoiGian).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh' }) : '';
      const badge = daBS
        ? `<span style="font-size:10.5px;font-weight:700;color:#047857;background:#D1FAE5;padding:3px 9px;border-radius:99px;white-space:nowrap">✓ Đã bổ sung ${gioRa}</span>`
        : `<span style="font-size:10.5px;font-weight:700;color:#B45309;background:#FEF3C7;padding:3px 9px;border-radius:99px;white-space:nowrap">Chưa bổ sung</span>`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #F1F5F9">
        ${_renderAvatar(r.ma_nv, r.ten_nv_snapshot || r.ma_nv, 32)}
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#0F172A">${adm2Esc(r.ten_nv_snapshot || r.ma_nv)} <span style="font-size:11px;font-weight:400;color:#94A3B8">${r.ma_nv}</span></div>
          <div style="font-size:11.5px;color:#64748B">${r.ten_ch_snapshot ? _fmtChVoiDoiSale(r.ma_nv, r.ten_ch_snapshot, r.ngay) : adm2Esc(r.ma_ch || '')} · Vào ${gioVao}</div>
        </div>
        ${badge}
      </div>`;
    }).join('');
    return `<div style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:7px;padding:8px 4px;font-size:12.5px;font-weight:700;color:#0F172A">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span style="flex:1">${header}</span>
        <span style="font-size:11px;font-weight:600;color:#64748B">${byDay[ng].length} ca</span>
      </div>
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden">${rows}</div>
    </div>`;
  }).join('');
  bodyEl.innerHTML = html;
}


// ════════════════════════════════════════════════════════════════════
// [v10.85] SETTINGS PANEL — Admin cài đặt hệ thống
// ════════════════════════════════════════════════════════════════════
const SETTINGS_SCHEMA = [
  { group: 'cham_cong', title: '⏱ Chấm công', items: [
    { key:'cc.fresh_seconds',         label:'Thời gian hiệu lực GPS/ảnh (giây)', type:'number', min:15, max:300 },
    { key:'cc.gps_radius_m',          label:'Bán kính GPS hợp lệ (m)', type:'number', min:30, max:500 },
    { key:'cc.gps_weak_threshold_m',  label:'Ngưỡng cảnh báo GPS yếu (m)', type:'number', min:30, max:500 },
    { key:'cc.bo_sung_lui_days',      label:'Cho phép bổ sung ca lùi N ngày', type:'number', min:0, max:7, hint:'0=chỉ hôm nay, 1=+hôm qua, ...' },
    { key:'cc.bo_sung_quota_thang',   label:'Quota bổ sung ca/tháng/NV', type:'number', min:0, max:30 },
    { key:'cc.bo_sung_chan_gio',      label:'Giờ chặn bổ sung ca hôm nay (0-23)', type:'number', min:0, max:23 },
    { key:'cc.auto_close_gio',        label:'Giờ auto-close ca treo (0-23 VN)', type:'number', min:0, max:23, hint:'Cần update cron job tương ứng' },
    { key:'cc.nhac_chamcong_bat',     label:'Bật nhắc chấm công', type:'bool' },
    { key:'cc.nhac_chamcong_gio',     label:'Giờ nhắc chấm công (HH:MM)', type:'text' },
  ]},
  { group: 'lich_ca', title: '📅 Lịch ca', items: [
    { key:'lc.cho_phep_tuan_hien_tai', label:'Cho phép NV gửi/sửa lịch tuần hiện tại', type:'bool',
      hint:'Bật: NV gửi trực tiếp tuần hiện tại, ẩn nút "Xin đổi lịch". Tắt: chỉ cho nghỉ phép đột xuất, hiện nút "Xin đổi lịch".' },
  ]},
  { group: 'nghi_phep', title: '🏥 Nghỉ phép', items: [
    { key:'np.bat_buoc_anh',          label:'Bắt buộc ảnh đính kèm', type:'bool' },
    { key:'np.toi_thieu_truoc_ngay',  label:'Xin nghỉ trước tối thiểu (ngày)', type:'number', min:0, max:30 },
  ]},
  { group: 'duyet', title: '✅ Thông báo & Duyệt', items: [
    { key:'duyet.auto_gps_yeu_m',     label:'Auto-duyệt GPS yếu ≤ N m (0=tắt)', type:'number', min:0, max:1000 },
    { key:'duyet.auto_bo_sung_cung_ch', label:'Auto-duyệt bổ sung ca cùng CH', type:'bool' },
    { key:'duyet.gui_tb_qlns_bo_sung',  label:'Gửi thông báo QLNS khi NV bổ sung ca', type:'bool' },
  ]},
  { group: 'giao_dien', title: '🎨 Giao diện & Vận hành', items: [
    { key:'lichhd.enabled',           label:'Bật tính năng Lịch hoạt động cửa hàng', type:'bool' },
    { key:'ui.nv_xem_bxh',            label:'Cho NV xem BXH bán hàng', type:'bool' },
    { key:'ui.bxh_top_n',             label:'Số NV trong BXH', type:'number', min:5, max:50 },
    { key:'ui.persistent_login',      label:'Persistent login (nhớ đăng nhập)', type:'bool' },
    { key:'ui.session_expire_days',   label:'Session hết hạn sau (ngày)', type:'number', min:1, max:90 },
  ]},
  { group: 'he_thong', title: '🔧 Quản trị hệ thống', items: [
    { key:'sys.maintenance_mode',     label:'Chế độ bảo trì (chặn chấm công)', type:'bool', warn:true },
    { key:'sys.maintenance_message',  label:'Thông điệp bảo trì', type:'text' },
  ]},
  { group: 'checklist', title: '📋 Kiểm tra cửa hàng', items: [
    { key:'chk.bat',                  label:'Bật tính năng Kiểm tra cửa hàng', type:'bool' },
    { key:'chk.nhac_bat',             label:'Bật nhắc cửa hàng chưa gửi checklist', type:'bool' },
    { key:'chk.gio_nhac',             label:'Giờ nhắc hoàn thành checklist (HH:MM)', type:'text' },
    { key:'chk.bat_buoc_anh_khan_cap',label:'Bắt buộc ảnh cho sự cố Khẩn cấp', type:'bool' },
    { key:'chk.tb_quanly',            label:'Gửi thông báo QLNS/Admin khi có vấn đề', type:'bool' },
  ]},
];

let _settingsLoading = false;

async function adm2DetailSettings(bodyEl){
  // [v10.85] Mở settings dạng FULL-SCREEN PAGE, không render trong adm2-detail-body
  // Đóng panel detail (chỉ là dummy bodyEl cho callback)
  if (typeof adm2CloseDetail === 'function') { try { adm2CloseDetail(); } catch(e){} }
  if (_settingsLoading) return;
  _settingsLoading = true;
  try {
    await _loadAllSettings();
    _settingsOpenPage();
  } catch(e){
    showToast('Lỗi: ' + e.message, 'warn');
  } finally { _settingsLoading = false; }
}

let _settingsActiveGroup = 'cham_cong';
let _settingsSearchQ = '';

const SETTINGS_GROUP_META = {
  cham_cong:  { icon:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', accent:'#0F6E56', tint:'#ECFDF5' },
  nghi_phep:  { icon:'<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>', accent:'#BE185D', tint:'#FDF2F8' },
  duyet:      { icon:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>', accent:'#D97706', tint:'#FFFBEB' },
  giao_dien:  { icon:'<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>', accent:'#0F766E', tint:'#F0FDFA' },
  he_thong:   { icon:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>', accent:'#DC2626', tint:'#FEF2F2' },
  hanh_dong:  { icon:'<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>', accent:'#0EA5E9', tint:'#F0F9FF' },
  checklist:  { icon:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', accent:'#0D9488', tint:'#F0FDFA' },
  lich_ca:    { icon:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="15" r="2" fill="currentColor"/>', accent:'#1D4ED8', tint:'#EFF6FF' },
};

const SETTINGS_GROUP_LABELS = {
  cham_cong: 'Chấm công',
  lich_ca: 'Lịch ca',
  nghi_phep: 'Nghỉ phép',
  duyet: 'Thông báo & Duyệt',
  giao_dien: 'Giao diện',
  he_thong: 'Hệ thống',
  checklist: 'Kiểm tra CH',
  hanh_dong: 'Hành động',
};

function _settingsOpenPage(){
  let page = document.getElementById('settings-page');
  if (!page) {
    page = document.createElement('div');
    page.id = 'settings-page';
    page.className = 'settings-page';
    document.body.appendChild(page);
  }
  _settingsActiveGroup = _settingsActiveGroup || 'cham_cong';
  _settingsRenderPage();
  // Animate in
  requestAnimationFrame(()=> page.classList.add('open'));
}

function _settingsClosePage(){
  const page = document.getElementById('settings-page');
  if (!page) return;
  page.classList.remove('open');
  setTimeout(()=>{ try{ page.remove(); }catch(e){} }, 280);
}

function _settingsRenderPage(){
  const page = document.getElementById('settings-page');
  if (!page) return;

  // Tổng số setting để hiện trong subtitle
  const totalKeys = SETTINGS_SCHEMA.reduce((sum, g) => sum + g.items.length, 0);

  // Sidebar nav
  const navItems = SETTINGS_SCHEMA.map(g => {
    const meta = SETTINGS_GROUP_META[g.group] || {};
    const isActive = g.group === _settingsActiveGroup;
    return `<button class="set-nav-item ${isActive?'active':''}" onclick="_settingsSwitchGroup('${g.group}')" style="${isActive?'--accent:'+meta.accent+';--tint:'+meta.tint+';':''}">
      <span class="set-nav-icon" style="${isActive?'background:'+meta.tint+';color:'+meta.accent+';':''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${meta.icon||''}</svg>
      </span>
      <span class="set-nav-label">${SETTINGS_GROUP_LABELS[g.group] || g.title}</span>
      <span class="set-nav-count">${g.items.length}</span>
    </button>`;
  }).join('');

  // Mục Actions luôn ở cuối sidebar
  const actionMeta = SETTINGS_GROUP_META.hanh_dong;
  const navActions = `<button class="set-nav-item ${_settingsActiveGroup==='hanh_dong'?'active':''}" onclick="_settingsSwitchGroup('hanh_dong')" style="${_settingsActiveGroup==='hanh_dong'?'--accent:'+actionMeta.accent+';--tint:'+actionMeta.tint+';':''}">
    <span class="set-nav-icon" style="${_settingsActiveGroup==='hanh_dong'?'background:'+actionMeta.tint+';color:'+actionMeta.accent+';':''}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${actionMeta.icon}</svg>
    </span>
    <span class="set-nav-label">${SETTINGS_GROUP_LABELS.hanh_dong}</span>
  </button>`;

  // Content
  const contentHtml = (_settingsActiveGroup === 'hanh_dong')
    ? _settingsRenderActions()
    : _settingsRenderGroup(_settingsActiveGroup);

  page.innerHTML = `
    <div class="settings-page-inner">
      <header class="set-header">
        <div class="set-header-bg"></div>
        <div class="set-header-content">
          <button class="set-close-btn" onclick="_settingsClosePage()" aria-label="Đóng">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <div class="set-header-title-wrap">
            <h1 class="set-header-title">Cài đặt hệ thống</h1>
            <div class="set-header-sub">${totalKeys} tuỳ chọn</div>
          </div>
          <div class="set-header-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="set-search-input" type="text" placeholder="Tìm cài đặt..." value="${escHtml(_settingsSearchQ)}" oninput="_settingsOnSearch(this.value)">
          </div>
        </div>
      </header>

      <div class="set-body">
        <aside class="set-sidebar">
          <div class="set-sidebar-section-label">Cấu hình</div>
          ${navItems}
          <div class="set-sidebar-divider"></div>
          <div class="set-sidebar-section-label">Quản trị</div>
          ${navActions}
        </aside>

        <main class="set-content" id="set-content">
          ${contentHtml}
        </main>
      </div>
    </div>
  `;
}

function _settingsSwitchGroup(g){
  _settingsActiveGroup = g;
  _settingsSearchQ = '';
  _settingsRenderPage();
}

function _settingsOnSearch(q){
  _settingsSearchQ = q || '';
  const content = document.getElementById('set-content');
  if (!content) return;
  // Khi search → ưu tiên hiển thị kết quả search xuyên nhóm
  if (_settingsSearchQ.trim()) {
    content.innerHTML = _settingsRenderSearch(_settingsSearchQ.trim().toLowerCase());
  } else {
    content.innerHTML = _settingsActiveGroup === 'hanh_dong'
      ? _settingsRenderActions()
      : _settingsRenderGroup(_settingsActiveGroup);
  }
}

function _settingsRenderSearch(q){
  const matches = [];
  SETTINGS_SCHEMA.forEach(g => {
    g.items.forEach(item => {
      if (item.label.toLowerCase().includes(q) || item.key.toLowerCase().includes(q) || (item.hint||'').toLowerCase().includes(q)) {
        matches.push({ group: g.group, groupTitle: g.title, item });
      }
    });
  });
  if (!matches.length) {
    return `<div class="set-empty">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <div>Không tìm thấy cài đặt nào khớp "${escHtml(q)}"</div>
    </div>`;
  }
  return `<div class="set-section-title">Kết quả tìm kiếm <span class="set-section-badge">${matches.length}</span></div>
    <div class="set-cards">
      ${matches.map(m => {
        const cur = _getSetting(m.item.key, '');
        const meta = SETTINGS_GROUP_META[m.group] || {};
        return _settingsCardHtml(m.item, cur, meta, m.groupTitle);
      }).join('')}
    </div>`;
}

function _settingsRenderGroup(group){
  const grp = SETTINGS_SCHEMA.find(g => g.group === group);
  if (!grp) return '<div class="set-empty">Nhóm không tồn tại</div>';
  const meta = SETTINGS_GROUP_META[group] || {};
  return `
    <div class="set-cards">
      ${grp.items.map(item => {
        const cur = _getSetting(item.key, '');
        return _settingsCardHtml(item, cur, meta);
      }).join('')}
    </div>
  `;
}

function _settingsCardHtml(item, cur, meta, groupBadge){
  const key = item.key;
  const safeKey = key.replace(/\./g, '_');
  const defVal = window.APP_SETTINGS_DEFAULTS[key];
  const isDefault = (String(cur) === String(defVal));
  let inputHtml = '';
  if (item.type === 'bool') {
    const checked = (cur === true || cur === 'true') ? 'checked' : '';
    inputHtml = `<label class="set-switch">
      <input type="checkbox" id="set-inp-${safeKey}" ${checked} onchange="_setMarkDirty('${key}')">
      <span class="set-switch-track"></span>
    </label>`;
  } else if (item.type === 'number') {
    inputHtml = `<input type="number" id="set-inp-${safeKey}" value="${cur}" ${item.min!=null?'min="'+item.min+'"':''} ${item.max!=null?'max="'+item.max+'"':''} oninput="_setMarkDirty('${key}')" class="set-input set-input-num">`;
  } else {
    inputHtml = `<input type="text" id="set-inp-${safeKey}" value="${escHtml(String(cur))}" oninput="_setMarkDirty('${key}')" class="set-input">`;
  }
  const warnCls = item.warn ? 'is-warn' : '';
  const groupBadgeHtml = groupBadge
    ? `<span class="set-card-group-badge">${escHtml(groupBadge.replace(/^[^A-Za-zÀ-ỹ]+/, '').trim())}</span>`
    : '';
  const defLabel = defVal !== undefined ? `<span class="set-card-default">Mặc định: ${defVal}</span>` : '';
  return `<div class="set-card ${warnCls}" id="set-card-${safeKey}" style="--accent:${meta.accent||'#0F6E56'}" data-key="${escHtml(key)}" data-type="${item.type}">
    <div class="set-card-info">
      ${groupBadgeHtml}
      <div class="set-card-title">${escHtml(item.label)}</div>
      ${item.hint ? '<div class="set-card-hint">'+escHtml(item.hint)+'</div>' : ''}
      <div style="display:flex;align-items:center;gap:8px;margin-top:5px">
        <code class="set-card-key">${escHtml(item.key)}</code>
        ${defLabel}
      </div>
    </div>
    <div class="set-card-right">
      <div class="set-card-control">${inputHtml}</div>
      <div class="set-card-actions">
        <button class="set-btn-save" id="set-save-${safeKey}" onclick="_setSave('${key}')" disabled>Kích hoạt</button>
        <button class="set-btn-reset" id="set-reset-${safeKey}" onclick="_setReset('${key}')" ${isDefault?'disabled':''}>Mặc định</button>
      </div>
    </div>
  </div>`;
}

// [v10.85] Đánh dấu card "dirty" — bật nút Kích hoạt
function _setMarkDirty(key){
  const safeKey = key.replace(/\./g, '_');
  const btn = document.getElementById('set-save-' + safeKey);
  const card = document.getElementById('set-card-' + safeKey);
  if (btn) { btn.disabled = false; btn.classList.add('is-dirty'); }
  if (card) card.classList.add('is-dirty');
}

// [v10.85] Lưu setting khi bấm "Kích hoạt"
async function _setSave(key){
  const safeKey = key.replace(/\./g, '_');
  const card = document.getElementById('set-card-' + safeKey);
  const inp = document.getElementById('set-inp-' + safeKey);
  const btn = document.getElementById('set-save-' + safeKey);
  const resetBtn = document.getElementById('set-reset-' + safeKey);
  if (!inp) return;
  const type = card ? card.getAttribute('data-type') : 'text';
  let value;
  if (type === 'bool') value = inp.checked;
  else if (type === 'number') value = Number(inp.value);
  else value = String(inp.value);

  if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }
  try {
    const { data, error } = await supa.rpc('fn_admin_set_setting', {
      p_admin: SESSION.ma, p_key: key, p_value: value
    });
    if (error || !data || !data.success) {
      showToast('⚠ ' + ((data && data.error) || (error && error.message) || 'Lỗi'), 'warn');
      if (btn) { btn.disabled = false; btn.textContent = 'Kích hoạt'; }
      return;
    }
    window.APP_SETTINGS[key] = value;
    try { sessionStorage.setItem('_app_settings', JSON.stringify(window.APP_SETTINGS)); } catch(e){}
    _applySettingsToRuntime();
    showToast('✓ Đã kích hoạt: ' + key, 'ok');
    if (btn) { btn.textContent = 'Kích hoạt'; btn.classList.remove('is-dirty'); }
    if (card) card.classList.remove('is-dirty');
    // Cập nhật nút Mặc định
    const defVal = window.APP_SETTINGS_DEFAULTS[key];
    if (resetBtn) resetBtn.disabled = (String(value) === String(defVal));
  } catch(e) {
    showToast('⚠ ' + e.message, 'warn');
    if (btn) { btn.disabled = false; btn.textContent = 'Kích hoạt'; }
  }
}

// [v10.85] Quay về mặc định
async function _setReset(key){
  const defVal = window.APP_SETTINGS_DEFAULTS[key];
  if (defVal === undefined) { showToast('Không có giá trị mặc định', 'warn'); return; }
  const safeKey = key.replace(/\./g, '_');
  const inp = document.getElementById('set-inp-' + safeKey);
  const card = document.getElementById('set-card-' + safeKey);
  const type = card ? card.getAttribute('data-type') : 'text';
  if (inp) {
    if (type === 'bool') inp.checked = (defVal === true || defVal === 'true');
    else inp.value = defVal;
  }
  _setMarkDirty(key);
  // Auto-save luôn khi reset mặc định
  await _setSave(key);
}

function _settingsRenderActions(){
  const actions = [
    { key:'logout',   title:'Force logout toàn bộ user', desc:'Đẩy tất cả user ra ngoài, buộc đăng nhập lại', color:'#DC2626', tint:'#FEF2F2', danger:true,
      icon:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
      onclick:'settingsForceLogoutAll(this)' },
    { key:'cache',    title:'Bump cache version', desc:'Buộc browser của mọi user xoá cache, tải lại bản mới nhất', color:'#0EA5E9', tint:'#F0F9FF',
      icon:'<polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>',
      onclick:'settingsBumpCacheVersion(this)' },
    { key:'cron',     title:'Áp dụng giờ auto-close mới', desc:'Reschedule cron job theo cài đặt cc.auto_close_gio', color:'#0F766E', tint:'#F0FDFA',
      icon:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      onclick:'settingsRescheduleAutoClose(this)' },
    { key:'quota',    title:'Reset quota bổ sung ca', desc:'Đặt lại số lần bổ sung ca cho 1 NV trong tháng', color:'#D97706', tint:'#FFFBEB',
      icon:'<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
      onclick:'settingsResetQuotaModal(this)' },
    { key:'sync',     title:'Đồng bộ NV/CH từ Sheet', desc:'Kéo lại danh sách nhân viên và cửa hàng từ Google Sheet', color:'#0F6E56', tint:'#ECFDF5',
      icon:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
      onclick:'settingsSyncDanhSach(this)' },
    { key:'cc_csv',   title:'Tải xuống Excel — Chấm công', desc:'Xuất file Excel (.xlsx) chấm công theo tháng', color:'#0F6E56', tint:'#ECFDF5',
      icon:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
      onclick:'settingsDownloadCCExcel(this)' },
    { key:'bh_csv',   title:'Tải xuống Excel — Bán hàng', desc:'Xuất file Excel (.xlsx) phiên bán hàng theo tháng', color:'#BE185D', tint:'#FDF2F8',
      icon:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
      onclick:'settingsDownloadBHExcel(this)' },
    { key:'audit',    title:'Audit log thao tác admin', desc:'Xem lịch sử các thay đổi trong hệ thống', color:'#475569', tint:'#F1F5F9',
      icon:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
      onclick:'settingsViewAuditLog(this)' },
  ];
  const actionMeta = SETTINGS_GROUP_META.hanh_dong;
  return `
    <div class="set-actions-grid">
      ${actions.map(a => `
        <button class="set-action-card ${a.danger?'is-danger':''}" onclick="${a.onclick}" style="--accent:${a.color};--tint:${a.tint}">
          <div class="set-action-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${a.icon}</svg>
          </div>
          <div class="set-action-text">
            <div class="set-action-title">${a.title}</div>
            <div class="set-action-desc">${a.desc}</div>
          </div>
          <svg class="set-action-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      `).join('')}
    </div>
  `;
}

async function settingsSaveItem(key, rawValue, type){
  let value;
  if (type === 'bool') value = !!rawValue;
  else if (type === 'number') value = Number(rawValue);
  else value = String(rawValue);
  try {
    const { data, error } = await supa.rpc('fn_admin_set_setting', {
      p_admin: SESSION.ma, p_key: key, p_value: value
    });
    if (error || !data || !data.success) {
      showToast('⚠ ' + ((data && data.error) || (error && error.message) || 'Lỗi lưu'), 'warn');
      return;
    }
    // Update local cache
    window.APP_SETTINGS[key] = value;
    try { sessionStorage.setItem('_app_settings', JSON.stringify(window.APP_SETTINGS)); } catch(e){}
    _applySettingsToRuntime();
    showToast('✓ Đã lưu', 'ok');
  } catch(e) { showToast('⚠ ' + e.message, 'warn'); }
}

// [v10.85] Helper: hiện loading state trên 1 action card
function _setActionBusy(btn, busy, busyText){
  if (!btn) return;
  if (busy) {
    btn._origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';
    btn.innerHTML = `<div class="set-action-icon"><svg class="set-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg></div>
      <div class="set-action-text"><div class="set-action-title">${busyText || 'Đang xử lý...'}</div><div class="set-action-desc">Vui lòng đợi</div></div>`;
  } else {
    if (btn._origHtml) btn.innerHTML = btn._origHtml;
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
  }
}

async function settingsForceLogoutAll(btn){
  const ok = await appConfirm('Force logout TẤT CẢ user (kể cả bạn)?\nMọi user sẽ phải đăng nhập lại.', { title:'Force logout', okLabel:'Xác nhận', danger:true });
  if (!ok) return;
  _setActionBusy(btn, true, 'Đang force logout...');
  try {
    const { data, error } = await supa.rpc('fn_admin_force_logout_all', { p_admin: SESSION.ma });
    if (error || !data || !data.success) {
      _setActionBusy(btn, false);
      showToast('⚠ ' + ((data && data.error) || (error && error.message)), 'warn');
      return;
    }
    showToast('✓ Đã force logout. Đang reload...', 'ok');
    setTimeout(()=>location.reload(), 1500);
  } catch(e) { _setActionBusy(btn, false); showToast('⚠ ' + e.message, 'warn'); }
}

async function settingsBumpCacheVersion(btn){
  const ok = await appConfirm('Bump cache version sẽ buộc mọi user clear cache trong lần load tiếp.\nTiếp tục?', { title:'Bump cache', okLabel:'Bump' });
  if (!ok) return;
  _setActionBusy(btn, true, 'Đang bump version...');
  const newVer = 'v' + Date.now();
  try {
    const { data, error } = await supa.rpc('fn_admin_set_setting', { p_admin: SESSION.ma, p_key: 'sys.cache_version', p_value: newVer });
    _setActionBusy(btn, false);
    if (error || !data || !data.success) {
      showToast('⚠ ' + ((data && data.error) || (error && error.message) || 'Lỗi'), 'warn');
      return;
    }
    showToast('✓ Đã bump → ' + newVer, 'ok');
  } catch(e) { _setActionBusy(btn, false); showToast('⚠ ' + e.message, 'warn'); }
}

async function settingsResetQuotaModal(btn){
  const maNV = prompt('Nhập mã NV cần reset quota bổ sung ca (tháng hiện tại):');
  if (!maNV) return;
  _setActionBusy(btn, true, 'Đang reset quota...');
  try {
    const { data, error } = await supa.rpc('fn_admin_reset_quota_bo_sung', {
      p_admin: SESSION.ma, p_ma_nv: maNV.trim(), p_thang: null
    });
    _setActionBusy(btn, false);
    if (error || !data || !data.success) {
      showToast('⚠ ' + ((data && data.error) || (error && error.message)), 'warn');
      return;
    }
    showToast('✓ Đã reset quota cho ' + maNV + ' tháng ' + data.thang, 'ok');
  } catch(e) { _setActionBusy(btn, false); showToast('⚠ ' + e.message, 'warn'); }
}

async function settingsRescheduleAutoClose(btn){
  const ok = await appConfirm('Áp dụng giờ auto-close mới? Cron job sẽ được tạo lại.', { title:'Reschedule', okLabel:'Áp dụng' });
  if (!ok) return;
  _setActionBusy(btn, true, 'Đang reschedule cron...');
  try {
    const { data, error } = await supa.rpc('fn_admin_reschedule_auto_close', { p_admin: SESSION.ma });
    _setActionBusy(btn, false);
    if (error || !data || !data.success) {
      showToast('⚠ ' + ((data && data.error) || (error && error.message)), 'warn');
      return;
    }
    showToast('✓ Đã reschedule: ' + data.cron + ' (giờ VN ' + data.gio_vn + 'h)', 'ok');
  } catch(e) { _setActionBusy(btn, false); showToast('⚠ ' + e.message, 'warn'); }
}

async function settingsSyncDanhSach(btn){
  const ok = await appConfirm('Đồng bộ danh sách NV và CH từ Google Sheet?\n(Có thể mất 30-60 giây)', { title:'Đồng bộ', okLabel:'Đồng bộ' });
  if (!ok) return;
  _setActionBusy(btn, true, 'Đang đồng bộ Sheet...');
  try {
    const url = SCRIPT_URL + '?action=dongBoToanBo&maNV=' + encodeURIComponent(SESSION.ma);
    const res = await fetch(url);
    const txt = await res.text();
    let data; try { data = JSON.parse(txt); } catch(e) { data = { success: false, error: 'Phản hồi không hợp lệ' }; }
    _setActionBusy(btn, false);
    if (data && data.success) {
      showToast('✓ Đồng bộ xong', 'ok');
    } else {
      showToast('⚠ ' + (data.error || 'Đồng bộ lỗi'), 'warn');
    }
  } catch(e) { _setActionBusy(btn, false); showToast('⚠ ' + e.message, 'warn'); }
}

function _csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function _csvDownload(filename, rows) {
  // Add BOM cho Excel hiểu UTF-8
  const csv = '\uFEFF' + rows.map(r => r.map(_csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

// [v10.85] Lazy-load SheetJS để xuất XLSX thật (không phải CSV)
function _loadSheetJS(){
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (window._xlsxLoading) return window._xlsxLoading;
  window._xlsxLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Không tải được thư viện Excel'));
    document.head.appendChild(s);
  });
  return window._xlsxLoading;
}

async function _xlsxDownload(filename, sheetName, rows){
  const XLSX = await _loadSheetJS();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Set column width tự động
  if (rows.length) {
    const cols = rows[0].map((_, ci) => {
      let max = 8;
      rows.forEach(r => { const v = r[ci] != null ? String(r[ci]) : ''; if (v.length > max) max = v.length; });
      return { wch: Math.min(max + 2, 40) };
    });
    ws['!cols'] = cols;
  }
  // Style header (bold)
  if (rows[0]) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let c = range.s.c; c <= range.e.c; c++){
      const addr = XLSX.utils.encode_cell({ r:0, c });
      if (ws[addr]) ws[addr].s = { font: { bold: true } };
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
  XLSX.writeFile(wb, filename);
}

async function settingsDownloadCCExcel(btn){
  const thang = prompt('Nhập tháng (YYYY-MM, để trống = tháng hiện tại):', '');
  let yyyyMm = thang ? thang.trim() : null;
  if (!yyyyMm) {
    const d = new Date();
    yyyyMm = d.getFullYear() + '-' + pad(d.getMonth()+1);
  }
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) { showToast('Định dạng tháng sai (YYYY-MM)','warn'); return; }
  _setActionBusy(btn, true, 'Đang tải dữ liệu...');
  try {
    const startD = yyyyMm + '-01';
    const [y, m] = yyyyMm.split('-').map(Number);
    const endD = new Date(y, m, 0); // ngày cuối tháng
    const endStr = y + '-' + pad(m) + '-' + pad(endD.getDate());
    // Pagination 1000 rows
    let all = []; let offset = 0;
    while (true) {
      const { data, error } = await supa.from('cham_cong')
        .select('ngay, ma_nv, ten_nv_snapshot, ma_ch, ten_ch_snapshot, loai, thoi_gian, xac_nhan, trang_thai_o, gps_accuracy, nguon, ghi_chu')
        .gte('ngay', startD).lte('ngay', endStr)
        .order('ngay', { ascending: false }).order('thoi_gian')
        .range(offset, offset + 999);
      if (error) { _setActionBusy(btn, false); showToast('⚠ ' + error.message, 'warn'); return; }
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
      if (offset > 50000) break; // safety
    }
    if (!all.length) { _setActionBusy(btn, false); showToast('Không có dữ liệu tháng này', 'warn'); return; }
    const rows = [['Ngày', 'Mã NV', 'Tên NV', 'Mã CH', 'Tên CH', 'Loại', 'Thời gian', 'Xác nhận', 'Trạng thái', 'GPS acc(m)', 'Nguồn', 'Ghi chú']];
    all.forEach(r => rows.push([
      r.ngay, r.ma_nv, r.ten_nv_snapshot||'', r.ma_ch||'', r.ten_ch_snapshot||'',
      r.loai||'', r.thoi_gian||'', r.xac_nhan||'', r.trang_thai_o||'',
      r.gps_accuracy||'', r.nguon||'', r.ghi_chu||''
    ]));
    await _xlsxDownload('cham_cong_' + yyyyMm + '.xlsx', 'Chấm công ' + yyyyMm, rows);
    _setActionBusy(btn, false);
    showToast('✓ Đã tải ' + all.length + ' dòng', 'ok');
  } catch(e) { _setActionBusy(btn, false); showToast('⚠ ' + e.message, 'warn'); }
}

async function settingsDownloadBHExcel(btn){
  const thang = prompt('Nhập tháng (YYYY-MM, để trống = tháng hiện tại):', '');
  let yyyyMm = thang ? thang.trim() : null;
  if (!yyyyMm) {
    const d = new Date();
    yyyyMm = d.getFullYear() + '-' + pad(d.getMonth()+1);
  }
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) { showToast('Định dạng tháng sai (YYYY-MM)','warn'); return; }
  _setActionBusy(btn, true, 'Đang tải dữ liệu...');
  try {
    const startD = yyyyMm + '-01';
    const [y, m] = yyyyMm.split('-').map(Number);
    const endD = new Date(y, m, 0);
    const endStr = y + '-' + pad(m) + '-' + pad(endD.getDate());
    let all = []; let offset = 0;
    while (true) {
      const { data, error } = await supa.from('phien_ban_hang')
        .select('ngay, ma_ch, ten_ch_snapshot, khu_vuc, ma_nv, ten_nv_snapshot, gio_mo, gio_dong, trang_thai, ket_qua, ly_do_khong_mua, thoi_luong_phut, tong_gia_tri, sp_quan_tam_text, sp_da_mua_text, ghi_chu')
        .gte('ngay', startD).lte('ngay', endStr)
        .order('ngay', { ascending: false }).order('gio_mo')
        .range(offset, offset + 999);
      if (error) { _setActionBusy(btn, false); showToast('⚠ ' + error.message, 'warn'); return; }
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
      if (offset > 50000) break;
    }
    if (!all.length) { _setActionBusy(btn, false); showToast('Không có dữ liệu tháng này', 'warn'); return; }
    const rows = [['Ngày', 'Mã CH', 'Tên CH', 'Khu vực', 'Mã NV', 'Tên NV', 'Giờ mở', 'Giờ đóng', 'Trạng thái', 'Kết quả', 'Lý do không mua', 'Phút', 'SP quan tâm', 'SP đã mua', 'Ghi chú']];
    all.forEach(r => rows.push([
      r.ngay, r.ma_ch, r.ten_ch_snapshot||'', r.khu_vuc||'',
      r.ma_nv||'', r.ten_nv_snapshot||'', r.gio_mo||'', r.gio_dong||'',
      r.trang_thai||'', r.ket_qua||'', r.ly_do_khong_mua||'',
      r.thoi_luong_phut||'', r.sp_quan_tam_text||'', r.sp_da_mua_text||'', r.ghi_chu||''
    ]));
    await _xlsxDownload('ban_hang_' + yyyyMm + '.xlsx', 'Bán hàng ' + yyyyMm, rows);
    _setActionBusy(btn, false);
    showToast('✓ Đã tải ' + all.length + ' dòng', 'ok');
  } catch(e) { _setActionBusy(btn, false); showToast('⚠ ' + e.message, 'warn'); }
}

async function settingsViewAuditLog(btn){
  _setActionBusy(btn, true, 'Đang tải log...');
  try {
    const { data, error } = await supa.rpc('fn_admin_get_audit_log', { p_admin: SESSION.ma, p_limit: 100 });
    _setActionBusy(btn, false);
    if (error || !data || !data.success) {
      showToast('⚠ ' + ((data && data.error) || (error && error.message)), 'warn');
      return;
    }
    const list = data.data || [];
    const html = `<div style="max-height:70vh;overflow-y:auto">
      ${list.length === 0 ? '<div class="adm2-empty">Chưa có log</div>' :
        list.map(l => {
          const t = new Date(l.thoi_gian).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
          const old = l.gia_tri_cu ? JSON.stringify(l.gia_tri_cu) : '';
          const moi = l.gia_tri_moi ? JSON.stringify(l.gia_tri_moi) : '';
          return `<div style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:12px">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <strong style="color:#1D4ED8">${escHtml(l.hanh_dong)}</strong>
              <span style="color:#94A3B8;font-size:11px">${t}</span>
            </div>
            <div style="color:#475569">${escHtml(l.nguoi||'')} → <strong>${escHtml(l.doi_tuong||'')}</strong></div>
            ${old ? '<div style="font-size:11px;color:#94A3B8;margin-top:3px">Cũ: <code>'+escHtml(old)+'</code></div>' : ''}
            ${moi ? '<div style="font-size:11px;color:#059669;margin-top:1px">Mới: <code>'+escHtml(moi)+'</code></div>' : ''}
            ${l.ghi_chu ? '<div style="font-size:11px;color:#64748B;margin-top:3px">'+escHtml(l.ghi_chu)+'</div>' : ''}
          </div>`;
        }).join('')
      }
    </div>`;
    // Mở modal đơn giản
    let modal = document.getElementById('audit-log-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'audit-log-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
      modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div style="background:#fff;border-radius:14px;max-width:600px;width:100%;max-height:85vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:14px 18px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center"><strong style="flex:1">Audit log thao tác admin</strong><button onclick="document.getElementById('audit-log-modal').style.display='none'" style="background:none;border:none;font-size:22px;cursor:pointer;color:#64748B">×</button></div>
      <div style="flex:1;overflow-y:auto">${html}</div>
    </div>`;
    modal.style.display = 'flex';
  } catch(e) { _setActionBusy(btn, false); showToast('⚠ ' + e.message, 'warn'); }
}

function adm2RenderAccRows(list, bodyEl) {
  if (!list.length) { bodyEl.innerHTML = '<div class="adm2-empty">Không có dữ liệu</div>'; return; }
  bodyEl.innerHTML = list.map(a => adm2AccRowHtml(a)).join('');
}

function adm2AccRowHtml(a) {
  const cls = a.loai.toLowerCase();
  const stCls = String(a.trang_thai||'').toUpperCase()==='ACTIVE' ? 'active' : 'inactive';
  const pwHtml = a.mat_khau_plain
    ? `<span class="adm2-pw">${adm2Esc(a.mat_khau_plain)}</span>`
    : (a.da_doi_mk
        ? `<span class="adm2-pw warn">Đã đổi · không lưu</span>`
        : `<span class="adm2-pw">Ns280396 (mặc định)</span>`);
  const canRole = a.loai !== 'CH';
  return `
    <div class="adm2-row">
      <div class="adm2-row-main">
        <div class="adm2-row-title">
          <span class="adm2-badge ${cls}">${a.loai}</span>
          ${adm2Esc(a.ma)} · ${adm2Esc(a.ten)}
        </div>
        <div class="adm2-row-sub">
          <span class="adm2-badge role">${adm2Esc(a.vai_tro)}</span>
          <span class="adm2-badge ${stCls}">${adm2Esc(a.trang_thai)}</span>
          ${a.khu_vuc ? ' · ' + adm2Esc(a.khu_vuc) : ''}
          ${a.cua_hang && a.loai==='NV' ? ' · ' + adm2Esc(a.cua_hang) : ''}
          ${a.so_dien_thoai ? ' · ' + adm2Esc(a.so_dien_thoai) : ''}
        </div>
        ${pwHtml}
      </div>
      <div class="adm2-row-actions">
        <button class="adm2-btn adm2-btn-secondary adm2-btn-sm" onclick="adm2ActSetPw('${a.loai}','${adm2Esc(a.ma)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Đặt MK
        </button>
        <button class="adm2-btn adm2-btn-warn adm2-btn-sm" onclick="adm2ActResetPw('${a.loai}','${adm2Esc(a.ma)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Reset
        </button>
        ${canRole ? `<button class="adm2-btn adm2-btn-secondary adm2-btn-sm" onclick="adm2ActSetRole('${a.loai}','${adm2Esc(a.ma)}','${adm2Esc(a.vai_tro)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Vai trò
        </button>` : ''}
        <button class="adm2-btn adm2-btn-secondary adm2-btn-sm" onclick="adm2ActSetStatus('${a.loai}','${adm2Esc(a.ma)}','${adm2Esc(a.trang_thai)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Trạng thái
        </button>
      </div>
    </div>
  `;
}

// Detail: chấm công hôm nay
async function adm2DetailCCHomNay(bodyEl) {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const iso = today.toISOString();
    // [v10.85] Select thêm ngay, ghi_chu, device_info để detect đội sale
    const { data, error } = await supa.from('cham_cong')
      .select('id, thoi_gian, ngay, ma_nv, ten_nv_snapshot, ma_ch, ten_ch_snapshot, loai, xac_nhan, ghi_chu, device_info')
      .gte('thoi_gian', iso).order('thoi_gian', { ascending:false }).limit(200);
    if (error) throw error;
    if (!data.length) { bodyEl.innerHTML = '<div class="adm2-empty">Chưa có chấm công nào hôm nay</div>'; return; }
    // [v10.85] Build doiMap từ chính data hôm nay
    window._doiSaleMap = _buildDoiSaleMap(data);
    const loaiMap = { VAO_CA:'Vào ca', RA_CA:'Ra ca', RA_GIUA_CA:'Ra giữa ca', VAO_GIUA_CA:'Vào giữa ca' };
    bodyEl.innerHTML = data.map(r => `
      <div class="adm2-row">
        <div class="adm2-row-main">
          <div class="adm2-row-title">${adm2Esc(r.ten_nv_snapshot || r.ma_nv)} <span class="adm2-row-sub" style="font-weight:400">· ${adm2Esc(loaiMap[r.loai] || r.loai)}</span></div>
          <div class="adm2-row-sub">${adm2FmtTime(r.thoi_gian)} · ${r.ten_ch_snapshot ? _fmtChVoiDoiSale(r.ma_nv, r.ten_ch_snapshot, r.ngay) : adm2Esc(r.ma_ch || '')}</div>
        </div>
      </div>
    `).join('');
  } catch (e) { bodyEl.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: '+adm2Esc(e.message)+'</div>'; }
}

// Detail: cảnh báo chưa duyệt
// [v9.45] State filter cho admin detail
let _adm2CbFilter = 'CHO_DUYET'; // CHO_DUYET | DA_DUYET | TU_CHOI | ALL
let _adm2DnFilter = 'CHO_DUYET';

async function adm2DetailCanhBao(bodyEl) {
  // Wrap bodyEl với tab filter
  bodyEl.innerHTML = `
    <div style="display:flex;gap:4px;margin-bottom:10px;padding:4px;background:#F3F4F6;border-radius:8px">
      <button class="adm2-cb-tab" data-cb-filter="CHO_DUYET" onclick="adm2SetCBFilter('CHO_DUYET')" style="flex:1;padding:6px 10px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;background:#F59E0B;color:white">Chờ duyệt</button>
      <button class="adm2-cb-tab" data-cb-filter="DA_DUYET" onclick="adm2SetCBFilter('DA_DUYET')" style="flex:1;padding:6px 10px;border:none;border-radius:6px;font-size:12px;cursor:pointer;background:transparent;color:#6B7280">Đã duyệt</button>
      <button class="adm2-cb-tab" data-cb-filter="TU_CHOI" onclick="adm2SetCBFilter('TU_CHOI')" style="flex:1;padding:6px 10px;border:none;border-radius:6px;font-size:12px;cursor:pointer;background:transparent;color:#6B7280">Từ chối</button>
      <button class="adm2-cb-tab" data-cb-filter="ALL" onclick="adm2SetCBFilter('ALL')" style="flex:1;padding:6px 10px;border:none;border-radius:6px;font-size:12px;cursor:pointer;background:transparent;color:#6B7280">Tất cả</button>
    </div>
    <div id="adm2-cb-listbody"><div class="adm2-empty">⏳ Đang tải...</div></div>
  `;
  await adm2LoadCBList();
}

function adm2SetCBFilter(filter){
  _adm2CbFilter = filter;
  document.querySelectorAll('.adm2-cb-tab').forEach(b=>{
    const active = b.dataset.cbFilter === filter;
    b.style.background = active ? '#F59E0B' : 'transparent';
    b.style.color = active ? 'white' : '#6B7280';
  });
  adm2LoadCBList();
}

async function adm2LoadCBList(){
  const el = document.getElementById('adm2-cb-listbody');
  if(!el) return;
  el.innerHTML = '<div class="adm2-empty">⏳ Đang tải...</div>';
  try {
    // [v10.85] Đảm bảo NV list đã load để biết đội sale
    if (typeof _lsdNVList !== 'undefined' && !_lsdNVList && typeof _lsdLoadNVList === 'function') {
      await _lsdLoadNVList().catch(()=>{});
    }
    let q = supa.from('canh_bao').select('id, ngay, gio_chamcong, ma_nv, ten_nv_snapshot, ma_ch, ten_ch_snapshot, loai_canh_bao, noi_dung, giai_trinh, trang_thai, nguoi_duyet, thoi_gian_duyet, ghi_chu_duyet');
    if (_adm2CbFilter === 'CHO_DUYET') q = q.in('trang_thai', ['DA_GIAI_TRINH','CHUA_GIAI_TRINH']);
    else if (_adm2CbFilter === 'DA_DUYET') q = q.eq('trang_thai', 'DA_DUYET');
    else if (_adm2CbFilter === 'TU_CHOI') q = q.eq('trang_thai', 'TU_CHOI');
    // ALL: không filter
    const { data, error } = await q.order('created_at', { ascending:false }).limit(200);
    if (error) throw error;
    if (!data.length) { el.innerHTML = '<div class="adm2-empty">Không có cảnh báo nào</div>'; return; }
    // [v10.85] Build map đội sale từ cham_cong supplement (canh_bao không có device_info)
    window._doiSaleMap = await _loadDoiSaleMapForRecords(data);
    el.innerHTML = data.map(r => {
      const isRequireFix = (r.loai_canh_bao === 'SAI CA' || r.loai_canh_bao === 'THIẾU CA');
      const badge = isRequireFix
        ? '<span style="display:inline-block;padding:2px 6px;background:#FEF3C7;color:#92400E;border-radius:4px;font-size:10px;font-weight:600;margin-left:4px">CẦN SỬA GIỜ</span>'
        : '';
      // Badge trạng thái
      let ttBadge = '';
      if (r.trang_thai === 'DA_DUYET') ttBadge = '<span style="background:#DCFCE7;color:#16A34A;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-left:6px">✓ ĐÃ DUYỆT</span>';
      else if (r.trang_thai === 'TU_CHOI') ttBadge = '<span style="background:#FEE2E2;color:#DC2626;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-left:6px">✗ TỪ CHỐI</span>';
      else ttBadge = '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-left:6px">⏳ CHỜ DUYỆT</span>';
      
      const isDuyetRoi = r.trang_thai === 'DA_DUYET' || r.trang_thai === 'TU_CHOI';
      // Admin có quyền sửa lại đơn đã xử lý
      const actions = `
        <button class="adm2-btn adm2-btn-secondary adm2-btn-sm" onclick="adm2OpenSuaLog('${r.ma_nv}','${r.ngay}','${r.id}')">✎ Sửa lịch</button>
        ${r.trang_thai !== 'DA_DUYET' ? `<button class="adm2-btn adm2-btn-primary adm2-btn-sm" onclick="adm2DuyetCanhBao('${r.id}','${r.loai_canh_bao}')">✓ Duyệt</button>` : ''}
        ${r.trang_thai !== 'TU_CHOI' ? `<button class="adm2-btn adm2-btn-sm" style="background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5" onclick="adm2TuChoiCanhBao('${r.id}')">✗ Từ chối</button>` : ''}
        ${isDuyetRoi ? `<button class="adm2-btn adm2-btn-sm" style="background:#F3F4F6;color:#374151;border:1px solid #D1D5DB" onclick="adm2RevertCanhBao('${r.id}')">↺ Đặt lại Chờ duyệt</button>` : ''}
      `;
      
      const noiDung = r.noi_dung ? `<div style="font-size:11px;color:#6B7280;margin-top:3px;line-height:1.4">${adm2Esc(r.noi_dung)}</div>` : '';
      const giaiTrinh = r.giai_trinh ? `<div style="background:#FFFBEB;border-left:3px solid #F59E0B;padding:6px 8px;margin-top:6px;border-radius:4px;font-size:11px;line-height:1.4"><strong style="color:#92400E">📝 GT:</strong> ${adm2Esc(r.giai_trinh)}</div>` : '';
      const ghiChu = r.ghi_chu_duyet ? `<div style="background:#F9FAFB;border-left:3px solid #94A3B8;padding:6px 8px;margin-top:6px;border-radius:4px;font-size:11px;line-height:1.4"><strong>💬 QLNS:</strong> ${adm2Esc(r.ghi_chu_duyet)}</div>` : '';
      const nguoiDuyet = r.nguoi_duyet ? `<div style="font-size:10px;color:#9CA3AF;margin-top:4px">Người duyệt: <strong>${adm2Esc(r.nguoi_duyet)}</strong> · ${r.thoi_gian_duyet ? adm2FmtTime(r.thoi_gian_duyet) : ''}</div>` : '';
      
      return `
      <div class="adm2-row" id="adm2-cb-${r.id}" style="flex-direction:column;align-items:stretch;padding:12px;border:1px solid #E5E7EB;border-radius:10px;background:white;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#0F172A">${adm2Esc(r.ten_nv_snapshot || r.ma_nv)} · <strong>${adm2Esc(r.loai_canh_bao || '')}</strong>${badge}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:2px">${adm2Esc(r.ngay)}${r.gio_chamcong ? ' · '+String(r.gio_chamcong).substring(0,5) : ''}${r.ten_ch_snapshot ? ' · ' + (typeof _fmtChVoiDoiSale === 'function' ? _fmtChVoiDoiSale(r.ma_nv, r.ten_ch_snapshot, r.ngay) : adm2Esc(r.ten_ch_snapshot)) : ''}</div>
            ${noiDung}
            ${giaiTrinh}
            ${ghiChu}
            ${nguoiDuyet}
          </div>
          ${ttBadge}
        </div>
        <div class="adm2-row-actions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${actions}</div>
      </div>
    `;}).join('');
  } catch (e) { el.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: '+adm2Esc(e.message)+'</div>'; }
}

// [v9.45] Đặt lại trạng thái Chờ duyệt cho CB đã DA_DUYET/TU_CHOI
async function adm2RevertCanhBao(id){
  if(!confirm('Đặt lại cảnh báo này về trạng thái Chờ duyệt?')) return;
  try {
    const { error } = await supa.from('canh_bao').update({
      trang_thai: 'DA_GIAI_TRINH',
      ghi_chu_duyet: '[Đã đặt lại bởi Admin lúc ' + new Date().toLocaleString('vi-VN') + ']'
    }).eq('id', id);
    if(error) throw error;
    adm2Toast('Đã đặt lại', 'success');
    adm2LoadCBList();
  } catch(e) { adm2Toast(e.message, 'error'); }
}

// [v14.6] Dựng lại bảng cặp giờ công cho NV+ngày sau khi sửa/thêm/xóa log hoặc duyệt CB.
// gio_cong_ngay_ch là bảng tính sẵn — nếu không gọi, giờ công KHÔNG cập nhật dù chấm công gốc đã đúng.
async function _rebuildCong(maNV, ngay) {
  if (!maNV || !ngay) return;
  try { await adm2Rpc('fn_tong_hop_ngay', { p_ma_nv: maNV, p_ngay: ngay }); }
  catch (e) { console.warn('[rebuild cong]', e); }
}

async function adm2DuyetCanhBao(id, loaiCb) {
  // [v10.85] SAI CA / THIẾU CA: tự động mở modal sửa lịch để user khỏi phải bấm nút khác
  const requireFix = (loaiCb === 'SAI CA' || loaiCb === 'THIẾU CA');
  if (requireFix) {
    // Tìm nút "Sửa lịch" trong card cùng id rồi click programatically
    const suaBtn = document.querySelector(`button[onclick*="adm2OpenSuaLog"][onclick*="'${id}'"]`);
    if (suaBtn) { suaBtn.click(); return; }
    adm2Toast('Lỗi "' + loaiCb + '" cần sửa giờ chấm công trước khi duyệt. Bấm nút "Sửa lịch" để chỉnh.', 'error');
    return;
  }
  try {
    const data = await adm2Rpc('fn_admin_duyet_cb_sau_sua', {
      p_admin: SESSION.ma, p_cb_id: id, p_da_sua_gio: false, p_ly_do: ''
    });
    if (data && data.success === false) { adm2Toast(data.error || 'Lỗi', 'error'); return; }
    // [v14.6] Dựng lại giờ công cho NV+ngày của cảnh báo này (để cộng giờ sau khi duyệt)
    const _rec = (window._lsdCachedList || []).find(r => r.id === id);
    if (_rec) await _rebuildCong(_rec.maNV || _rec.ma_nv, _rec.ngay);
    adm2Toast('Đã duyệt', 'success');
    // [v9.45] Reload list để cập nhật trạng thái
    if (typeof adm2LoadCBList === 'function' && document.getElementById('adm2-cb-listbody')) {
      adm2LoadCBList();
    } else if (typeof renderLSDList === 'function') {
      renderLSDList();  // [v10.85] Reload list Lịch sử duyệt trong tab Nhân sự
    } else {
      const row = document.getElementById('adm2-cb-' + id);
      if (row) row.remove();
    }
  } catch (e) { adm2Toast(e.message, 'error'); }
}

// [v9.45] Admin Từ chối cảnh báo (kèm modal nhập lý do)
async function adm2TuChoiCanhBao(id) {
  const lyDo = prompt('Lý do từ chối (bắt buộc):');
  if (!lyDo || !lyDo.trim()) { adm2Toast('Cần nhập lý do từ chối', 'error'); return; }
  try {
    const { data, error } = await supa.from('canh_bao').update({
      trang_thai: 'TU_CHOI',
      nguoi_duyet: SESSION.ma,
      thoi_gian_duyet: new Date().toISOString(),
      ghi_chu_duyet: lyDo.trim()
    }).eq('id', id);
    if (error) throw error;
    adm2Toast('Đã từ chối', 'success');
    // [v9.45] Reload
    if (typeof adm2LoadCBList === 'function' && document.getElementById('adm2-cb-listbody')) {
      adm2LoadCBList();
    } else {
      const row = document.getElementById('adm2-cb-' + id);
      if (row) row.remove();
    }
  } catch (e) { adm2Toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// [v6.1] MODAL: SỬA LỊCH CHẤM CÔNG
// ═══════════════════════════════════════════════════════════════
let _suaLogState = { maNV: null, ngay: null, cbId: null, daSuaGio: false };

// [v16.1] Nhận diện vị trí di động (Đội SALE + Cơ Động) cho form sửa lịch.
//   Ưu tiên hàm chuẩn _laViTriDiDong (js/core/02-system.js); fallback nếu chưa load.
function _slLaDiDong(tenCH, maCH){
  if (typeof _laViTriDiDong === 'function') return _laViTriDiDong(tenCH || '', maCH || '');
  const t = (tenCH || '').trim().toLowerCase();
  const m = (maCH || '').trim().toUpperCase();
  return m === 'CODONG'
    || t.startsWith('đội sale') || t.startsWith('doi sale')
    || t.startsWith('cơ động')  || t.startsWith('co dong');
}

async function adm2OpenSuaLog(maNV, ngay, cbId) {
  _suaLogState = { maNV, ngay, cbId, daSuaGio: false };
  let modal = document.getElementById('adm2-sua-log-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'adm2-sua-log-modal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:9999;align-items:flex-start;justify-content:center;overflow-y:auto;padding:20px';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:680px;width:100%;margin:20px auto;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #E5E7EB">
          <div>
            <div style="font-size:16px;font-weight:600;color:#111827" id="adm2-sua-log-title">Sửa lịch chấm công</div>
            <div style="font-size:12px;color:#6B7280;margin-top:2px" id="adm2-sua-log-sub">--</div>
          </div>
          <button class="adm2-btn adm2-btn-ghost" onclick="adm2CloseSuaLog()" style="padding:4px 8px">✕</button>
        </div>
        <div id="adm2-sua-log-body"><div class="adm2-empty">⏳ Đang tải...</div></div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  document.getElementById('adm2-sua-log-sub').textContent = maNV + ' · ' + ngay;
  adm2EnsureChDatalist();
  // [v10.85] Pre-load CH list để autocomplete trong row sửa hoạt động
  if (!window._bscChList || !window._bscChList.length) {
    try {
      const { data } = await supa.from('cua_hang')
        .select('ma_ch, ten_ch, khu_vuc')
        .eq('trang_thai', 'ĐANG HOẠT ĐỘNG')
        .order('khu_vuc').order('ten_ch');
      if (data) window._bscChList = data;
    } catch (e) {}
  }
  // [v10.85] Build doiMap cho NV+ngày này để sub title row log hiển thị "Đội SALE XX - CH thực"
  try {
    const { data: ccData } = await supa.from('cham_cong')
      .select('ma_nv, ngay, ten_ch_snapshot, ghi_chu, device_info')
      .eq('ma_nv', maNV).eq('ngay', ngay);
    window._doiSaleMap = _buildDoiSaleMap(ccData || []);
  } catch (e) {}
  await adm2LoadSuaLogBody();
}

function adm2CloseSuaLog() {
  const m = document.getElementById('adm2-sua-log-modal');
  if (m) m.style.display = 'none';
}

async function adm2LoadSuaLogBody() {
  const body = document.getElementById('adm2-sua-log-body');
  body.innerHTML = '<div class="adm2-empty">⏳ Đang tải...</div>';
  try {
    const d = await adm2Rpc('fn_admin_get_logs_ngay', { p_ma_nv: _suaLogState.maNV, p_ngay: _suaLogState.ngay });
    const logs = (d && d.logs) || [];
    const cbs  = (d && d.cb)   || [];
    // [v14.0] Lấy cảnh báo kèm giờ chấm → gắn lỗi vào từng lần chấm (map theo giờ HH:MM)
    let cbByGio = {};
    try {
      const { data: cbRows } = await supa.from('canh_bao')
        .select('id, gio_chamcong, loai_canh_bao, trang_thai')
        .eq('ma_nv', _suaLogState.maNV).eq('ngay', _suaLogState.ngay);
      (cbRows || []).forEach(cb => {
        const g = cb.gio_chamcong ? String(cb.gio_chamcong).substring(0,5) : '';
        if (g) { (cbByGio[g] = cbByGio[g] || []).push(cb); }
      });
    } catch (e) {}
    const LOAI_OPTIONS = ['VAO_CA','RA_GIUA_CA','VAO_GIUA_CA','RA_CA'];
    const LOAI_TEXT = {'VAO_CA':'Vào ca','RA_GIUA_CA':'Ra giữa ca','VAO_GIUA_CA':'Vào giữa ca','RA_CA':'Ra ca'};

    const logsHtml = logs.length === 0
      ? '<div class="adm2-empty">Chưa có log chấm công nào trong ngày</div>'
      : logs.map(l => {
        // [v10.85] Hiển thị value ban đầu: nếu là Đội SALE → tag tím
        const initVal = l.maCH ? ((l.tenCH || l.maCH) + ' (' + l.maCH + ')') : '';
        const initIsDoi = _slLaDiDong(l.tenCH || '', l.maCH || '');
        // [v13.11] Tag Đội SALE PER-RECORD (không lây từ log khác trong ngày):
        //  - tenCH là đội SALE → tô tím nguyên tên
        //  - ghiChu chứa "[Đội SALE X] hỗ trợ..." (format mới) → tag đội + tên CH thực
        //  - [v13.12] deviceInfo chứa "[SALE_ORIGIN:ma|ten]" / "[SALE_TARGET:ma|ten]" (format CŨ) → tag đội + tên CH thực
        //  - còn lại → chỉ tên CH, KHÔNG tag
        let chHtml = '';
        if (l.tenCH) {
          const mGhi = (l.ghiChu || '').match(/\[((?:đội\s*sale|cơ\s*động|co\s*dong)[^\]]*)\]/i);
          const di = l.deviceInfo || '';
          const mDi = di.match(/\[SALE_ORIGIN:[^|]+\|([^\]]+)\]/i) || di.match(/\[SALE_TARGET:[^|]+\|([^\]]+)\]/i);
          if (initIsDoi) {
            chHtml = `<span style="color:#0F766E;font-weight:600">${adm2Esc(l.tenCH)}</span>`;
          } else if (mGhi) {
            chHtml = `<span style="color:#0F766E;font-weight:600">${adm2Esc(mGhi[1].trim())}</span> - ${adm2Esc(l.tenCH)}`;
          } else if (mDi) {
            chHtml = `<span style="color:#0F766E;font-weight:600">${adm2Esc(mDi[1].trim())}</span> - ${adm2Esc(l.tenCH)}`;
          } else {
            chHtml = adm2Esc(l.tenCH);
          }
        }
        const _gioKey = (l.gio || '').toString().substring(0,5);
        const _logCbs = cbByGio[_gioKey] || [];
        const cbBadges = _logCbs.map(cb => {
          const tt = cb.trang_thai;
          const c  = tt==='DA_DUYET' ? '#15803D' : tt==='TU_CHOI' ? '#B91C1C' : '#B45309';
          const bg = tt==='DA_DUYET' ? '#DCFCE7' : tt==='TU_CHOI' ? '#FEE2E2' : '#FEF3C7';
          return `<span style="display:inline-block;padding:2px 8px;border-radius:5px;background:${bg};color:${c};font-size:10.5px;font-weight:700;margin:3px 4px 0 0">${adm2Esc(cb.loai_canh_bao || '')}</span>`;
        }).join('');
        return `
        <div class="adm2-row" style="flex-direction:column;align-items:stretch;gap:8px;padding:12px;background:#F9FAFB;margin-bottom:8px;border-radius:8px;border:1px solid #E5E7EB">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div style="flex:1;min-width:200px">
              <div style="font-weight:600;font-size:13px">${l.loaiText} · ${l.gio}</div>
              <div style="font-size:11px;color:#6B7280">${chHtml} · ${l.xacNhan} · ${l.soCB} CB</div>
              ${cbBadges ? `<div style="margin-top:2px">${cbBadges}</div>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <input type="time" id="sua-gio-${l.id}" value="${l.gio}" style="padding:5px 8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px">
              <select id="sua-loai-${l.id}" style="padding:5px 8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px">
                ${LOAI_OPTIONS.map(o => `<option value="${o}" ${o===l.loai?'selected':''}>${LOAI_TEXT[o]}</option>`).join('')}
              </select>
              <div style="position:relative">
                <input type="text" id="sua-ch-inp-${l.id}" value="${adm2Esc(initVal)}"
                  oninput="suaCHOnInput('${l.id}')" onfocus="suaCHShowSug('${l.id}')" onblur="suaCHHideSug('${l.id}')"
                  placeholder="Mã CH / Đội SALE" autocomplete="off"
                  style="padding:5px 8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;width:200px">
                <input type="hidden" id="sua-ch-${l.id}" value="${adm2Esc(l.maCH || '')}">
                <div id="sua-ch-sug-${l.id}" style="display:none;position:absolute;top:100%;left:0;background:#fff;border:1px solid #D1D5DB;border-radius:8px;box-shadow:0 6px 22px rgba(0,0,0,.15);margin-top:4px;max-height:240px;overflow-y:auto;z-index:100;min-width:280px"></div>
              </div>
              <button class="adm2-btn adm2-btn-primary adm2-btn-sm" onclick="adm2SuaLog('${l.id}','${_suaLogState.ngay}')">Lưu</button>
              <button class="adm2-btn adm2-btn-danger adm2-btn-sm" onclick="adm2XoaLog('${l.id}')">Xóa</button>
            </div>
          </div>
          <!-- [v10.85] Field CH thực khi đã chọn Đội SALE -->
          <div id="sua-chthuc-wrap-${l.id}" style="display:${initIsDoi?'':'none'};padding:10px 12px;background:#F0FDFA;border:1.5px solid #99F6E4;border-radius:8px">
            <label style="display:block;font-size:11px;font-weight:700;color:#115E59;margin-bottom:4px">
              🏬 Cửa hàng NV đang hỗ trợ <span style="color:#DC2626">*</span>
            </label>
            <div style="position:relative">
              <input type="text" id="sua-chthuc-inp-${l.id}" placeholder="Gõ mã CH hoặc tên CH thực tế..." autocomplete="off"
                oninput="suaCHThucOnInput('${l.id}')" onfocus="suaCHThucShowSug('${l.id}')" onblur="suaCHThucHideSug('${l.id}')"
                style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px;background:#fff;box-sizing:border-box">
              <input type="hidden" id="sua-chthuc-${l.id}" value="">
              <div id="sua-chthuc-sug-${l.id}" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #D1D5DB;border-radius:8px;box-shadow:0 6px 22px rgba(0,0,0,.15);margin-top:4px;max-height:240px;overflow-y:auto;z-index:100"></div>
            </div>
            <div style="font-size:11px;color:#0F766E;margin-top:5px;line-height:1.4">
              Bản ghi này sẽ lưu vào CH thực, ghi chú prefix "<b>[Đội SALE X] hỗ trợ ...</b>"
            </div>
          </div>
        </div>`;
      }).join('');

    const cbsHtml = cbs.length === 0 ? '' : `
      <div style="margin-top:16px;padding:10px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px">
        <div style="font-size:12px;font-weight:600;color:#9A3412;margin-bottom:6px">Cảnh báo trong ngày:</div>
        ${cbs.map(cb => `
          <div style="font-size:12px;margin-bottom:4px">
            <span style="color:${cb.trangThai==='DA_DUYET'?'#16A34A':cb.trangThai==='TU_CHOI'?'#DC2626':'#92400E'};font-weight:600">[${cb.trangThai}]</span>
            ${adm2Esc(cb.loaiCB)} ${cb.giaiTrinh?'· GT: '+adm2Esc(cb.giaiTrinh):''}
          </div>`).join('')}
      </div>`;

    body.innerHTML = `
      ${logsHtml}
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #E5E7EB;flex-wrap:wrap">
        <button class="adm2-btn adm2-btn-secondary adm2-btn-sm" onclick="adm2ThemLogPrompt()">+ Thêm log thiếu</button>
        ${_suaLogState.cbId ? `
        <button class="adm2-btn adm2-btn-primary" onclick="adm2DuyetCBSauSua()">
          ✓ Tôi đã sửa xong - Duyệt CB
        </button>` : ''}
      </div>
      ${cbsHtml}
      <div style="margin-top:12px;font-size:11px;color:#9CA3AF">
        Mọi thao tác sửa đều được ghi <code>audit_log</code> để truy vết.
      </div>`;
  } catch (e) {
    body.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: ' + adm2Esc(e.message) + '</div>';
  }
}

async function adm2SuaLog(id, ngay) {
  const gio  = document.getElementById('sua-gio-' + id).value;
  const loai = document.getElementById('sua-loai-' + id).value;
  const maCH = (document.getElementById('sua-ch-' + id).value || '').trim();
  const tenCHChon = document.getElementById('sua-ch-inp-' + id).value || '';
  if (!gio) { adm2Toast('Cần nhập giờ', 'error'); return; }

  // [v10.85] Detect vị trí di động → bắt buộc nhập CH thực
  let maChFinal = maCH || null;
  let lyDoFinal = 'Sửa từ form duyệt CB';
  const isDoi = maCH && _slLaDiDong(tenCHChon, maCH);
  // [v16.2] Cơ Động cần ghi nguon='CO_DONG' để fn_tong_hop_ngay bỏ lỗi "khác CH" → tính giờ
  const isCoDong = !!(isDoi && (typeof _laCoDong === 'function') && _laCoDong(tenCHChon, maCH));
  if (isDoi) {
    const maChThuc = (document.getElementById('sua-chthuc-' + id).value || '').trim();
    const tenChThuc = document.getElementById('sua-chthuc-inp-' + id).value || '';
    if (!maChThuc) {
      adm2Toast('Đã chọn vị trí di động — vui lòng chọn cửa hàng đang hỗ trợ.', 'error');
      return;
    }
    maChFinal = maChThuc;
    const tenDoi = tenCHChon.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const tenChThucClean = tenChThuc.replace(/\s*\([^)]*\)\s*$/, '').trim();
    lyDoFinal = `[${tenDoi}] hỗ trợ ${tenChThucClean} · Sửa từ form duyệt CB`;
  }

  const thoiGian = ngay + 'T' + gio + ':00+07:00';
  try {
    const d = await adm2Rpc('fn_admin_sua_cham_cong', {
      p_admin: SESSION.ma, p_id: id,
      p_thoi_gian: thoiGian, p_loai: loai,
      p_ma_ch: maChFinal, p_ly_do: lyDoFinal,
      p_nguon: isCoDong ? 'CO_DONG' : null
    });
    if (d && d.success === false) { adm2Toast(d.error || 'Lỗi', 'error'); return; }
    _suaLogState.daSuaGio = true;
    await _rebuildCong(_suaLogState.maNV, _suaLogState.ngay);
    adm2Toast('Đã lưu', 'success');
    adm2LoadSuaLogBody();
  } catch (e) { adm2Toast(e.message, 'error'); }
}

// [v10.85] Autocomplete CH + Đội SALE cho row sửa log admin
function suaCHOnInput(logId) {
  const inp = document.getElementById('sua-ch-inp-' + logId);
  if (!inp.value.trim()) document.getElementById('sua-ch-' + logId).value = '';
  suaCHShowSug(logId);
}
function suaCHShowSug(logId) {
  const inp = document.getElementById('sua-ch-inp-' + logId);
  const sug = document.getElementById('sua-ch-sug-' + logId);
  const list = window._bscChList || [];
  if (!list.length) { sug.style.display = 'none'; return; }
  const q = inp.value.trim().toLowerCase();
  let matched;
  if (!q) matched = list.slice(0, 12);
  else matched = list.filter(ch =>
    (ch.ma_ch||'').toLowerCase().includes(q) ||
    (ch.ten_ch||'').toLowerCase().includes(q) ||
    (ch.khu_vuc||'').toLowerCase().includes(q)
  ).slice(0, 15);
  if (!matched.length) { sug.style.display = 'none'; return; }
  sug.innerHTML = matched.map(ch => {
    const isDoi = _slLaDiDong(ch.ten_ch || '', ch.ma_ch || '');
    const tagHtml = isDoi ? `<span style="background:#F0FDFA;color:#0F766E;font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:6px">DI ĐỘNG</span>` : '';
    return `<div onmousedown="event.preventDefault();suaCHPick('${logId}','${ch.ma_ch}', \`${(ch.ten_ch||'').replace(/`/g,"'")}\`)"
       style="padding:9px 11px;cursor:pointer;font-size:13px;border-bottom:1px solid #F1F5F9"
       onmouseenter="this.style.background='#F8FAFC'" onmouseleave="this.style.background='#fff'">
      <div style="font-weight:600;color:#0F172A">${(ch.ten_ch||'').replace(/</g,'&lt;')}${tagHtml}</div>
      <div style="font-size:10.5px;color:#64748B;margin-top:2px">${ch.ma_ch}${ch.khu_vuc ? ' · ' + ch.khu_vuc.replace(/</g,'&lt;') : ''}</div>
    </div>`;
  }).join('');
  sug.style.display = 'block';
}
function suaCHHideSug(logId) { setTimeout(()=>{ const s=document.getElementById('sua-ch-sug-'+logId); if (s) s.style.display='none'; }, 200); }
function suaCHPick(logId, ma, ten) {
  document.getElementById('sua-ch-inp-' + logId).value = ten + ' (' + ma + ')';
  document.getElementById('sua-ch-' + logId).value = ma;
  document.getElementById('sua-ch-sug-' + logId).style.display = 'none';
  const isDoi = _slLaDiDong(ten, ma);
  const wrap = document.getElementById('sua-chthuc-wrap-' + logId);
  if (wrap) {
    wrap.style.display = isDoi ? '' : 'none';
    if (!isDoi) {
      const inpT = document.getElementById('sua-chthuc-inp-' + logId);
      const hT = document.getElementById('sua-chthuc-' + logId);
      if (inpT) inpT.value = '';
      if (hT) hT.value = '';
    }
  }
}
// CH thực
function suaCHThucOnInput(logId) {
  const inp = document.getElementById('sua-chthuc-inp-' + logId);
  if (!inp.value.trim()) document.getElementById('sua-chthuc-' + logId).value = '';
  suaCHThucShowSug(logId);
}
function suaCHThucShowSug(logId) {
  const inp = document.getElementById('sua-chthuc-inp-' + logId);
  const sug = document.getElementById('sua-chthuc-sug-' + logId);
  const list = (window._bscChList || []).filter(ch => !_slLaDiDong(ch.ten_ch || '', ch.ma_ch || ''));
  if (!list.length) { sug.style.display = 'none'; return; }
  const q = inp.value.trim().toLowerCase();
  let matched;
  if (!q) matched = list.slice(0, 12);
  else matched = list.filter(ch =>
    (ch.ma_ch||'').toLowerCase().includes(q) ||
    (ch.ten_ch||'').toLowerCase().includes(q) ||
    (ch.khu_vuc||'').toLowerCase().includes(q)
  ).slice(0, 15);
  if (!matched.length) { sug.style.display = 'none'; return; }
  sug.innerHTML = matched.map(ch =>
    `<div onmousedown="event.preventDefault();suaCHThucPick('${logId}','${ch.ma_ch}', \`${(ch.ten_ch||'').replace(/`/g,"'")}\`)"
       style="padding:9px 11px;cursor:pointer;font-size:13px;border-bottom:1px solid #F1F5F9"
       onmouseenter="this.style.background='#F8FAFC'" onmouseleave="this.style.background='#fff'">
      <div style="font-weight:600;color:#0F172A">${(ch.ten_ch||'').replace(/</g,'&lt;')}</div>
      <div style="font-size:10.5px;color:#64748B;margin-top:2px">${ch.ma_ch}${ch.khu_vuc ? ' · ' + ch.khu_vuc.replace(/</g,'&lt;') : ''}</div>
    </div>`
  ).join('');
  sug.style.display = 'block';
}
function suaCHThucHideSug(logId) { setTimeout(()=>{ const s=document.getElementById('sua-chthuc-sug-'+logId); if (s) s.style.display='none'; }, 200); }
function suaCHThucPick(logId, ma, ten) {
  document.getElementById('sua-chthuc-inp-' + logId).value = ten + ' (' + ma + ')';
  document.getElementById('sua-chthuc-' + logId).value = ma;
  document.getElementById('sua-chthuc-sug-' + logId).style.display = 'none';
}

// [v9.45] Load datalist CH 1 lần cho dropdown gợi ý CH
async function adm2EnsureChDatalist() {
  if (document.getElementById('adm2-ch-datalist')) return;
  try {
    const { data } = await supa.from('cua_hang')
      .select('ma_ch, ten_ch')
      .eq('trang_thai', 'ĐANG HOẠT ĐỘNG').limit(500);
    const dl = document.createElement('datalist');
    dl.id = 'adm2-ch-datalist';
    window._adm2ChSet = new Set();
    (data || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.ma_ch;
      opt.label = c.ten_ch;
      opt.textContent = c.ten_ch;
      dl.appendChild(opt);
      window._adm2ChSet.add(c.ma_ch);
    });
    document.body.appendChild(dl);
  } catch (e) { console.warn('[adm2] load CH list error:', e); }
}

async function adm2XoaLog(id) {
  if (!confirm('Xóa log này? (không hoàn tác được)')) return;
  try {
    const d = await adm2Rpc('fn_admin_xoa_cham_cong', { p_admin: SESSION.ma, p_id: id });
    if (d && d.success === false) { adm2Toast(d.error || 'Lỗi', 'error'); return; }
    _suaLogState.daSuaGio = true;
    await _rebuildCong(_suaLogState.maNV, _suaLogState.ngay);
    adm2Toast('Đã xóa log', 'success');
    adm2LoadSuaLogBody();
  } catch (e) { adm2Toast(e.message, 'error'); }
}

async function adm2ThemLogPrompt() {
  // [v10.85.1] Mở modal mới có autocomplete CH (NV + ngày đã có context từ _suaLogState)
  openAdminThemLog({
    maNV: _suaLogState.maNV,
    ngay: _suaLogState.ngay,
    mode: 'add_log',
    onSuccess: async () => { _suaLogState.daSuaGio = true; await _rebuildCong(_suaLogState.maNV, _suaLogState.ngay); adm2LoadSuaLogBody(); }
  });
}

async function adm2DuyetCBSauSua() {
  if (!_suaLogState.cbId) return;
  try {
    const d = await adm2Rpc('fn_admin_duyet_cb_sau_sua', {
      p_admin: SESSION.ma, p_cb_id: _suaLogState.cbId,
      p_da_sua_gio: _suaLogState.daSuaGio,
      p_ly_do: 'Duyệt sau khi sửa lịch'
    });
    if (d && d.success === false) {
      adm2Toast(d.error || 'Lỗi', 'error');
      return;
    }
    await _rebuildCong(_suaLogState.maNV, _suaLogState.ngay);
    adm2Toast('✓ Đã duyệt cảnh báo', 'success');
    adm2CloseSuaLog();
    // Remove CB row khỏi list
    const row = document.getElementById('adm2-cb-' + _suaLogState.cbId);
    if (row) row.remove();
  } catch (e) { adm2Toast(e.message, 'error'); }
}
async function adm2DetailPhienDangMo(bodyEl) {
  try {
    const { data, error } = await supa.from('phien_ban_hang')
      .select('id, ma_ch, ten_ch_snapshot, khu_vuc, ma_nv, ten_nv_snapshot, gio_mo, stt_trong_ngay, ngay')
      .eq('trang_thai', 'DANG_MO').order('gio_mo', { ascending:false }).limit(200);
    if (error) throw error;
    adm2RenderPhienMoList(data, bodyEl);
  } catch (e) { bodyEl.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: '+adm2Esc(e.message)+'</div>'; }
}

function adm2RenderPhienMoList(list, container) {
  if (!list || !list.length) { container.innerHTML = '<div class="adm2-empty">Không có phiên nào đang mở</div>'; return; }
  // [v5.3] Card đẹp giống QLBH + timer giây + nút Đóng có chữ
  container.style.background = 'transparent';
  container.style.border = 'none';
  container.style.padding = '0';
  container.innerHTML = list.map(p => {
    let startMs;
    try { startMs = p.gio_mo ? new Date(p.gio_mo).getTime() : Date.now(); if (isNaN(startMs)) startMs = Date.now(); }
    catch(e){ startMs = Date.now(); }
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    const m = Math.floor(elapsed / 60), s = elapsed % 60;
    const tt = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    const hot = m >= 45 ? 'hot' : '';
    return `
      <div class="bh-live-card ${hot}" id="adm2-phien-${p.id}" data-start="${startMs}" style="cursor:default">
        <div class="bh-live-card-head">
          <div style="font-weight:600;color:#0F172A;font-size:14px">
            #${p.stt_trong_ngay || '?'} · ${adm2Esc(p.ten_ch_snapshot || p.ma_ch)}
          </div>
          <div class="bh-live-timer" data-elapsed-target>${tt}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;color:#475569">
          <div style="flex:1;min-width:0">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${adm2Esc(p.khu_vuc || '—')} · NV: ${adm2Esc(p.ten_nv_snapshot || p.ma_nv || '—')}
            </div>
            <div style="opacity:0.7;margin-top:2px">Mở lúc ${adm2FmtTime(p.gio_mo)}</div>
          </div>
          <button class="adm2-btn adm2-btn-warn adm2-btn-sm" style="flex-shrink:0" onclick="adm2DongPhien('${p.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M18 6L6 18M6 6l12 12"/></svg>
            <span>Đóng phiên</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
  adm2StartLiveTimer();
}

// [v5.3] Timer giây — update mỗi 1s text trong .bh-live-timer
function adm2StartLiveTimer() {
  if (window.ADM2 && ADM2.liveTickTimer) return; // đã chạy rồi
  if (!window.ADM2) window.ADM2 = {};
  ADM2.liveTickTimer = setInterval(() => {
    document.querySelectorAll('#adm2-phien-list .bh-live-card, #adm2-detail-body .bh-live-card').forEach(card => {
      const start = parseInt(card.dataset.start || '0', 10);
      if (!start) return;
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const m = Math.floor(elapsed / 60), s = elapsed % 60;
      const tt = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      const timerEl = card.querySelector('[data-elapsed-target]');
      if (timerEl) timerEl.textContent = tt;
      if (m >= 45 && !card.classList.contains('hot')) card.classList.add('hot');
    });
  }, 1000);
}
function adm2StopLiveTimer() {
  if (window.ADM2 && ADM2.liveTickTimer) { clearInterval(ADM2.liveTickTimer); ADM2.liveTickTimer = null; }
}

async function adm2DongPhien(id) {
  const ok = await adm2Confirm('Đóng phiên này?', 'Phiên sẽ tính là Không mua. Không thể hoàn tác.');
  if (!ok) return;
  try {
    await adm2Rpc('fn_bh_dong_phien', { p_phien_id: id, p_ma_nguoi_dong: SESSION.ma });
    const row = document.getElementById('adm2-phien-' + id);
    if (row) row.remove();
    adm2Toast('Đã đóng phiên', 'success');
  } catch (e) { adm2Toast(e.message, 'error'); }
}

// Detail: phiên hôm nay - [v9.45] mini view giống BH + toàn quyền tuỳ chỉnh
async function adm2DetailPhienHomNay(bodyEl) {
  await adm2RenderPhienHomNay(bodyEl);
}

async function adm2RenderPhienHomNay(bodyEl){
  try {
    const today = new Date().toISOString().slice(0,10);
    const { data, error } = await supa.from('phien_ban_hang')
      .select('id, stt_trong_ngay, ten_ch_snapshot, ma_ch, ten_nv_snapshot, ma_nv, gio_mo, gio_dong, ket_qua, trang_thai, thoi_luong_phut, ghi_chu, tong_gia_tri, sp_da_mua_text, yeu_cau_xoa')
      .eq('ngay', today).order('gio_mo', { ascending:false }).limit(200);
    if (error) throw error;
    if (!data.length) { bodyEl.innerHTML = '<div class="adm2-empty">Chưa có phiên nào hôm nay</div>'; return; }
    bodyEl.innerHTML = data.map(p => {
      const ktBadge = p.ket_qua === 'MUA' ? '<span style="background:#DCFCE7;color:#16A34A;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">✓ ĐÃ MUA</span>'
        : p.ket_qua === 'CHUA_MUA' ? '<span style="background:#FEE2E2;color:#DC2626;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">✗ KHÔNG MUA</span>'
        : p.ket_qua === 'TU_DONG' ? '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">⏱ TỰ ĐÓNG</span>'
        : p.ket_qua === 'ADMIN_DONG' ? '<span style="background:#F3F4F6;color:#6B7280;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">⊘ ADMIN ĐÓNG</span>'
        : p.trang_thai === 'DANG_MO' ? '<span style="background:#DBEAFE;color:#1E40AF;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">⟳ ĐANG MỞ</span>'
        : '<span style="background:#F3F4F6;color:#6B7280;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">—</span>';
      const ycXoa = p.yeu_cau_xoa ? '<span style="background:#FEE2E2;color:#991B1B;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:600;margin-left:4px">🗑 YC XÓA</span>' : '';
      const _soSP = p.sp_da_mua_text ? p.sp_da_mua_text.split(',').filter(x => x.trim()).length : 0;
      const tien = _soSP ? `<div style="font-size:12px;color:#0F172A;margin-top:2px">${_soSP} SP</div>` : '';
      const ghiChu = p.ghi_chu ? `<div style="font-size:11px;color:#6B7280;margin-top:4px;font-style:italic">"${adm2Esc(p.ghi_chu)}"</div>` : '';
      
      return `
        <div id="adm2-phien-${p.id}" style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:12px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:#0F172A">
                #${p.stt_trong_ngay || '?'} · ${adm2Esc(p.ten_ch_snapshot || p.ma_ch)} ${ktBadge}${ycXoa}
              </div>
              <div style="font-size:11px;color:#6B7280;margin-top:2px">
                NV: ${adm2Esc(p.ten_nv_snapshot || '—')} ${p.ma_nv ? '('+adm2Esc(p.ma_nv)+')' : ''} · ${adm2FmtTime(p.gio_mo)} → ${p.gio_dong ? adm2FmtTime(p.gio_dong) : '...'} · ${adm2FmtDuration(p.thoi_luong_phut)}
              </div>
              ${tien}
              ${ghiChu}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
            <button class="adm2-btn adm2-btn-secondary adm2-btn-sm" onclick="adm2EditPhien('${p.id}')">✎ Sửa</button>
            ${p.trang_thai === 'DANG_MO' ? `<button class="adm2-btn adm2-btn-primary adm2-btn-sm" onclick="adm2DongPhien('${p.id}')">⊘ Đóng phiên</button>` : ''}
            <button class="adm2-btn adm2-btn-sm" style="background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5" onclick="adm2XoaPhien('${p.id}')">🗑 Xóa</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) { bodyEl.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: '+adm2Esc(e.message)+'</div>'; }
}

// [v9.45] Sửa phiên (toàn quyền)
async function adm2EditPhien(id){
  try {
    const { data: p, error } = await supa.from('phien_ban_hang').select('*').eq('id', id).single();
    if (error || !p) { adm2Toast('Không tìm thấy phiên', 'error'); return; }
    // Build modal
    let modal = document.getElementById('adm2-edit-phien-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'adm2-edit-phien-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)';
    modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
    modal.innerHTML = `
      <div style="background:white;border-radius:14px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;padding:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #E5E7EB">
          <div style="font-size:15px;font-weight:700;color:#0F172A">✎ Sửa phiên #${p.stt_trong_ngay || '?'}</div>
          <button onclick="document.getElementById('adm2-edit-phien-modal').remove()" style="background:none;border:none;font-size:20px;color:#9CA3AF;cursor:pointer">✕</button>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div>
            <label style="display:block;font-size:11px;color:#6B7280;margin-bottom:4px">Mã CH</label>
            <input id="aep-ma-ch" value="${adm2Esc(p.ma_ch||'')}" style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px">
          </div>
          <div>
            <label style="display:block;font-size:11px;color:#6B7280;margin-bottom:4px">Mã NV phụ trách</label>
            <input id="aep-ma-nv" value="${adm2Esc(p.ma_nv||'')}" style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px">
          </div>
          <div>
            <label style="display:block;font-size:11px;color:#6B7280;margin-bottom:4px">Giờ mở</label>
            <input id="aep-gio-mo" type="datetime-local" value="${p.gio_mo ? new Date(p.gio_mo).toISOString().slice(0,16) : ''}" style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px">
          </div>
          <div>
            <label style="display:block;font-size:11px;color:#6B7280;margin-bottom:4px">Giờ đóng</label>
            <input id="aep-gio-dong" type="datetime-local" value="${p.gio_dong ? new Date(p.gio_dong).toISOString().slice(0,16) : ''}" style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px">
          </div>
          <div>
            <label style="display:block;font-size:11px;color:#6B7280;margin-bottom:4px">Kết quả</label>
            <select id="aep-ket-qua" style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;background:white">
              <option value="">(chưa)</option>
              <option value="MUA" ${p.ket_qua==='MUA'?'selected':''}>MUA</option>
              <option value="CHUA_MUA" ${p.ket_qua==='CHUA_MUA'?'selected':''}>CHUA_MUA</option>
              <option value="TU_DONG" ${p.ket_qua==='TU_DONG'?'selected':''}>TU_DONG</option>
              <option value="ADMIN_DONG" ${p.ket_qua==='ADMIN_DONG'?'selected':''}>ADMIN_DONG</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:11px;color:#6B7280;margin-bottom:4px">Trạng thái</label>
            <select id="aep-trang-thai" style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;background:white">
              <option value="DANG_MO" ${p.trang_thai==='DANG_MO'?'selected':''}>DANG_MO</option>
              <option value="DA_DONG" ${p.trang_thai==='DA_DONG'?'selected':''}>DA_DONG</option>
              <option value="DA_HUY" ${p.trang_thai==='DA_HUY'?'selected':''}>DA_HUY</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:11px;color:#6B7280;margin-bottom:4px">Ghi chú</label>
          <textarea id="aep-ghi-chu" rows="2" style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;font-family:inherit;resize:vertical">${adm2Esc(p.ghi_chu||'')}</textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button onclick="document.getElementById('adm2-edit-phien-modal').remove()" class="adm2-btn adm2-btn-secondary">Hủy</button>
          <button onclick="adm2SaveEditPhien('${id}')" class="adm2-btn adm2-btn-primary">💾 Lưu</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch(e) { adm2Toast(e.message, 'error'); }
}

async function adm2SaveEditPhien(id){
  try {
    const updates = {
      ma_ch: document.getElementById('aep-ma-ch').value.trim() || null,
      ma_nv: document.getElementById('aep-ma-nv').value.trim() || null,
      gio_mo: document.getElementById('aep-gio-mo').value ? new Date(document.getElementById('aep-gio-mo').value).toISOString() : null,
      gio_dong: document.getElementById('aep-gio-dong').value ? new Date(document.getElementById('aep-gio-dong').value).toISOString() : null,
      ket_qua: document.getElementById('aep-ket-qua').value || null,
      trang_thai: document.getElementById('aep-trang-thai').value,
      ghi_chu: document.getElementById('aep-ghi-chu').value.trim() || null,
    };
    const { error } = await supa.from('phien_ban_hang').update(updates).eq('id', id);
    if(error) throw error;
    adm2Toast('Đã lưu', 'success');
    document.getElementById('adm2-edit-phien-modal').remove();
    // Reload list
    const bodyEl = document.getElementById('adm2-detail-body');
    if (bodyEl) adm2RenderPhienHomNay(bodyEl);
  } catch(e) { adm2Toast(e.message, 'error'); }
}

async function adm2XoaPhien(id){
  if(!confirm('Xóa VĨNH VIỄN phiên này? Không thể hoàn tác.')) return;
  if(!confirm('Xác nhận lần 2: thực sự xóa phiên này?')) return;
  try {
    // Xóa cả san_pham_phien liên quan trước
    await supa.from('san_pham_phien').delete().eq('phien_id', id);
    const { error } = await supa.from('phien_ban_hang').delete().eq('id', id);
    if(error) throw error;
    const row = document.getElementById('adm2-phien-' + id);
    if (row) row.remove();
    adm2Toast('Đã xóa phiên', 'success');
  } catch(e) { adm2Toast(e.message, 'error'); }
}

async function adm2DetailDonNghi(bodyEl) {
  // Wrap với tab filter
  bodyEl.innerHTML = `
    <div style="display:flex;gap:4px;margin-bottom:10px;padding:4px;background:#F3F4F6;border-radius:8px">
      <button class="adm2-dn-tab" data-dn-filter="CHO_DUYET" onclick="adm2SetDNFilter('CHO_DUYET')" style="flex:1;padding:6px 10px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;background:#EC4899;color:white">Chờ duyệt</button>
      <button class="adm2-dn-tab" data-dn-filter="DA_DUYET" onclick="adm2SetDNFilter('DA_DUYET')" style="flex:1;padding:6px 10px;border:none;border-radius:6px;font-size:12px;cursor:pointer;background:transparent;color:#6B7280">Đã duyệt</button>
      <button class="adm2-dn-tab" data-dn-filter="TU_CHOI" onclick="adm2SetDNFilter('TU_CHOI')" style="flex:1;padding:6px 10px;border:none;border-radius:6px;font-size:12px;cursor:pointer;background:transparent;color:#6B7280">Từ chối</button>
      <button class="adm2-dn-tab" data-dn-filter="ALL" onclick="adm2SetDNFilter('ALL')" style="flex:1;padding:6px 10px;border:none;border-radius:6px;font-size:12px;cursor:pointer;background:transparent;color:#6B7280">Tất cả</button>
    </div>
    <div id="adm2-dn-listbody"><div class="adm2-empty">⏳ Đang tải...</div></div>
  `;
  await adm2LoadDNList();
}

function adm2SetDNFilter(filter){
  _adm2DnFilter = filter;
  document.querySelectorAll('.adm2-dn-tab').forEach(b=>{
    const active = b.dataset.dnFilter === filter;
    b.style.background = active ? '#EC4899' : 'transparent';
    b.style.color = active ? 'white' : '#6B7280';
  });
  adm2LoadDNList();
}

async function adm2LoadDNList(){
  const el = document.getElementById('adm2-dn-listbody');
  if(!el) return;
  el.innerHTML = '<div class="adm2-empty">⏳ Đang tải...</div>';
  try {
    let q = supa.from('don_nghi').select('id, ma_nv, ma_ch, ngay_nghi, loai_nghi, ly_do, anh_url, trang_thai, nguoi_duyet, thoi_gian_duyet, ghi_chu_duyet, created_at');
    if (_adm2DnFilter !== 'ALL') q = q.eq('trang_thai', _adm2DnFilter);
    const { data, error } = await q.order('created_at', { ascending:false }).limit(200);
    if (error) throw error;
    if (!data.length) { el.innerHTML = '<div class="adm2-empty">Không có đơn nghỉ</div>'; return; }
    el.innerHTML = data.map(r => {
      let ttBadge = '';
      if (r.trang_thai === 'DA_DUYET') ttBadge = '<span style="background:#DCFCE7;color:#16A34A;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">✓ ĐÃ DUYỆT</span>';
      else if (r.trang_thai === 'TU_CHOI') ttBadge = '<span style="background:#FEE2E2;color:#DC2626;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">✗ TỪ CHỐI</span>';
      else if (r.trang_thai === 'DA_HUY') ttBadge = '<span style="background:#F3F4F6;color:#6B7280;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">⊘ ĐÃ HỦY</span>';
      else ttBadge = '<span style="background:#FCE7F3;color:#9F1239;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">⏳ CHỜ DUYỆT</span>';
      
      const actions = `
        ${r.trang_thai !== 'DA_DUYET' ? `<button class="adm2-btn adm2-btn-primary adm2-btn-sm" onclick="adm2DuyetDN('${r.id}','Đã duyệt')">✓ Duyệt</button>` : ''}
        ${r.trang_thai !== 'TU_CHOI' ? `<button class="adm2-btn adm2-btn-sm" style="background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5" onclick="adm2DuyetDN('${r.id}','Từ chối')">✗ Từ chối</button>` : ''}
        ${(r.trang_thai === 'DA_DUYET' || r.trang_thai === 'TU_CHOI') ? `<button class="adm2-btn adm2-btn-sm" style="background:#F3F4F6;color:#374151;border:1px solid #D1D5DB" onclick="adm2RevertDN('${r.id}')">↺ Đặt lại Chờ duyệt</button>` : ''}
      `;
      
      const anh = r.anh_url ? `<a href="${adm2Esc(r.anh_url)}" target="_blank" style="display:inline-block;font-size:11px;color:#0EA5E9;margin-top:4px">📎 Xem ảnh đính kèm</a>` : '';
      const ghiChu = r.ghi_chu_duyet ? `<div style="background:#F9FAFB;border-left:3px solid #94A3B8;padding:6px 8px;margin-top:6px;border-radius:4px;font-size:11px;line-height:1.4"><strong>💬 QLNS:</strong> ${adm2Esc(r.ghi_chu_duyet)}</div>` : '';
      const nguoiDuyet = r.nguoi_duyet ? `<div style="font-size:10px;color:#9CA3AF;margin-top:4px">Người duyệt: <strong>${adm2Esc(r.nguoi_duyet)}</strong> · ${r.thoi_gian_duyet ? adm2FmtTime(r.thoi_gian_duyet) : ''}</div>` : '';
      
      return `
      <div class="adm2-row" id="adm2-dn-${r.id}" style="flex-direction:column;align-items:stretch;padding:12px;border:1px solid #E5E7EB;border-radius:10px;background:white;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#0F172A">${adm2Esc(r.ma_nv)} · ${adm2Esc(r.loai_nghi || '')}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:2px">Nghỉ ngày: <strong>${adm2Esc(r.ngay_nghi)}</strong></div>
            <div style="font-size:11px;color:#374151;margin-top:6px;padding:6px 8px;background:#F9FAFB;border-radius:6px;line-height:1.4">${adm2Esc(r.ly_do || 'Không có lý do')}</div>
            ${anh}
            ${ghiChu}
            ${nguoiDuyet}
          </div>
          ${ttBadge}
        </div>
        <div class="adm2-row-actions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${actions}</div>
      </div>
    `;}).join('');
  } catch (e) { el.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: '+adm2Esc(e.message)+'</div>'; }
}

async function adm2DuyetDN(id, quyetDinh){
  let lyDo = null;
  if (quyetDinh === 'Từ chối') {
    lyDo = prompt('Lý do từ chối (bắt buộc):');
    if(!lyDo || !lyDo.trim()) { adm2Toast('Cần nhập lý do', 'error'); return; }
  }
  try {
    const data = await adm2Rpc('fn_duyet_don_nghi', {
      p_id: id, p_quyet_dinh: quyetDinh, p_ma_nguoi_duyet: SESSION.ma, p_ghi_chu: lyDo
    });
    if (data && data.success === false) { adm2Toast(data.error || 'Lỗi', 'error'); return; }
    adm2Toast(quyetDinh === 'Đã duyệt' ? 'Đã duyệt' : 'Đã từ chối', 'success');
    adm2LoadDNList();
  } catch (e) { adm2Toast(e.message, 'error'); }
}

async function adm2RevertDN(id){
  if(!confirm('Đặt lại đơn nghỉ này về trạng thái Chờ duyệt?')) return;
  try {
    const { error } = await supa.from('don_nghi').update({
      trang_thai: 'CHO_DUYET',
      ghi_chu_duyet: '[Đã đặt lại bởi Admin lúc ' + new Date().toLocaleString('vi-VN') + ']'
    }).eq('id', id);
    if(error) throw error;
    // Đồng bộ lich_ca tương ứng
    await supa.from('lich_ca').update({
      trang_thai: 'CHO_DUYET'
    }).eq('ma_nv', (await supa.from('don_nghi').select('ma_nv,ngay_nghi').eq('id',id).single()).data.ma_nv)
      .eq('loai', 'Nghỉ phép');
    adm2Toast('Đã đặt lại', 'success');
    adm2LoadDNList();
  } catch(e) { adm2Toast(e.message, 'error'); }
}

async function adm2DetailLichCa(bodyEl) {
  try {
    const { data, error } = await supa.from('lich_ca')
      .select('id, ma_nv, ten_nv_snapshot, ma_ch, ngay, gio_bat_dau, gio_ket_thuc, loai, trang_thai')
      .in('trang_thai',['CHO_DUYET','DA_GUI']).order('ngay').limit(100000);
    if (error) throw error;
    if (!data.length) { bodyEl.innerHTML = '<div class="adm2-empty">Không có lịch ca chờ duyệt</div>'; return; }
    bodyEl.innerHTML = data.map(r => `
      <div class="adm2-row">
        <div class="adm2-row-main">
          <div class="adm2-row-title">${adm2Esc(r.ten_nv_snapshot || r.ma_nv)} · ${adm2Esc(r.ngay)}</div>
          <div class="adm2-row-sub">${adm2Esc(r.ma_ch || '')} · ${adm2Esc(String(r.gio_bat_dau || '').slice(0,5))}-${adm2Esc(String(r.gio_ket_thuc || '').slice(0,5))} · ${adm2Esc(r.loai || '')}</div>
        </div>
      </div>
    `).join('');
  } catch (e) { bodyEl.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: '+adm2Esc(e.message)+'</div>'; }
}

// ─── 2. TÀI KHOẢN ─────────────────────────────────────────
function adm2DebounceSearch() {
  clearTimeout(ADM2.searchTimer);
  ADM2.searchTimer = setTimeout(adm2SearchAcc, 400);
}

async function adm2SearchAcc() {
  const kw = document.getElementById('adm2-acc-kw').value.trim();
  const loai = document.getElementById('adm2-acc-loai').value;
  const el = document.getElementById('adm2-acc-list');
  // [v9.45] Khi kw rỗng → vẫn load tất cả (limit 200), search chỉ là lọc tiếp
  el.innerHTML = '<div class="adm2-empty">Đang tải...</div>';
  try {
    const data = await adm2Rpc('fn_admin_search_account', { p_admin: SESSION.ma, p_keyword: kw || '', p_loai: loai, p_limit: kw ? 100 : 200 });
    const list = data.data || [];
    if (!list.length) { el.innerHTML = '<div class="adm2-empty">Không có dữ liệu</div>'; return; }
    el.innerHTML = '<div class="adm2-detail" style="margin-top:0"><div class="adm2-detail-body" style="max-height:none">' +
      list.map(a => adm2AccRowHtml(a)).join('') + '</div></div>';
  } catch (e) { el.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: '+adm2Esc(e.message)+'</div>'; }
}

// Actions cho tài khoản
async function adm2ActSetPw(loai, ma) {
  const pw = await adm2Modal({ title:'Đặt mật khẩu mới', sub:'Cho ' + ma + ' (≥ 6 ký tự)', type:'prompt', placeholder:'Mật khẩu mới', okLabel:'Lưu' });
  if (!pw) return;
  try {
    await adm2Rpc('fn_admin_set_password', { p_admin: SESSION.ma, p_loai: loai, p_ma: ma, p_new_pw: pw });
    adm2Toast('Đã đặt mật khẩu mới', 'success');
    adm2RefreshActive();
  } catch (e) { adm2Toast(e.message, 'error'); }
}

async function adm2ActResetPw(loai, ma) {
  const ok = await adm2Confirm('Reset mật khẩu ' + ma + '?', 'Mật khẩu sẽ về Ns280396.');
  if (!ok) return;
  try {
    await adm2Rpc('fn_admin_reset_password', { p_admin: SESSION.ma, p_loai: loai, p_ma: ma });
    adm2Toast('Đã reset · ' + ma + ' đăng nhập bằng Ns280396', 'success');
    adm2RefreshActive();
  } catch (e) { adm2Toast(e.message, 'error'); }
}

async function adm2ActSetRole(loai, ma, curRole) {
  const roles = loai === 'NV'
    ? ['NV','QLNS','ADMIN','QLBH','QLBHHCM','QLBHMD','QLBHMT','QLBHTTN','QLBHMDTTN','QLBHHNTB']
    : ['QLNS','ADMIN','QLBH','QLBHHCM','QLBHMD','QLBHMT','QLBHTTN','QLBHMDTTN','QLBHHNTB'];
  const newRole = await adm2Modal({ title:'Đổi vai trò ' + ma, sub:'Hiện tại: ' + curRole, type:'select', value: curRole,
    options: roles.map(r => ({ value:r, label:r })), okLabel:'Lưu' });
  if (!newRole || newRole === curRole) return;
  try {
    await adm2Rpc('fn_admin_set_role', { p_admin: SESSION.ma, p_loai: loai, p_ma: ma, p_role: newRole });
    adm2Toast('Đã đổi vai trò → ' + newRole, 'success');
    adm2RefreshActive();
  } catch (e) { adm2Toast(e.message, 'error'); }
}

async function adm2ActSetStatus(loai, ma, curStatus) {
  const newSt = await adm2Modal({ title:'Đổi trạng thái ' + ma, sub:'Hiện tại: ' + curStatus, type:'select', value: curStatus,
    options: [{value:'ACTIVE',label:'ACTIVE'},{value:'INACTIVE',label:'INACTIVE'},{value:'NGHI_VIEC',label:'NGHI_VIEC'}], okLabel:'Lưu' });
  if (!newSt || newSt === curStatus) return;
  try {
    await adm2Rpc('fn_admin_set_status', { p_admin: SESSION.ma, p_loai: loai, p_ma: ma, p_status: newSt });
    adm2Toast('Đã đổi trạng thái → ' + newSt, 'success');
    adm2RefreshActive();
  } catch (e) { adm2Toast(e.message, 'error'); }
}

function adm2RefreshActive() {
  // Refresh whatever's open
  if (ADM2.currentTab === 'taikhoan' && document.getElementById('adm2-acc-kw').value.trim()) adm2SearchAcc();
  if (ADM2.currentTab === 'tongquan' && ADM2.activeDetail) adm2OpenDetail(ADM2.activeDetail);
}

// ─── 3. PHIÊN BH TAB ──────────────────────────────────────
async function adm2LoadPhienDangMo() {
  const el = document.getElementById('adm2-phien-list');
  el.innerHTML = '<div class="adm2-empty">Đang tải...</div>';
  try {
    const { data, error } = await supa.from('phien_ban_hang')
      .select('id, ma_ch, ten_ch_snapshot, khu_vuc, ma_nv, ten_nv_snapshot, gio_mo, stt_trong_ngay, ngay')
      .eq('trang_thai', 'DANG_MO').order('gio_mo', { ascending:false }).limit(500);
    if (error) throw error;
    document.getElementById('adm2-phien-count').textContent = data.length;
    adm2RenderPhienMoList(data, el);
  } catch (e) { el.innerHTML = '<div class="adm2-empty" style="color:#DC2626">Lỗi: '+adm2Esc(e.message)+'</div>'; }
}

function adm2StartPhienAutoRefresh() {
  adm2StopPhienAutoRefresh();
  ADM2.phienTimer = setInterval(() => {
    if (ADM2.currentTab === 'phienbh') adm2LoadPhienDangMo();
  }, 15000);
}
function adm2StopPhienAutoRefresh() {
  if (ADM2.phienTimer) { clearInterval(ADM2.phienTimer); ADM2.phienTimer = null; }
}

// [v5.5] Mở giao diện giám sát BH (giống QLBH) cho ADMIN
function adm2OpenQLBHView() {
  if (typeof goToPage === 'function') {
    goToPage('banhang');
    // bhInitPage tự detect ADMIN → mở view QLBH
    setTimeout(() => { try { bhInitPage(); } catch(e){} }, 50);
  }
}

// [v8.1] Mở tab Nhân sự > Lịch sử duyệt
function adm2OpenLichSuDuyet() {
  if (typeof goToPage === 'function') {
    goToPage('nhansu');
    setTimeout(() => {
      try { setNSSubTab('lichsu'); } catch(e){}
    }, 100);
  }
}

async function adm2DongAllPhien() {
  const ok = await adm2Confirm('Force đóng TẤT CẢ phiên đang mở?', 'Hành động này không hoàn tác được. Tất cả phiên sẽ tính là Không mua.', true);
  if (!ok) return;
  try {
    const data = await adm2Rpc('fn_admin_dong_all_phien', { p_admin: SESSION.ma });
    adm2Toast('Đã đóng ' + (data.closed || 0) + ' phiên', 'success');
    adm2LoadPhienDangMo();
  } catch (e) { adm2Toast(e.message, 'error'); }
}

async function adm2XoaPhienTheoNgay() {
  const tu = document.getElementById('adm2-xoa-tu').value;
  const den = document.getElementById('adm2-xoa-den').value;
  if (!tu || !den) { adm2Toast('Chọn đủ 2 ngày', 'error'); return; }
  const ok1 = await adm2Confirm('Xóa phiên từ ' + tu + ' đến ' + den + '?', 'XÓA VĨNH VIỄN. Không thể khôi phục.', true);
  if (!ok1) return;
  const ok2 = await adm2Confirm('Thực sự chắc chắn?', 'Xác nhận xóa lần cuối.', true);
  if (!ok2) return;
  try {
    const data = await adm2Rpc('fn_admin_xoa_phien_theo_ngay', { p_admin: SESSION.ma, p_tu_ngay: tu, p_den_ngay: den });
    adm2Toast('Đã xóa ' + (data.deleted || 0) + ' phiên', 'success');
  } catch (e) { adm2Toast(e.message, 'error'); }
}

// ─── 4. CHẤM CÔNG TAB ─────────────────────────────────────
async function adm2DuyetAllCanhBao() {
  const ok = await adm2Confirm('Duyệt tất cả cảnh báo chưa xử lý?', 'Toàn bộ cảnh báo DA_GIAI_TRINH / CHUA_GIAI_TRINH sẽ chuyển thành DA_DUYET.');
  if (!ok) return;
  try {
    const data = await adm2Rpc('fn_admin_duyet_all_canh_bao', { p_admin: SESSION.ma });
    adm2Toast('Đã duyệt ' + (data.approved || 0) + ' cảnh báo', 'success');
  } catch (e) { adm2Toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
// [v10.86] CHUYỂN ĐỔI MÃ NV (CTV → NS)
// ═══════════════════════════════════════════════════════════════════
// [v13.99] Hướng chuyển đổi: 'CTV_NV' (mặc định) hoặc 'NV_CTV'. Logic chuyển/khóa mã giữ nguyên — chỉ đổi nhãn để rõ nghĩa.
let cdmHuong = 'CTV_NV';
function cdmSetHuong(h){
  cdmHuong = h;
  const isCtvNv = (h === 'CTV_NV');
  const b1 = document.getElementById('cdm-huong-ctvnv');
  const b2 = document.getElementById('cdm-huong-nvctv');
  if (b1) b1.classList.toggle('active', isCtvNv);
  if (b2) b2.classList.toggle('active', !isCtvNv);
  const roleCu = isCtvNv ? 'CTV' : 'Nhân viên';
  const roleMoi = isCtvNv ? 'Nhân viên' : 'CTV';
  const lblCu = document.getElementById('cdm-lbl-cu');
  const lblMoi = document.getElementById('cdm-lbl-moi');
  if (lblCu) lblCu.textContent = 'MÃ CŨ (' + roleCu + ')';
  if (lblMoi) lblMoi.textContent = 'MÃ MỚI (' + roleMoi + ')';
  const fFrom = document.getElementById('cdm-flow-from');
  const fTo = document.getElementById('cdm-flow-to');
  if (fFrom) fFrom.textContent = isCtvNv ? 'Cộng tác viên' : 'Nhân viên';
  if (fTo) fTo.textContent = isCtvNv ? 'Nhân viên' : 'Cộng tác viên';
  const cuInp = document.getElementById('cdm-cu-inp');
  const moiInp = document.getElementById('cdm-moi-inp');
  if (cuInp) cuInp.placeholder = 'Gõ mã hoặc tên ' + roleCu + ' (mã cũ)...';
  if (moiInp) moiInp.placeholder = 'Gõ mã hoặc tên ' + roleMoi + ' (mã mới, đã đồng bộ Sheet)...';
  const lydo = document.getElementById('cdm-lydo');
  if (lydo) lydo.placeholder = isCtvNv
    ? 'VD: CTV ký HĐ chính thức tháng 6/2026...'
    : 'VD: Chuyển nhân viên sang cộng tác viên tháng 6/2026...';
}

function cdmInit(){
  if (typeof _lsdLoadNVList === 'function' && !_lsdNVList) {
    _lsdLoadNVList().catch(()=>{});
  }
  cdmReset();
  if (typeof cdmSetHuong === 'function') cdmSetHuong(cdmHuong || 'CTV_NV');
}

function cdmReset(){
  ['cdm-cu-inp','cdm-cu-ma','cdm-moi-inp','cdm-moi-ma','cdm-lydo'].forEach(id=>{
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const pv = document.getElementById('cdm-preview'); if (pv){ pv.style.display='none'; pv.innerHTML=''; }
  const rs = document.getElementById('cdm-result'); if (rs){ rs.style.display='none'; rs.innerHTML=''; }
  ['cdm-cu-sug','cdm-moi-sug'].forEach(id=>{
    const el = document.getElementById(id); if (el) el.style.display='none';
  });
}

// ─── Autocomplete mã cũ ─────────────────────────────────
function cdmOnCuInput(){
  const inp = document.getElementById('cdm-cu-inp');
  const hid = document.getElementById('cdm-cu-ma');
  if (!inp.value.trim()){ hid.value=''; }
  cdmShowCuSug();
  cdmUpdatePreview();
}
async function cdmShowCuSug(){
  const inp = document.getElementById('cdm-cu-inp');
  const sug = document.getElementById('cdm-cu-sug');
  if (!inp || !sug) return;
  const list = await _lsdLoadNVList();
  const q = (inp.value || '').trim().toLowerCase();
  let matched;
  if (!q) matched = list.slice(0, 10);
  else matched = list.filter(nv =>
    (nv.ma_nv||'').toLowerCase().includes(q) || (nv.ten_nv||'').toLowerCase().includes(q)
  ).slice(0, 15);
  if (!matched.length){ sug.style.display='none'; return; }
  sug.innerHTML = matched.map(nv =>
    `<div onmousedown="event.preventDefault();cdmPickCu('${nv.ma_nv}','${(nv.ten_nv||'').replace(/'/g,"\\'")}','${nv.role||''}')"
       style="padding:9px 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid #F1F5F9"
       onmouseenter="this.style.background='#F8FAFC'" onmouseleave="this.style.background='#fff'">
      <div style="font-weight:600;color:#0F172A">${escHtml(nv.ten_nv||'')}</div>
      <div style="font-size:11px;color:#64748B">${escHtml(nv.ma_nv||'')}${nv.role && nv.role!=='NV' ? ' · '+escHtml(nv.role) : ''}</div>
    </div>`
  ).join('');
  sug.style.display='block';
}
function cdmHideCuSug(){
  setTimeout(()=>{const s=document.getElementById('cdm-cu-sug'); if(s) s.style.display='none';}, 200);
}
function cdmPickCu(ma, ten, role){
  document.getElementById('cdm-cu-inp').value = ten + ' (' + ma + ')';
  document.getElementById('cdm-cu-ma').value = ma;
  document.getElementById('cdm-cu-sug').style.display='none';
  cdmUpdatePreview();
}

// ─── Autocomplete mã mới ────────────────────────────────
function cdmOnMoiInput(){
  const inp = document.getElementById('cdm-moi-inp');
  const hid = document.getElementById('cdm-moi-ma');
  if (!inp.value.trim()){ hid.value=''; }
  cdmShowMoiSug();
  cdmUpdatePreview();
}
async function cdmShowMoiSug(){
  const inp = document.getElementById('cdm-moi-inp');
  const sug = document.getElementById('cdm-moi-sug');
  if (!inp || !sug) return;
  const list = await _lsdLoadNVList();
  const maCu = document.getElementById('cdm-cu-ma').value;
  const q = (inp.value || '').trim().toLowerCase();
  let matched;
  if (!q) matched = list.filter(nv => nv.ma_nv !== maCu).slice(0, 10);
  else matched = list.filter(nv =>
    nv.ma_nv !== maCu &&
    ((nv.ma_nv||'').toLowerCase().includes(q) || (nv.ten_nv||'').toLowerCase().includes(q))
  ).slice(0, 15);
  if (!matched.length){ sug.style.display='none'; return; }
  sug.innerHTML = matched.map(nv =>
    `<div onmousedown="event.preventDefault();cdmPickMoi('${nv.ma_nv}','${(nv.ten_nv||'').replace(/'/g,"\\'")}','${nv.role||''}')"
       style="padding:9px 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid #F1F5F9"
       onmouseenter="this.style.background='#F8FAFC'" onmouseleave="this.style.background='#fff'">
      <div style="font-weight:600;color:#0F172A">${escHtml(nv.ten_nv||'')}</div>
      <div style="font-size:11px;color:#64748B">${escHtml(nv.ma_nv||'')}${nv.role && nv.role!=='NV' ? ' · '+escHtml(nv.role) : ''}</div>
    </div>`
  ).join('');
  sug.style.display='block';
}
function cdmHideMoiSug(){
  setTimeout(()=>{const s=document.getElementById('cdm-moi-sug'); if(s) s.style.display='none';}, 200);
}
function cdmPickMoi(ma, ten, role){
  document.getElementById('cdm-moi-inp').value = ten + ' (' + ma + ')';
  document.getElementById('cdm-moi-ma').value = ma;
  document.getElementById('cdm-moi-sug').style.display='none';
  cdmUpdatePreview();
}

// ─── Preview số bản ghi sẽ chuyển ───────────────────────
async function cdmUpdatePreview(){
  const maCu = document.getElementById('cdm-cu-ma').value;
  const maMoi = document.getElementById('cdm-moi-ma').value;
  const pv = document.getElementById('cdm-preview');
  if (!maCu || !maMoi){ pv.style.display='none'; return; }
  if (maCu === maMoi){
    pv.style.display='block';
    pv.innerHTML = '<div style="color:#DC2626;font-weight:600">⚠ Mã cũ và mã mới giống nhau</div>';
    return;
  }
  pv.style.display='block';
  pv.innerHTML = '<div style="color:#64748B;font-size:12px">⏳ Đang đếm bản ghi...</div>';
  try {
    const [cc, cb, dn, lc, pbh, tht] = await Promise.all([
      supa.from('cham_cong').select('id', {count:'exact', head:true}).eq('ma_nv', maCu),
      supa.from('canh_bao').select('id', {count:'exact', head:true}).eq('ma_nv', maCu),
      supa.from('don_nghi').select('ma_nv', {count:'exact', head:true}).eq('ma_nv', maCu),
      supa.from('lich_ca').select('ma_nv', {count:'exact', head:true}).eq('ma_nv', maCu),
      supa.from('phien_ban_hang').select('id', {count:'exact', head:true}).eq('ma_nv', maCu),
      supa.from('tong_hop_thang').select('ma_nv', {count:'exact', head:true}).eq('ma_nv', maCu)
    ]);
    const tong = (cc.count||0)+(cb.count||0)+(dn.count||0)+(lc.count||0)+(pbh.count||0)+(tht.count||0);
    pv.innerHTML = `
      <div style="font-weight:700;color:#0F172A;margin-bottom:8px;font-size:12.5px">
        Mã số sẽ chuyển từ <code style="background:#fff;padding:2px 6px;border-radius:4px;color:#DC2626">${escHtml(maCu)}</code>
        → <code style="background:#fff;padding:2px 6px;border-radius:4px;color:#16A34A">${escHtml(maMoi)}</code>:
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:11.5px">
        <div style="background:#fff;padding:6px 8px;border-radius:6px"><b>${cc.count||0}</b> chấm công</div>
        <div style="background:#fff;padding:6px 8px;border-radius:6px"><b>${cb.count||0}</b> cảnh báo</div>
        <div style="background:#fff;padding:6px 8px;border-radius:6px"><b>${dn.count||0}</b> đơn nghỉ</div>
        <div style="background:#fff;padding:6px 8px;border-radius:6px"><b>${lc.count||0}</b> lịch ca</div>
        <div style="background:#fff;padding:6px 8px;border-radius:6px"><b>${pbh.count||0}</b> phiên bán hàng</div>
        <div style="background:#fff;padding:6px 8px;border-radius:6px"><b>${tht.count||0}</b> tổng hợp tháng</div>
      </div>
      <div style="margin-top:8px;font-size:11.5px;color:#475569">
        + các bảng phụ (BXH, checklist, thông báo, ...). <b>Tổng ~${tong}+</b> bản ghi.
      </div>`;
  } catch(e){
    pv.innerHTML = '<div style="color:#DC2626;font-size:12px">Lỗi đếm preview: '+escHtml(e.message||'')+'</div>';
  }
}

// ─── Confirm + Call RPC ─────────────────────────────────
async function cdmConfirm(){
  const maCu = document.getElementById('cdm-cu-ma').value;
  const maMoi = document.getElementById('cdm-moi-ma').value;
  const lyDo = document.getElementById('cdm-lydo').value.trim();
  if (!maCu){ showToast('Vui lòng chọn mã cũ', 'err'); return; }
  if (!maMoi){ showToast('Vui lòng chọn mã mới', 'err'); return; }
  if (maCu === maMoi){ showToast('Mã cũ và mã mới giống nhau', 'err'); return; }

  if (!SESSION || (SESSION.vaiTro !== 'ADMIN' && SESSION.vaiTro !== 'QLNS')){
    showToast('Chỉ ADMIN hoặc QLNS được phép', 'err'); return;
  }

  const ok1 = await appConfirm(
    `Chuyển toàn bộ data từ ${maCu} sang ${maMoi}?\nMã cũ sẽ bị khóa (DA_CHUYEN_MA), không đăng nhập được nữa.\nKHÔNG THỂ HOÀN TÁC.`,
    { title:'Xác nhận chuyển đổi mã NV', okLabel:'Chuyển đổi', danger:true }
  );
  if (!ok1) return;

  const ok2 = await appConfirm(
    `Bạn chắc chắn 100% chuyển ${maCu} → ${maMoi}?`,
    { title:'Xác nhận lần cuối', okLabel:'Chắc chắn', danger:true }
  );
  if (!ok2) return;

  const btn = document.getElementById('cdm-btn-go');
  if (btn){ btn.disabled = true; btn.textContent = '⏳ Đang chuyển...'; btn.style.opacity = '0.6'; }

  try {
    const { data, error } = await supa.rpc('fn_chuyen_doi_ma_nv', {
      p_admin: SESSION.ma,
      p_ma_cu: maCu,
      p_ma_moi: maMoi,
      p_ly_do: lyDo || null
    });
    if (error) throw error;
    if (!data || !data.success) throw new Error('RPC trả về không thành công');

    const c = data.count || {};
    const tong = Object.values(c).reduce((s,n)=>s+(n||0), 0);
    const rs = document.getElementById('cdm-result');
    rs.style.display = 'block';
    rs.innerHTML = `
      <div style="background:#F0FDF4;border:1.5px solid #16A34A;border-radius:10px;padding:14px">
        <div style="font-weight:700;color:#15803D;font-size:14px;margin-bottom:8px">✓ Chuyển đổi thành công</div>
        <div style="font-size:12.5px;color:#0F172A;margin-bottom:10px;line-height:1.6">
          <b>${escHtml(data.ten_cu||'')}</b> (<code>${escHtml(data.ma_cu||'')}</code>)
          → <b>${escHtml(data.ten_moi||'')}</b> (<code>${escHtml(data.ma_moi||'')}</code>)<br>
          Lúc: ${escHtml(data.thoi_gian||'')} bởi ${escHtml(data.admin||'')}
        </div>
        <div style="font-weight:600;color:#475569;font-size:11.5px;margin-bottom:6px">Chi tiết bản ghi đã chuyển (tổng: ${tong}):</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px;font-size:11.5px">
          ${Object.entries(c).map(([k,v]) => 
            `<div style="background:#fff;padding:5px 8px;border-radius:5px;border:1px solid #DCFCE7">
              <code style="color:#475569">${escHtml(k)}</code>: <b>${v}</b>
            </div>`
          ).join('')}
        </div>
        <div style="margin-top:10px;font-size:11.5px;color:#15803D;background:#fff;padding:8px;border-radius:6px">
          Mã <code>${escHtml(data.ma_cu||'')}</code> đã được đánh dấu <code>DA_CHUYEN_MA</code> + ghi chú lịch sử.
        </div>
      </div>`;
    showToast('✓ Đã chuyển ' + tong + ' bản ghi', 'ok');
    document.getElementById('cdm-cu-inp').value = '';
    document.getElementById('cdm-cu-ma').value = '';
    document.getElementById('cdm-moi-inp').value = '';
    document.getElementById('cdm-moi-ma').value = '';
    document.getElementById('cdm-lydo').value = '';
    document.getElementById('cdm-preview').style.display = 'none';
    try { if (typeof _lsdNVList !== 'undefined') _lsdNVList = null; } catch(e){}
  } catch(e){
    console.error('[cdmConfirm] Lỗi:', e);
    showToast('Lỗi: ' + (e.message || e), 'err');
    const rs = document.getElementById('cdm-result');
    rs.style.display = 'block';
    rs.innerHTML = `<div style="background:#FEF2F2;border:1.5px solid #DC2626;border-radius:10px;padding:12px;color:#991B1B;font-size:12.5px">
      <b>✗ Lỗi chuyển đổi:</b><br>${escHtml(e.message || String(e))}
    </div>`;
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = 'Chuyển đổi'; btn.style.opacity = '1'; }
  }
}
