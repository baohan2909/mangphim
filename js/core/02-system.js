// ════════════════════════════════════════════════════════════════════
// [v10.85] HỆ THỐNG CÀI ĐẶT (Settings)
// ════════════════════════════════════════════════════════════════════
window.APP_SETTINGS = {};
// Defaults — fallback khi setting chưa load hoặc DB chưa có key
window.APP_SETTINGS_DEFAULTS = {
  'cc.fresh_seconds': 60,
  'cc.gps_radius_m': 100,
  'cc.gps_weak_threshold_m': 100,
  'cc.bo_sung_lui_days': 1,
  'cc.bo_sung_quota_thang': 3,
  'cc.bo_sung_chan_gio': 22,
  'cc.auto_close_gio': 0,
  'cc.nhac_chamcong_bat': true,
  'cc.nhac_chamcong_gio': '21:45',
  'np.bat_buoc_anh': true,
  'np.toi_thieu_truoc_ngay': 0,
  'duyet.auto_gps_yeu_m': 0,
  'duyet.auto_bo_sung_cung_ch': false,
  'duyet.gui_tb_qlns_bo_sung': true,
  'ui.nv_xem_bxh': true,
  'ui.bxh_top_n': 10,
  'ui.persistent_login': true,
  'ui.session_expire_days': 7,
  'lichhd.enabled': true,
  'sys.maintenance_mode': false,
  'sys.maintenance_message': 'Hệ thống đang bảo trì, vui lòng quay lại sau.',
  'sys.force_logout_ts': 0,
  'sys.cache_version': 'v17.40',
  'chk.bat': true,
  'chk.nhac_bat': true,
  'chk.gio_nhac': '09:00',
  'chk.bat_buoc_anh_khan_cap': false,
  'chk.tb_quanly': true,
  // [v10.85] Lịch ca
  'lc.cho_phep_tuan_hien_tai': false
};

function _getSetting(key, defaultValue){
  let v;
  if (window.APP_SETTINGS && window.APP_SETTINGS[key] !== undefined) {
    v = window.APP_SETTINGS[key];
  } else if (window.APP_SETTINGS_DEFAULTS && window.APP_SETTINGS_DEFAULTS[key] !== undefined) {
    v = window.APP_SETTINGS_DEFAULTS[key];
  } else {
    return defaultValue;
  }
  // [v10.85] Normalize string "true"/"false" về boolean (JSONB từ DB có thể trả về chuỗi)
  if (typeof v === 'string') {
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return v;
}

async function _loadAllSettings(){
  if (!supa) return;
  try {
    const { data, error } = await supa.rpc('fn_get_all_settings');
    if (!error && data) {
      // data là jsonb object { key: value }
      window.APP_SETTINGS = data;
      // Cache vào sessionStorage để khởi động nhanh
      try { sessionStorage.setItem('_app_settings', JSON.stringify(data)); } catch(e){}
      console.log('[settings] loaded', Object.keys(data).length, 'keys');
      _applySettingsToRuntime();
    }
  } catch(e){ console.warn('[loadSettings]', e.message); }
}

// Áp settings ngay sau khi load (cho biến runtime cần đổi)
function _applySettingsToRuntime(){
  // Force logout: nếu session_login_ts < force_logout_ts → kick
  try {
    const forceTs = Number(_getSetting('sys.force_logout_ts', 0));
    const loginTs = Number(localStorage.getItem('session_login_ts') || '0');
    if (forceTs > 0 && loginTs > 0 && (loginTs/1000) < forceTs) {
      console.log('[settings] force logout — login trước force_ts');
      try { localStorage.removeItem('session_cc'); localStorage.removeItem('session_login_ts'); } catch(e){}
      if (typeof showToast === 'function') showToast('Phiên đã hết hạn do admin reset, vui lòng đăng nhập lại', 'warn');
      setTimeout(()=>location.reload(), 1500);
      return;
    }
  } catch(e){}
  // Bảo trì: nếu bật + user không phải ADMIN → hiển thị banner chặn
  try {
    const maintMode = _getSetting('sys.maintenance_mode', false);
    if (maintMode === true || maintMode === 'true') {
      _showMaintenanceBanner(_getSetting('sys.maintenance_message', 'Bảo trì'));
    } else {
      _hideMaintenanceBanner();
    }
  } catch(e){}
}

function _showMaintenanceBanner(msg){
  if (SESSION && (String(SESSION.vaiTro||'').toUpperCase() === 'ADMIN')) return; // ADMIN không bị chặn
  let el = document.getElementById('maintenance-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'maintenance-banner';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(90deg,#F59E0B,#DC2626);color:#fff;text-align:center;padding:10px 14px;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.2)';
    document.body.appendChild(el);
  }
  el.innerHTML = '🔧 ' + msg;
  document.body.style.paddingTop = '40px';
}
function _hideMaintenanceBanner(){
  const el = document.getElementById('maintenance-banner');
  if (el) { el.remove(); document.body.style.paddingTop = ''; }
}

// Load cached settings sớm (trước khi RPC về) để có gì áp ngay
try {
  const cached = sessionStorage.getItem('_app_settings');
  if (cached) window.APP_SETTINGS = JSON.parse(cached);
} catch(e){}

// [v10.85 Yc #3] Cache-busting — tránh browser/Apps Script serve data cũ
// Wrap fetch gốc để tự thêm `_t=<ts>` vào mọi GET tới SCRIPT_URL
// [v11] Ngoài ra: nếu role=CUA_HANG → tự inject cuaHang=<maCH> để lọc phạm vi
const _fetchGoc = window.fetch.bind(window);
window.fetch = function(url, opts){
  if(typeof url === 'string' && url.indexOf(SCRIPT_URL) === 0 && (!opts || (opts.method||'GET').toUpperCase()==='GET')){
    url += (url.indexOf('?')>=0 ? '&' : '?') + '_t' + '=' + Date.now();

    // [v11] Inject cuaHang filter cho role CUA_HANG (chỉ cho các endpoint liên quan)
    // [v13.08] FIX: dùng SESSION trực tiếp (window.SESSION undefined vì SESSION là top-level let)
    try {
      if (typeof SESSION !== 'undefined' && SESSION && SESSION.vaiTro === 'CUA_HANG' && SESSION.cuaHangMa) {
        // Danh sách endpoint cần lọc theo CH
        const needFilterCH = /type=(nhansu|lichca_ql|don_nghi_phep|dashboard|duyet_yeu_cau|lich_su_duyet)(&|$)/.test(url);
        if (needFilterCH && !/[&?]cuaHang=/.test(url) && !/[&?]maCH=/.test(url)) {
          url += '&cuaHang=' + encodeURIComponent(SESSION.cuaHangMa);
        }
      }
    } catch(e){}
  }
  return _fetchGoc(url, opts);
};

// ═══════════════════════════════════════════════════════════
// [v10.8] AUTO-RETRY — Tự động gửi lại khi server bận (tránh hiện "lỗi kết nối" không cần thiết)
// - Tối đa 3 lần, delay: 1s → 2s → 4s (exponential backoff)
// - RETRY khi: fetch reject (network error) / HTTP 5xx / HTTP 429 / HTTP 503
// - KHÔNG retry khi: response 2xx nhưng logic trả {success:false} (đó là lỗi nghiệp vụ)
// - Sau lần retry thứ 2 sẽ gọi onProgress(attempt) để UI cập nhật "Đang gửi lại..."
// ═══════════════════════════════════════════════════════════
function _fetchRetry(url, opts, onProgress){
  const MAX_TRIES = 3;
  const DELAYS = [1000, 2000, 4000]; // ms
  let attempt = 0;
  function _once(){
    return fetch(url, opts).then(r=>{
      // Server trả response nhưng status lỗi tạm thời → retry
      if(!r.ok && (r.status===429 || r.status===503 || (r.status>=500 && r.status<=599))){
        throw new Error('HTTP_'+r.status+'_RETRY');
      }
      return r;
    });
  }
  function _tryNext(){
    return _once().catch(err=>{
      attempt++;
      if(attempt >= MAX_TRIES) throw err;
      // Báo UI từ lần thứ 2 trở đi (lần 1 silent, tránh nháy không cần thiết)
      if(attempt >= 1 && typeof onProgress==='function') {
        try { onProgress(attempt+1, MAX_TRIES); } catch(e){}
      }
      return new Promise(res=>setTimeout(res, DELAYS[attempt-1]||4000))
        .then(()=>_tryNext());
    });
  }
  return _tryNext();
}

let SESSION=null, CH_LIST=[], currentPage='chamcong';
let state={loai:null,btnId:null,lat:null,lng:null,gpsAcc:null,gpsOk:false,selfieB64:null,selfieOk:false,submitting:false,submitted:false};
const logs=[];
let cameraStream=null;
let gcThang='', gcData=[], gcThangQL='', gcDataQL=[];
let lastDay=new Date().getDate();

// ─── CLOCK + AUTO LOGOUT ────────────────────────────────────
function pad(n){return String(n).padStart(2,'0');}

// [v10.85] Tính thời điểm 00:00 thứ Hai gần nhất TRƯỚC hoặc BẰNG thời điểm given
function _getMondayMidnight(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  // getDay(): 0=CN, 1=T2, ..., 6=T7
  // Số ngày cần trừ để về T2
  const day = x.getDay();
  const diff = day === 0 ? 6 : (day - 1);  // CN → trừ 6, T2 → trừ 0
  x.setDate(x.getDate() - diff);
  return x.getTime();
}

function tick(){
  const d=new Date(),days=['CN','T2','T3','T4','T5','T6','T7'];
  const el=document.getElementById('clock');
  if(el)el.textContent=days[d.getDay()]+' '+pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear()+' · '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());

  // [v10.85] Check session theo settings:
  //  - ui.persistent_login = false → logout mỗi lần đóng tab (chuyển localStorage → sessionStorage)
  //  - ui.session_expire_days → logout nếu login > N ngày
  if(SESSION){
    try {
      const loginTime = parseInt(localStorage.getItem('session_login_ts') || '0', 10);
      const persistOn = _getSetting('ui.persistent_login', true);
      const expireDays = Number(_getSetting('ui.session_expire_days', 7));
      if(loginTime > 0){
        // [v10.85] Persistent login tắt → coi mỗi lần mở tab mới là phải login (đơn giản: dùng sessionStorage_flag)
        if (persistOn === false || persistOn === 'false') {
          // Nếu tab này chưa từng "thấy" session (sessionStorage trống) → logout
          if (!sessionStorage.getItem('_tab_seen')) {
            localStorage.removeItem('session_cc'); localStorage.removeItem('session_login_ts');
            SESSION = null;
            location.reload();
            return;
          }
        }
        // Hết hạn theo ngày
        const expireMs = expireDays * 24 * 60 * 60 * 1000;
        if (loginTime > 0 && (Date.now() - loginTime) > expireMs) {
          localStorage.removeItem('session_cc');
          localStorage.removeItem('session_login_ts');
          SESSION = null;
          alert('Phiên đăng nhập đã quá ' + expireDays + ' ngày. Vui lòng đăng nhập lại.');
          location.reload();
          return;
        }
        // Giữ logic cũ: logout sang tuần mới (bỏ — thay bằng expireDays)
      }
      // Đánh dấu tab đã có session
      try { sessionStorage.setItem('_tab_seen', '1'); } catch(e){}
    } catch(e){}
  }
}
setInterval(tick,1000);tick();

// ═══════════════════════════════════════════════════════════
// [v10.85 Yc #5] VERSION CHECK — phát hiện deploy mới → banner 5s → reload
// [v12-P3] Đã tắt vì không còn Apps Script
// ═══════════════════════════════════════════════════════════
let _appVersion = null;
function _kiemTraVersion(){
  // Disabled - Supabase deploy không cần check version
  return;
}
function _hienBannerReload(newVer){
  if(document.getElementById('_ver-banner'))return;
  const el=document.createElement('div');
  el.id='_ver-banner';
  el.style.cssText='position:fixed;top:0;left:0;right:0;background:linear-gradient(90deg,#0F766E,#06b6d4);color:white;padding:12px 16px;z-index:10000;text-align:center;font-weight:700;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.3);animation:slideDown .3s';
  el.innerHTML=`🎉 Có phiên bản mới (${newVer}) — tự động tải lại sau <span id="_ver-sec">5</span>s. <button onclick="location.reload()" style="margin-left:8px;background:white;color:#0F766E;border:none;padding:4px 12px;border-radius:6px;font-weight:700;cursor:pointer">Tải ngay</button>`;
  document.body.appendChild(el);
  let s=5;
  const iv=setInterval(()=>{
    s--;
    const se=document.getElementById('_ver-sec');
    if(se)se.textContent=s;
    if(s<=0){clearInterval(iv);location.reload();}
  },1000);
}
// Poll version mỗi 90 giây
setInterval(_kiemTraVersion, 90000);
setTimeout(_kiemTraVersion, 2000); // gọi lần đầu sau 2s để set baseline

// ═══════════════════════════════════════════════════════════
// [v10.85 Yc #4] NOTIFICATION — Browser Notification API + poll thông báo
// ═══════════════════════════════════════════════════════════
let _tbLastTs = 0;
let _tbPermRequested = false;

function _xinQuyenThongBao(){
  if(!('Notification' in window))return;
  if(Notification.permission==='default' && !_tbPermRequested){
    _tbPermRequested=true;
    Notification.requestPermission().catch(()=>{});
  }
}
function _hienThongBaoNative(tb){
  if(!('Notification' in window) || Notification.permission!=='granted')return;
  try{
    const n=new Notification(tb.tieuDe,{
      body: tb.noiDung,
      icon: '',
      tag:  tb.id, // tránh trùng lặp
      badge:'',
      silent:false,
    });
    n.onclick=()=>{
      window.focus();
      if(tb.loai==='DON_DUYET'||tb.loai==='DON_TUCHOI') goToPage('donnghi-acc');
      n.close();
    };
    setTimeout(()=>n.close(), 8000);
  } catch(e){}
}
function _pollThongBao(){
  if(!SESSION)return;
  // [v12-P3] Supabase RPC
  const sinceParam = _tbLastTs ? new Date(_tbLastTs).toISOString() : null;
  supa.rpc('fn_get_thong_bao', { p_ma_nv: SESSION.ma, p_since: sinceParam })
  .then(({ data: arr, error }) => {
    if(error || !Array.isArray(arr))return;
    const list = arr.filter(tb=>!tb.daDoc);
    if(!list.length)return;
    list.forEach(tb=>{
      const ts = tb.createdAt ? new Date(tb.createdAt).getTime() : 0;
      if(ts > _tbLastTs) _tbLastTs = ts;
    });
    list.forEach(tb=>{
      _hienThongBaoNative({
        id: tb.id, tieuDe: tb.tieuDe, noiDung: tb.noiDung, loai: tb.loai
      });
      showToast(tb.tieuDe+'\n'+(tb.noiDung||''),
        (tb.loai && tb.loai.indexOf('TUCHOI')>=0) ? 'err' : 'ok');
    });
    // [v12-FIX] KHÔNG đánh dấu đã đọc khi poll — chỉ mark khi user mở panel xem
  }).catch(()=>{});
}
// Poll thông báo mỗi 45 giây (chỉ khi đã đăng nhập)
// [v11.7 perf] Skip khi tab ẩn để tiết kiệm tài nguyên & API quota
setInterval(()=>{
  if(SESSION && !document.hidden) _pollThongBao();
}, 45000);

// ─── NAVIGATION ─────────────────────────────────────────────
const PAGE_TITLES={
  'home':      '',
  'donhang':   '',
  'donhang-nhan': '',
  'donhang-ql': '',
  'lichca':    'LỊCH LÀM VIỆC',
  'lichca-ql': 'LỊCH CA HỆ THỐNG',
  'lichhd-ch': 'LỊCH HOẠT ĐỘNG',
  'lichhd-ql': 'LỊCH HOẠT ĐỘNG CỬA HÀNG',
  chamcong:'CHẤM CÔNG', giocong:'GIỜ CÔNG CỦA TÔI',
  'giocong-ql':'GIỜ CÔNG TOÀN HỆ THỐNG',
  taikhoan:'TÀI KHOẢN', bandochidung:'BẢN ĐỒ CỬA HÀNG',
  nhansu:'NHÂN SỰ HÔM NAY',
  dashboard:'DASHBOARD QUẢN LÝ',
  // [v10]
  'donnghi-acc':'ĐƠN NGHỈ PHÉP',
  'duyetyc':   'DUYỆT YÊU CẦU',
  // [v10.85]
  'giaodien':  'GIAO DIỆN',
  // [v11]
  'banhang':   'BÁN HÀNG',
  // [v12]
  'admin':     '🛠️ ADMIN',
  // [v10.85]
  'checklist': 'KIỂM TRA CỬA HÀNG',
  'checklist-ql': 'SỰ CỐ CỬA HÀNG',
  // [v10.85]
  'chuongtrinh': 'CHƯƠNG TRÌNH KHUYẾN MÃI',
  // [v11 muanon]
  'muanon':       'MẪU NÓN HÀNG TUẦN',
  'muanon-admin': 'QUẢN LÝ MẪU NÓN',
  // [v13.19 bàn giao] thay thế checklist
  'bangiao':    'BÀN GIAO CA',
  'bangiao-ql': 'QUẢN LÝ BÀN GIAO',
  // [v13.41]
  'nvai':       'NHÂN VIÊN AI',
};
// ─── [v13.49] PHÂN QUYỀN DUYỆT/QUẢN LÝ NHÂN SỰ ─────────────────────────
// Duyệt chấm công / nhân sự / lịch ca / nghỉ phép: CHỈ ADMIN + QLNS.
// CH và các loại QL khác (QLBH...) đều KHÔNG được.
function _canQuanLyNS(){
  if(!(typeof SESSION!=='undefined' && SESSION)) return false;
  if(SESSION.vaiTro==='ADMIN' || SESSION.vaiTro==='QLNS') return true;
  // [A2b] chức danh ĐÃ cấu hình quyền quản lý nhân sự (cộng thêm — không gỡ của ADMIN/QLNS)
  if(typeof _quyenCauHinh==='function'){
    return _quyenCauHinh('nhansu.xem') || _quyenCauHinh('nhansu.quanly') ||
           _quyenCauHinh('duyetyc.duyet') || _quyenCauHinh('lichca.quanly') ||
           _quyenCauHinh('giocong.xem_all') || _quyenCauHinh('giocong.duyet_cb');
  }
  return false;
}
// Trả về true nếu ĐÃ chặn (không có quyền) → hàm gọi nên return ngay
function _chanQuanLyNS(){
  if(_canQuanLyNS()) return false;
  if(typeof showToast==='function') showToast('Bạn không có quyền truy cập mục quản lý nhân sự', 'warn');
  const r = (SESSION&&SESSION.vaiTro==='CUA_HANG') ? 'banhang'
          : (SESSION&&SESSION.vaiTro==='ADMIN')    ? 'home'
          : 'chamcong';
  setTimeout(()=>{ try{ goToPage(r); }catch(e){} }, 50);
  return true;
}

function goToPage(page){
  currentPage=page;
  // [v15.2] Rời trang → dọn thanh "chọn nhiều" của Bàn giao (thanh fixed, nếu không dọn sẽ
  // lơ lửng đè lên trang khác khiến nút bấm không ăn).
  if (typeof bgqlForceExitMultiSelect === 'function') bgqlForceExitMultiSelect();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  // [v13.43] HOME HUB: ẩn main-header + bottom-nav (hub có header riêng).
  // [v13.44] page donhang cũng dark full-screen → ẩn như home.
  // Các page khác: hiện lại (nvai sẽ tự ẩn bottom-nav qua nvaiPageInit).
  const _mh = document.getElementById('main-header');
  const _bn = document.getElementById('bottom-nav');
  if (page === 'home' || page === 'donhang' || page === 'donhang-nhan' || page === 'donhang-ql') {
    if (_mh) _mh.style.display = 'none';
    if (_bn) _bn.style.display = 'none';
    if (page === 'home' && typeof hubRenderHeader === 'function') hubRenderHeader();
  } else {
    if (_mh) _mh.style.display = 'block';
    if (_bn) _bn.style.display = '';
  }
  const navEl=document.getElementById('nav-'+page);
  if(navEl)navEl.classList.add('active');
  // Giờ công: active nav-giocong cho cả 2 page
  if(page==='giocong'||page==='giocong-ql') document.getElementById('nav-giocong').classList.add('active');
  // Lịch ca: active nav-lichca cho cả NV và QLNS [SỬA v8]
  if(page==='lichca'||page==='lichca-ql'||page==='lichhd-ch'){
    const lcNav=document.getElementById('nav-lichca');
    if(lcNav)lcNav.classList.add('active');
  }
  // [v17.40] Khách Online: nav id 'nav-khachonline' nhưng page 'donhang-nhan'
  if(page==='donhang-nhan'){ const koNav=document.getElementById('nav-khachonline'); if(koNav)koNav.classList.add('active'); }
  document.getElementById('header-page-title').textContent=PAGE_TITLES[page]||'';
  // [v11.8+] Force scroll về 0 mỗi lần đổi trang để header xanh không bị che
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  requestAnimationFrame(() => { window.scrollTo(0, 0); });
  setTimeout(() => { window.scrollTo(0, 0); }, 150);
  if(page==='giocong')    taiGioCong();
  if(page==='giocong-ql') taiGioCongQL();
  if(page==='taikhoan'){renderTaiKhoan();_silentUpdateAccBadges();}
  if(page==='bandochidung')khoiDongBanDo();
  if(page==='nhansu'){
    taiNhanSu();startNSPolling();
    // [v10.85] Show tab "Lịch sử chấm công" chỉ cho ADMIN
    const btnLSCC = document.getElementById('nssub-lichsucc');
    if (btnLSCC) btnLSCC.style.display = (SESSION && SESSION.vaiTro === 'ADMIN') ? '' : 'none';
    // [v10.86] Show tab "Chuyển đổi mã" cho ADMIN + QLNS
    const btnCDM = document.getElementById('nssub-chuyenma');
    if (btnCDM) btnCDM.style.display = (SESSION && (SESSION.vaiTro === 'ADMIN' || SESSION.vaiTro === 'QLNS')) ? '' : 'none';
  }
  if(page==='lichca')   taiLichCa();
  if(page==='lichca-ql') taiLichCaQL();
  if(page==='chamcong' && typeof tcRefreshBanner==='function') setTimeout(tcRefreshBanner, 300); // [v17.40] Trưởng ca
  if(page==='banhang' && SESSION && SESSION.vaiTro==='CUA_HANG' && typeof tcRefreshBanner==='function') setTimeout(tcRefreshBanner, 300); // [v17.40] thẻ TC cho cửa hàng
  if(page==='dashboard') taiDashboard(); // [FIX v9 #12]
  if(page==='donnghi-acc') taiDonNghiACC(); // [v10 Yc #4]
  if(page==='duyetyc')     taiDuyetYC();    // [v10 Yc #5]
  if(page==='giaodien')    _capNhatGDUI(); // [v10.85]
  if(page==='banhang')     bhInitPage();    // [v11] Init module bán hàng
  if(page==='admin')       adm2InitPage(); // [v12 v2]
  if(page==='checklist')   chkInitPage();   // [v10.85] Checklist cửa hàng (retire — fallback)
  if(page==='checklist-ql') chkqlInitPage(); // [v10.85] Quản lý sự cố (retire — fallback)
  if(page==='bangiao')      bgInitPage();    // [v13.19] Bàn giao ca
  if(page==='bangiao-ql')   bgqlInitPage();  // [v13.19] QL bàn giao
  if(page==='nvai')         { if(typeof nvaiPageInit==='function') nvaiPageInit(); }  // [v13.41] Nhân viên AI
  else { if(typeof nvaiPageLeave==='function') nvaiPageLeave(); }
  if(page==='donhang')      { if(typeof dhDieuPhoiInit==='function') dhDieuPhoiInit(); }  // [v13.44] Đơn hàng Online
  if(page==='donhang-nhan') { if(typeof dhNhanInit==='function') dhNhanInit(); }  // [v13.45] CH nhận đơn
  else { if(typeof dhNhanLeave==='function') dhNhanLeave(); }
  if(page==='donhang-ql')   { if(typeof dhQLInit==='function') dhQLInit(); }  // [v13.46] Quản lý đơn hàng
  else { if(typeof dhQLLeave==='function') dhQLLeave(); }
  if(page==='chuongtrinh')  ctInitPage();    // [v10.85] Chương trình KM
  if(page!=='nhansu') stopNSPolling();
}
// Tab Giờ công: NV → giocong, QLNS → giocong-ql
function navGioCong(){
  const isQL=SESSION&&(SESSION.vaiTro==='QLNS'||SESSION.vaiTro==='ADMIN');
  goToPage(isQL?'giocong-ql':'giocong');
}

// ─── [v13.43] HOME HUB ──────────────────────────────────────
// Điền tên + avatar (chữ cái đầu) vào header hub
function hubRenderHeader(){
  if(typeof SESSION==='undefined'||!SESSION) return;
  const nameEl=document.getElementById('hub-uname');
  if(nameEl) nameEl.textContent=SESSION.ten||SESSION.ma||'--';
  const avEl=document.getElementById('hub-avatar');
  if(avEl){
    const t=(SESSION.ten||SESSION.ma||'?').trim();
    const initials=t.split(/\s+/).filter(Boolean).slice(-2).map(w=>w[0]||'').join('').toUpperCase().slice(0,2);
    avEl.textContent=initials||'?';
  }
  // [v13.51] Lời chào động theo giờ
  const greetEl=document.getElementById('hub-greeting');
  if(greetEl){
    const h=new Date().getHours();
    const g = h<11 ? 'Chào buổi sáng' : h<14 ? 'Chào buổi trưa' : h<18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    const ten=(SESSION.ten||'').trim().split(/\s+/).slice(-1)[0] || '';
    greetEl.textContent = ten ? (g + ', ' + ten) : g;
  }
  // [v13.51] Thẻ Đơn hàng Online: demo chỉ NS00490 thấy, admin khác ẩn
  const dhCard=document.getElementById('hub-card-donhang');
  if(dhCard){
    const cheDo=(typeof _getSetting==='function')?_getSetting('donhang.che_do','demo'):'demo';
    const show=(cheDo==='live')||(SESSION.ma==='NS00490');
    dhCard.style.display = show ? '' : 'none';
  }
}

// ═══ [v13.51] HUB SUBMENU — gom chức năng con theo phân hệ ═══════════════
// Bấm thẻ Hub → mở submenu các chức năng con (không mất menu nào).
// Quyền: ADMIN thấy hết; role khác theo `roles` của từng mục.
const _hubIc = {
  cc:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  map:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
  cal:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  face: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  box:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  img:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
};
const HUB_GROUPS = {
  cc_ns: {
    title: 'Chấm công & Nhân sự',
    items: [
      { label:'Chấm công',          desc:'Vào ca / ra ca',        ic:_hubIc.cc,    roles:['NV','CTV'],               quyen:'chamcong.tu_cham', act:()=>goToPage('chamcong') },
      { label:'Giờ công',           desc:'Bảng công của tôi',     ic:_hubIc.clock, roles:['NV','CTV'],               quyen:'giocong.xem_minh', act:()=>navGioCong() },
      { label:'Bản đồ chấm công',   desc:'Vị trí chấm công',      ic:_hubIc.map,   roles:['NV','CTV'],               quyen:'bando.xem',        act:()=>goToPage('bandochidung') },
      { label:'Lịch ca của tôi',    desc:'Ca làm trong tuần',     ic:_hubIc.cal,   roles:['NV','CTV'],               quyen:'lichca.xem_minh',  act:()=>moLichCa() },
      { label:'Bổ sung ca',         desc:'Đề nghị thêm ca',       ic:_hubIc.plus,  roles:['NV','CTV'],               quyen:'donnghi.tao',      act:()=>moModalBoSungCa() },
      { label:'Đăng ký khuôn mặt',  desc:'Cập nhật khuôn mặt',    ic:_hubIc.face,  roles:['NV','CTV'],               act:()=>nsFaceOpenEnrollment() },
      { label:'Nhân sự',            desc:'Quản lý nhân viên',     ic:_hubIc.users, roles:['QLNS'],                   quyen:'nhansu.xem',       act:()=>goToPage('nhansu') },
      { label:'Lịch ca hệ thống',   desc:'Xếp ca toàn hệ thống',  ic:_hubIc.cal,   roles:['QLNS'],                   quyen:'lichca.quanly',    act:()=>moLichCaQL_safe() },
      { label:'Lịch hoạt động CH',   desc:'Mở/đóng toàn hệ thống', ic:_hubIc.cal,   roles:['QLNS','QLBH'], setting:'lichhd.enabled', act:()=>moLichHDQL() },
      { label:'Duyệt yêu cầu',      desc:'Nghỉ phép, đổi ca',     ic:_hubIc.check, roles:['QLNS'],                   quyen:'duyetyc.duyet',    act:()=>goToPage('duyetyc') },
      { label:'Khuôn mặt (AI)',     desc:'Quản lý khuôn mặt NV',  ic:_hubIc.face,  roles:['QLNS'],                   quyen:'nhansu.xem',       act:()=>nsFaceOpenAdmin() },
      { label:'Giám sát Trưởng ca', desc:'Trưởng ca toàn chuỗi',  ic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>', roles:['QLNS','QLBH'], quyen:'nhansu.xem', act:()=>tcOpenGiamSat() },
    ]
  },
  banhang: {
    title: 'Bán hàng hệ thống',
    items: [
      { label:'Phiên bán hàng',     desc:'Mở/đóng phiên bán',     ic:_hubIc.cart,  roles:['QLNS','QLBH','CUA_HANG'], quyen:'banhang.phien',     act:()=>goToPage('banhang') },
      { label:'Dashboard bán hàng', desc:'Theo dõi phiên bán hàng',      ic:_hubIc.chart, roles:['QLNS','QLBH','CUA_HANG'], quyen:'banhang.dashboard', act:()=>goToPage('dashboard') },
    ]
  },
  bangiao: {
    title: 'Bàn giao hệ thống',
    items: [
      { label:'Bàn giao ca',        desc:'Bàn giao tại cửa hàng', ic:_hubIc.box,   roles:['NV','CTV','CUA_HANG'],    quyen:'bangiao.ca',       act:()=>goToPage('bangiao') },
      { label:'Bàn giao (Quản lý)', desc:'Đối soát, sự vụ',       ic:_hubIc.check, roles:['QLNS','QLBH'],            quyen:'bangiao.quanly',   act:()=>goToPage('bangiao-ql') },
    ]
  },
  muanon: {
    title: 'Mẫu nón',
    items: [
      { label:'Mẫu nón sưu tầm',    desc:'Ảnh sản phẩm hàng tuần',ic:_hubIc.img,   roles:[],                         quyen:'muanon.quanly',    act:()=>moPageMuanonAdmin() },
      { label:'Mua nón',            desc:'Đăng ký mua nón',       ic:_hubIc.cart,  roles:['NV','CTV'],               quyen:'muanon.xem',       act:()=>moPageMuanon() },
    ]
  },
};
function _hubItemVisible(it){
  if(typeof SESSION==='undefined'||!SESSION) return false;
  if(it.setting && _getSetting(it.setting, true) === false) return false; // [v17.40] tắt theo công tắc tính năng
  if(SESSION.vaiTro==='ADMIN') return true;          // ADMIN thấy mọi chức năng
  var baseVisible = Array.isArray(it.roles) && it.roles.indexOf(SESSION.vaiTro) !== -1;
  // [A2] chức danh ĐÃ cấu hình rõ ràng có thể MỞ THÊM tile (cộng thêm, không gỡ của ai)
  if(!baseVisible && it.quyen && typeof _quyenCauHinh==='function' && _quyenCauHinh(it.quyen)) return true;
  return baseVisible;
}
// moLichCaQL wrapper an toàn (taiLichCaQL nằm ở page nhân sự)
function moLichCaQL_safe(){ try{ goToPage('lichca-ql'); }catch(e){ try{ taiLichCaQL(); }catch(_){} } }

// ═════════════════════════════════════════════════════════════════════════
//  [B1] SỰ VỤ KHU VỰC — màn hình cho CƠ ĐỘNG (pool / nhận việc)
//  Sự vụ tự hiện theo khu vực; hiển thị "Điều phối: Ban quản lý" (ẩn việc tự động).
// ═════════════════════════════════════════════════════════════════════════
function moSuVuCoDong(){
  let ov = document.getElementById('svcd-overlay');
  if(!ov){ ov = document.createElement('div'); ov.id='svcd-overlay'; document.body.appendChild(ov); }
  ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:#F1F5F9;display:flex;flex-direction:column;';
  ov.innerHTML = `
    <div style="background:linear-gradient(135deg,#1D9E75,#0F6E56);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,.12)">
      <div style="font-weight:800;font-size:16px">Sự vụ khu vực</div>
      <button onclick="document.getElementById('svcd-overlay').remove()" style="background:rgba(255,255,255,.18);border:none;color:#fff;width:32px;height:32px;border-radius:8px;font-size:16px;cursor:pointer">✕</button>
    </div>
    <div id="svcd-body" style="flex:1;overflow-y:auto;padding:14px;-webkit-overflow-scrolling:touch">
      <div style="text-align:center;color:#64748B;padding:30px">Đang tải...</div>
    </div>`;
  svcdReload();
}

async function svcdReload(){
  const body = document.getElementById('svcd-body');
  if(!body) return;
  try{
    const ma = SESSION.ma;
    const [r1, r2] = await Promise.all([
      supa.rpc('fn_su_vu_co_dong_list',    { p_ma_nv: ma }),
      supa.rpc('fn_su_vu_co_dong_cua_toi', { p_ma_nv: ma })
    ]);
    if(r1.error) throw r1.error;
    const cho = Array.isArray(r1.data) ? r1.data : [];
    const cua = Array.isArray(r2.data) ? r2.data : [];
    body.innerHTML =
      svcdSection('Chờ nhận', cho, 'nhan') +
      svcdSection('Tôi đang xử lý', cua, 'xong');
  }catch(e){
    body.innerHTML = '<div style="text-align:center;color:#DC2626;padding:24px">Lỗi tải sự vụ: '+escHtml(e.message||'')+'</div>';
  }
}

function svcdSection(title, list, mode){
  const head = `<div style="font-weight:800;color:#0F2E45;font-size:14px;margin:6px 2px 10px">${title} <span style="color:#1D9E75">(${list.length})</span></div>`;
  if(!list.length){
    return head + `<div style="text-align:center;color:#94A3B8;padding:18px;font-size:13px;background:#fff;border-radius:10px;margin-bottom:16px">Không có sự vụ.</div>`;
  }
  return head + list.map(s => svcdCard(s, mode)).join('') + '<div style="height:8px"></div>';
}

function svcdCard(s, mode){
  const mdLbl = { KHAN_CAP:'Khẩn cấp', QUAN_TRONG:'Quan trọng', CAN_THIET:'Cần thiết' }[s.muc_do] || s.muc_do;
  const accent = s.muc_do==='KHAN_CAP' ? '#DC2626' : s.muc_do==='QUAN_TRONG' ? '#D97706' : '#1B4965';
  let dl = '';
  if(s.deadline_xu_ly){
    const d = new Date(s.deadline_xu_ly);
    const past = d.getTime() < Date.now();
    dl = `<div style="font-size:12px;font-weight:700;margin-top:6px;color:${past?'#DC2626':'#475569'}">Hạn: ${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}${past?' · QUÁ HẠN':''}</div>`;
  }
  const btn = mode==='nhan'
    ? `<button onclick="svcdNhanViec('${s.id}')" style="width:100%;margin-top:10px;background:linear-gradient(135deg,#1D9E75,#0F6E56);color:#fff;border:none;padding:10px;border-radius:9px;font-weight:700;font-size:14px;cursor:pointer">Nhận việc</button>`
    : `<button onclick="svcdXong('${s.id}')" style="width:100%;margin-top:10px;background:#0F6E56;color:#fff;border:none;padding:10px;border-radius:9px;font-weight:700;font-size:14px;cursor:pointer">Xác nhận đã xử lý xong</button>`;
  return `<div style="background:#fff;border-left:4px solid ${accent};border-radius:10px;padding:12px 13px;margin-bottom:10px;box-shadow:0 1px 4px rgba(15,46,69,.06)">
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:5px;flex-wrap:wrap">
      <span style="background:${accent};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">${mdLbl}</span>
      ${s.ma_sv?`<span style="font-size:11px;color:#64748B;font-weight:600">${escHtml(s.ma_sv)}</span>`:''}
    </div>
    <div style="font-weight:700;color:#0F172A;font-size:14px">${escHtml(s.tieu_de||'')}</div>
    <div style="font-size:12px;color:#475569;margin:3px 0"><b>${escHtml(s.ten_ch_snapshot||s.ma_ch||'')}</b></div>
    <div style="font-size:12px;color:#1D9E75;font-weight:700">Điều phối: Ban quản lý</div>
    ${s.mo_ta?`<div style="font-size:13px;color:#334155;margin-top:6px;line-height:1.45">${escHtml(s.mo_ta).slice(0,220)}${s.mo_ta.length>220?'…':''}</div>`:''}
    ${dl}
    ${btn}
  </div>`;
}

window.svcdNhanViec = async function(id){
  if(!confirm('Nhận xử lý sự vụ này?')) return;
  try{
    const { data, error } = await supa.rpc('fn_su_vu_co_dong_nhan_viec', {
      p_id: id, p_ma_nv: SESSION.ma, p_ten_nv: (SESSION.ten||SESSION.hoTen||SESSION.ma)
    });
    if(error || (data && data.ok===false)) throw new Error((data&&data.error) || (error&&error.message) || 'Lỗi');
    if(typeof showToast==='function') showToast('✓ Đã nhận việc','ok');
    svcdReload();
  }catch(e){ if(typeof showToast==='function') showToast('⚠ '+e.message,'warn'); }
};

window.svcdXong = async function(id){
  if(!confirm('Xác nhận đã xử lý xong sự vụ này?')) return;
  try{
    const { data, error } = await supa.rpc('fn_su_vu_xac_nhan_xong', {
      p_id: id, p_ma_nv: SESSION.ma, p_ten_nv: (SESSION.ten||SESSION.hoTen||SESSION.ma)
    });
    if(error || (data && data.ok===false)) throw new Error((data&&data.error) || (error&&error.message) || 'Lỗi');
    if(typeof showToast==='function') showToast('✓ Đã xác nhận xong','ok');
    svcdReload();
  }catch(e){ if(typeof showToast==='function') showToast('⚠ '+e.message,'warn'); }
};
window.moSuVuCoDong = moSuVuCoDong;

function hubOpenGroup(key){
  const g = HUB_GROUPS[key]; if(!g) return;
  const items = g.items.filter(_hubItemVisible);
  window._hubCurItems = items;
  let ov = document.getElementById('hub-submenu-overlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'hub-submenu-overlay'; document.body.appendChild(ov); }
  const arrow = '<svg class="hubsub-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  ov.innerHTML = `
    <div class="hubsub-head">
      <button class="hubsub-back" onclick="hubCloseGroup()" aria-label="Quay lại">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
      </button>
      <div class="hubsub-title">${escHtml(g.title)}</div>
    </div>
    <div class="hubsub-list">
      ${items.length ? items.map((it,i)=>`
        <div class="hubsub-item" onclick="hubRunItem(${i})">
          <div class="hubsub-ic">${it.ic||''}</div>
          <div class="hubsub-txt"><div class="hubsub-lb">${escHtml(it.label)}</div>${it.desc?`<div class="hubsub-ds">${escHtml(it.desc)}</div>`:''}</div>
          ${arrow}
        </div>`).join('')
      : '<div class="hubsub-empty">Không có chức năng nào khả dụng với tài khoản của bạn.</div>'}
    </div>`;
  ov.style.display = 'flex';
  requestAnimationFrame(()=>ov.classList.add('show'));
}
function hubRunItem(i){
  const it = (window._hubCurItems||[])[i]; if(!it) return;
  hubCloseGroup();
  setTimeout(()=>{ try{ it.act(); }catch(e){ console.error('[hub]',e); } }, 80);
}
function hubCloseGroup(){
  const ov = document.getElementById('hub-submenu-overlay');
  if(ov){ ov.classList.remove('show'); setTimeout(()=>{ ov.style.display='none'; }, 200); }
}
// Thẻ Đơn hàng Online — mở màn điều phối (page tự kiểm tra công tắc demo + quyền)
function hubOpenDonhang(){
  goToPage('donhang');
}

// ─── LOGIN ──────────────────────────────────────────────────
function togglePwVis(id,el){const i=document.getElementById(id);if(i.type==='password'){i.type='text';el.textContent='🙈';}else{i.type='password';el.textContent='👁️';}}
function doLogin(){
  const ma=document.getElementById('ln-ma').value.trim().toUpperCase();
  const pw=document.getElementById('ln-pw').value.trim();
  const btn=document.getElementById('login-btn');
  document.getElementById('login-err').style.display='none';
  if(!ma||!pw){showLoginErr('Vui lòng nhập mã nhân viên và mật khẩu.');return;}
  btn.disabled=true;btn.textContent='Đang xác thực...';
  // [v12-P2] Supabase RPC thay Apps Script
  supa.rpc('fn_dang_nhap', { p_ma: ma, p_password: pw })
  .then(({ data: res, error }) => {
    btn.disabled=false;btn.textContent='ĐĂNG NHẬP';
    if(error){showLoginErr(error.message||'Lỗi máy chủ.');return;}
    if(!res || !res.success){showLoginErr((res&&res.error)||'Đăng nhập thất bại.');return;}
    SESSION=res.nhanVien;
    // [v9.45] Fetch avatar URL sau login (không block UI)
    _fetchAvatarUrl();
    // [v10.85 YC#7] Preload bulk avatars để render avatar nhanh ở các tab
    try { _loadAvatarBulk(); } catch(e){}
    // [v10.85] Load app settings
    try { _loadAllSettings(); } catch(e){}
    // [v10.85] Persistent login: localStorage thay vì sessionStorage, lưu cả loginTime để check 00:00 T2
    try{
      localStorage.setItem('session_cc',JSON.stringify(SESSION));
      localStorage.setItem('session_login_ts', String(Date.now()));
    }catch(e){}
    khoiDongApp();
  }).catch(()=>{btn.disabled=false;btn.textContent='ĐĂNG NHẬP';showLoginErr('Lỗi kết nối.');});
}
function showLoginErr(msg){const el=document.getElementById('login-err');el.textContent=msg;el.style.display='block';}

// [v10.85] Tải lại toàn app: clear service worker cache + force reload (giữ session)
async function forceReloadApp(){
  const ok = await appConfirm('Tải lại toàn bộ ứng dụng để lấy phiên bản mới nhất?\nBạn vẫn được đăng nhập sau khi tải lại.', { title:'Tải lại ứng dụng', okLabel:'Tải lại' });
  if (!ok) return;
  try { if (typeof showToast === 'function') showToast('🔄 Đang tải lại...', 'info'); } catch(e){}
  try {
    // Xóa toàn bộ cache của Service Worker
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    // Bảo SW unregister rồi tự đăng ký lại lần load tiếp
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch(e){ console.warn('[reload]', e); }
  // Force reload bypass cache
  setTimeout(() => { location.reload(); }, 300);
}

async function doLogout(){
  const ok = await appConfirm('Bạn có chắc muốn đăng xuất?', { title:'Đăng xuất', okLabel:'Đăng xuất', danger:true });
  if(!ok) return;
  // [v11.5 TB] Stop notif polling
  try { stopNotifPolling(); } catch(e){}
  // [v10.85] Stop tất cả realtime + polling khi logout
  try { bxhStopRealtime(); } catch(e){}
  try { bhStopRealtimeSubCH(); } catch(e){}
  try { bhStopRealtimeSubQL(); } catch(e){}
  // [v10.85] Clear cả session + loginTime
  SESSION=null;
  try{
    localStorage.removeItem('session_cc');
    localStorage.removeItem('session_login_ts');
    sessionStorage.removeItem('session_cc'); // dọn dẹp dữ liệu cũ
  }catch(e){}
  stopCamera();
  state={loai:null,btnId:null,lat:null,lng:null,gpsAcc:null,gpsOk:false,selfieB64:null,selfieOk:false,submitting:false,submitted:false};
  document.getElementById('main-app').style.display='none';
  document.getElementById('main-header').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('ln-ma').value='';document.getElementById('ln-pw').value='';
  document.getElementById('login-err').style.display='none';
}
window.addEventListener('load',()=>{
  // [v10.85] Restore session: ưu tiên localStorage, fallback sessionStorage (migration)
  let s = null;
  try{ s = localStorage.getItem('session_cc'); }catch(e){}
  if(!s){
    // Migration: nếu user đang dùng phiên cũ (sessionStorage), kéo sang localStorage
    try{
      const old = sessionStorage.getItem('session_cc');
      if(old){
        localStorage.setItem('session_cc', old);
        // Lần đầu chuyển: coi như mới login bây giờ để không bị logout ngay
        if(!localStorage.getItem('session_login_ts')){
          localStorage.setItem('session_login_ts', String(Date.now()));
        }
        s = old;
      }
    }catch(e){}
  }
  if(s){try{SESSION=JSON.parse(s);_fetchAvatarUrl();try{_loadAvatarBulk();}catch(e){}try{_loadAllSettings();}catch(e){}khoiDongApp();}catch(e){
    try{ localStorage.removeItem('session_cc'); }catch(_){}
  }}
  // [v12-P3] Ẩn bottom-nav khi bàn phím hiện (iOS/Android)
  _setupKeyboardHandler();
});

// Ẩn bottom-nav khi gõ phím để menu không bị đẩy lên
function _setupKeyboardHandler(){
  const nav = document.querySelector('.bottom-nav');
  if(!nav)return;
  // Cách 1: focus/blur trên input
  document.addEventListener('focusin', (e)=>{
    if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA' || e.target.isContentEditable)){
      nav.classList.add('kb-hidden');
    }
  });
  document.addEventListener('focusout', ()=>{
    setTimeout(()=>{
      const a = document.activeElement;
      if(!a || (a.tagName!=='INPUT' && a.tagName!=='TEXTAREA' && !a.isContentEditable)){
        nav.classList.remove('kb-hidden');
      }
    }, 100);
  });
  // Cách 2 (chính xác hơn): visualViewport API trên iOS
  if(window.visualViewport){
    const baseHeight = window.innerHeight;
    window.visualViewport.addEventListener('resize', ()=>{
      const diff = baseHeight - window.visualViewport.height;
      if(diff > 150) nav.classList.add('kb-hidden');
      else nav.classList.remove('kb-hidden');
    });
  }
}

// ─── KHỞI ĐỘNG ──────────────────────────────────────────────
// [v15.7] ───── RBAC: nạp quyền + phạm vi của người dùng ─────
window.SESSION_QUYEN = []; window.SESSION_PHAMVI = 'canhan';
window.SESSION_KV = null; window.SESSION_KVPT = []; window.SESSION_MACH = null; window.SESSION_CHUCDANH = '';
window.SESSION_QUYEN_READY = false; window.SESSION_DACAUHINH = false;
function pqLoadQuyenSession(){
  try{
    if(typeof SESSION==='undefined'||!SESSION||!SESSION.ma) return;
    supa.rpc('fn_get_quyen_user',{p_ma:SESSION.ma}).then(({data,error})=>{
      if(error||!data||!data.success) return;
      window.SESSION_QUYEN   = Array.isArray(data.quyen)?data.quyen:[];
      window.SESSION_PHAMVI  = data.pham_vi||'canhan';
      window.SESSION_KV      = data.khu_vuc||null;
      window.SESSION_KVPT    = Array.isArray(data.khu_vuc_phu_trach)?data.khu_vuc_phu_trach:[];
      window.SESSION_MACH    = data.ma_ch||null;
      window.SESSION_CHUCDANH= data.chuc_danh||'';
      window.SESSION_DACAUHINH = (data.da_cau_hinh === true);   // [A2] chức danh có dòng quyền riêng trong chuc_danh_quyen?
      window.SESSION_QUYEN_READY = true;
    }).catch(()=>{});
  }catch(e){}
}
// [A2] Quyền đã CẤU HÌNH rõ ràng cho chức danh (KHÔNG fallback) — dùng để MỞ THÊM tile/nav, không gỡ của ai.
function _quyenCauHinh(maQuyen){
  return window.SESSION_DACAUHINH === true &&
         (window.SESSION_QUYEN||[]).indexOf(maQuyen) !== -1;
}
// Kiểm quyền tổng quát: ADMIN full; chức danh ĐÃ cấu hình dùng quyền DB; CHƯA cấu hình → mặc định theo chức danh|vai trò (không khóa nhầm). Dành cho các slice enforcement kế tiếp.
function coQuyen(maQuyen){
  if(typeof SESSION!=='undefined'&&SESSION&&SESSION.vaiTro==='ADMIN') return true;
  var ids;
  if(window.SESSION_DACAUHINH===true){
    ids = window.SESSION_QUYEN||[];
  } else if(typeof pqDefaultFor==='function'){
    ids = pqDefaultFor(window.SESSION_CHUCDANH || (typeof SESSION!=='undefined'&&SESSION&&SESSION.vaiTro) || 'NV');
  } else {
    ids = window.SESSION_QUYEN||[];
  }
  return ids.indexOf(maQuyen)!==-1;
}
function phamViData(){ return window.SESSION_PHAMVI||'canhan'; }
function khuVucChoPhep(){ return window.SESSION_KVPT||[]; }
window.coQuyen=coQuyen; window._quyenCauHinh=_quyenCauHinh; window.phamViData=phamViData; window.khuVucChoPhep=khuVucChoPhep;

function khoiDongApp(){
  pqLoadQuyenSession();   // [v15.7] nạp quyền nền — chưa khống chế UI ở bước này
  // [v15.9] Tab Khẩn cấp chỉ hiện cho chủ hệ thống NS00490
  try { if (SESSION && SESSION.ma === 'NS00490'){ const _tk=document.getElementById('adm2-tab-khancap'); if(_tk) _tk.style.display=''; } } catch(e){}
  document.getElementById('disp-ten-nv').textContent=SESSION.ten;
  document.getElementById('disp-ma-nv').textContent=SESSION.ma;
  document.getElementById('header-nv-info').textContent=SESSION.ten+' ('+SESSION.ma+')';

  // [v10.94] Header modern compact + Hero card data
  try{
    const dateEl = document.getElementById('cc-header-date');
    const nameEl = document.getElementById('cc-header-name');
    const avEl   = document.getElementById('cc-header-avatar');
    const clockEl= document.getElementById('cc-clock-live');
    if(dateEl){
      const d = new Date();
      const dow = ['CN','T2','T3','T4','T5','T6','T7'][d.getDay()];
      dateEl.textContent = dow + ' · ' + d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear();
    }
    if(nameEl){
      nameEl.textContent = SESSION.ten || '--';
    }
    if(avEl){
      const parts = (SESSION.ten||'').trim().split(/\s+/);
      let initial = '--';
      if(parts.length >= 2) initial = (parts[parts.length-2][0]||'') + (parts[parts.length-1][0]||'');
      else if(parts.length === 1 && parts[0]) initial = parts[0][0];
      avEl.textContent = initial.toUpperCase();
    }
    // Live clock — tick mỗi giây
    function _tickClock(){
      if(!clockEl) return;
      const n = new Date();
      const pad = v => String(v).padStart(2,'0');
      clockEl.textContent = pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds());
    }
    _tickClock();
    if(!window._ccClockTimer) window._ccClockTimer = setInterval(_tickClock, 1000);

    // Hero card — placeholder data
    const heroLoc = document.getElementById('cc-hero-loc-text');
    const heroStatus = document.getElementById('cc-hero-status-txt');
    const heroDone = document.getElementById('cc-hero-done');
    const heroLeft = document.getElementById('cc-hero-left');
    if(heroLoc) heroLoc.textContent = 'Chưa chọn cửa hàng';
    if(heroStatus) heroStatus.textContent = 'Chưa vào ca';
    if(heroDone) heroDone.textContent = '--';
    if(heroLeft) heroLeft.textContent = '--';
  }catch(_e){}

  document.getElementById('banner-pw').style.display=SESSION.laDatMacDinh?'block':'none';
  document.getElementById('login-screen').style.display='none';
  document.getElementById('main-header').style.display='block';
  document.getElementById('main-app').style.display='block';
  if(typeof tcRefreshBanner==='function') setTimeout(tcRefreshBanner, 350); // [v17.40] khôi phục thẻ Trưởng ca + hero khi tải lại
  // [v11.7+ fix] Force scroll về đầu - gọi nhiều lần để bắt async scroll restoration
  // Chrome/Safari đôi khi tự khôi phục scroll position sau khi DOM thay đổi
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  // Tắt browser auto-restore scroll
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  // Force lại sau 50ms + 200ms để chắc chắn không bị async overrride
  requestAnimationFrame(() => { window.scrollTo(0, 0); });
  setTimeout(() => { window.scrollTo(0, 0); }, 200);
  // [v10.85 Yc #4] Xin quyền notification + set baseline timestamp
  _tbLastTs = Date.now(); // chỉ thông báo mới từ thời điểm đăng nhập
  setTimeout(_xinQuyenThongBao, 2000);
  setTimeout(_pollThongBao, 5000);
  // [v11.5 TB-05] Khởi động hệ thống thông báo realtime với chuông SVG
  setTimeout(startNotifPolling, 1500);
  // [v10.85] Áp theme từ localStorage (nếu đã chọn trước)
  // [v10.85] Áp màu chủ đạo từ localStorage (nếu đã chọn trước)
  try{
    const saved = localStorage.getItem('_mauChinh');
    if(saved) _apDungMauChinh(saved);
  }catch(e){}
  const now=new Date();
  gcThang=now.getFullYear()+'-'+pad(now.getMonth()+1);
  gcThangQL=gcThang;
  lastDay=now.getDate();

  // Không điền sẵn cửa hàng — nhân viên phải chủ động chọn để tránh sai sót khi đi hỗ trợ
  // document.getElementById('input-ch-display').value=SESSION.cuaHangTen;
  // document.getElementById('sel-cuahang').value=SESSION.cuaHangMa;

  // Phân quyền QLNS/ADMIN
  const isQL=SESSION.vaiTro==='QLNS'||SESSION.vaiTro==='ADMIN';
  // [v11] Thêm: CUA_HANG và QLBH
  const isCH  = SESSION.vaiTro==='CUA_HANG';
  const isQLBH= SESSION.vaiTro==='QLBH' || String(SESSION.vaiTro||'').startsWith('QLBH');
  // [v5.2] Admin tab cho ADMIN
  const isAdminAll = SESSION.vaiTro==='ADMIN';

  // [v7.0] Menu "Xin bổ sung ca" — chỉ NV thường
  const isNV = !isQL && !isCH && !isQLBH && !isAdminAll;
  // [v10.98] Phân quyền BOTTOM NAV theo role
  // - NV/CTV: thêm nav-bandochidung + nav-chuongtrinh vào bottom
  // - ADMIN: thêm nav-banhang + nav-admin vào bottom
  // - QLNS/QLBH/CH: thêm nav-banhang vào bottom (đã có sẵn cho QLBH/CH)
  const nCT = document.getElementById('nav-chuongtrinh');
  const nBD = document.getElementById('nav-bandochidung');
  if (isNV || isCH) {
    // [v13.19] Menu Bàn giao ca thay thế hoàn toàn "Kiểm tra cửa hàng" cũ
    const mChk = document.getElementById('menu-checklist');
    if (mChk) mChk.style.display = 'none';
    const mBG = document.getElementById('menu-bangiao');
    if (mBG) mBG.style.display = '';
  }
  if (isNV) {
    // NV: bật bản đồ + chương trình ở bottom nav
    if (nCT) nCT.style.display = '';
    if (nBD) nBD.style.display = '';
  }
  // [v13.0] Menu "Xin bổ sung ca" — NV thường + QLBH* (CH/QLNS/ADMIN có lối khác)
  if (isNV || isQLBH) {
    const mb = document.getElementById('menu-bosung-ca');
    if (mb) {
      mb.style.display = '';
      // Load quota hiển thị (QLBH cũng dùng chung quota theo ma)
      try {
        supa.rpc('fn_nv_quota_status', { p_ma_nv: SESSION.ma }).then(({ data }) => {
          if (!data) return;
          const lbl = document.getElementById('menu-bosung-quota');
          if (lbl) lbl.textContent = 'Còn ' + (data.quota_bo_sung_con || 0) + '/' + (data.quota_max || 3);
        });
      } catch (e) {}
    }
  }
  // [v11.8] Bật tab "Mẫu nón" ở bottom nav cho mọi role (NV/CTV/CH/QLBH/ADMIN/QLNS)
  // Tất cả NV đều cần gửi mẫu nón hàng tuần → đưa ra nav chính
  const nMN = document.getElementById('nav-muanon');
  if (nMN) nMN.style.display = isCH ? 'none' : '';   // [v13.90] CH dùng tab Khách Online thay Mẫu nón
  const nKO = document.getElementById('nav-khachonline');
  if (nKO) nKO.style.display = isCH ? '' : 'none';

  // [v12.0] Load trạng thái đăng ký khuôn mặt cho Tài khoản tab
  try {
    supa.rpc('fn_face_enroll_status', { p_ma_nv: SESSION.ma }).then(({ data }) => {
      if (!data) return;
      const lbl = document.getElementById('menu-face-status');
      if (lbl) {
        if (data.completed) {
          lbl.textContent = '✓ Đã đăng ký';
          lbl.style.color = '#0F6E56';
        } else {
          lbl.textContent = 'Chưa đăng ký';
          lbl.style.color = '#EF4444';
        }
      }
    });
  } catch (e) {}

  // [v12.1] Admin Face Config — show entry "Quản lý chấm công khuôn mặt" cho ADMIN/QLNS
  if (isAdminAll || (SESSION.role === 'QLNS')) {
    const adminFaceEl = document.getElementById('menu-face-admin');
    if (adminFaceEl) adminFaceEl.style.display = '';
    // Load trạng thái enabled
    try {
      supa.rpc('fn_face_get_config').then(({ data }) => {
        if (!data) return;
        const lbl = document.getElementById('menu-face-admin-status');
        if (lbl) {
          lbl.textContent = data.enabled ? 'BẬT' : 'TẮT';
          lbl.className = 'menu-badge-pill ' + (data.enabled ? 'on' : 'off');
        }
      });
    } catch (e) {}
  }
  if (isAdminAll) {
    // [v13.42] ADMIN bottom-nav: chỉ 5 mục (Nhân sự + Bán hàng + QL bàn giao + Hình ảnh SP + Admin).
    // ẨN tất cả nav NV: chamcong/giocong/bandochidung/lichca/muanon/chuongtrinh/taikhoan
    const _hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
    const _show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
    
    _hide('nav-chamcong');
    _hide('nav-giocong');
    _hide('nav-bandochidung');
    _hide('nav-lichca');
    _hide('nav-muanon');
    _hide('nav-chuongtrinh');
    _hide('nav-taikhoan');
    
    _show('nav-nhansu');
    _show('nav-banhang');
    _show('nav-bangiao-ql');
    _show('nav-muanon-admin');
    _show('nav-admin');
    _show('cc-header-home-btn');   // [v13.43] nút về Hub
    
    // Menu Tài khoản: show các mục ADMIN
    _show('menu-admin');
    _show('menu-banhang');
    _show('menu-muanon-admin');
    
    // Show section labels của Nhóm 1 (AI) + Nhóm 2 (Quản lý) + Nhóm 3 (SP)
    _show('acc-sec-ai');
    _show('acc-sec-quanly');
    _show('acc-sec-sp');

    // [v13.43] ADMIN landing → HOME HUB (trang chủ phân hệ)
    setTimeout(()=>{ try{ goToPage('home'); }catch(e){} }, 120);
  }

  // [v11 muanon] QL (QLNS/QLBH) cũng thấy menu-muanon-admin
  if (isQL || isQLBH || isCH) {
    const mMNA = document.getElementById('menu-muanon-admin');
    if (mMNA) mMNA.style.display = '';
    const sSP = document.getElementById('acc-sec-sp');
    if (sSP) sSP.style.display = '';
  }

  if(isQL){
    // [v13.28 FIX] Dùng null-safe show — tránh TypeError khi menu cũ đã bị xóa khỏi HTML
    // (menu-lichca-ql, menu-checklist-ql đã retire nhưng JS vẫn gọi → null.style → throw
    //  → block dừng giữa chừng → menu-bangiao-ql không được show)
    const _showQL = (id) => { const el = document.getElementById(id); if (el) el.style.display = ''; };
    _showQL('nav-nhansu');
    _showQL('menu-nhansu');
    _showQL('menu-lichca-ql');
    _showQL('menu-dashboard');   // [FIX v9 #12]
    _showQL('menu-duyetyc');     // [v10 Yc #5]
    _showQL('menu-checklist-ql'); // [v10.85] Sự cố CH (retire)
    _showQL('menu-bangiao-ql');   // [v13.19] QL bàn giao
    _showQL('acc-sec-quanly');    // [v13.42] section label Quản lý vận hành
  }
  // [v13.26] QLBH cũng cần thấy menu Bàn giao QL (chịu trách nhiệm CH)
  if (isQLBH) {
    const mBGQL = document.getElementById('menu-bangiao-ql');
    if (mBGQL) mBGQL.style.display = '';
    // [v13.42] section label
    const sQL = document.getElementById('acc-sec-quanly');
    if (sQL) sQL.style.display = '';
  }

  // [v11] Phân quyền CỬA HÀNG
  if(isCH){
    // Ẩn tab Chấm công và Bản đồ (CH không cần)
    document.getElementById('nav-chamcong').style.display='none';
    document.getElementById('nav-bandochidung').style.display='none';
    // [v17.40] Tắt tính năng Lịch hoạt động → ẩn tab Lịch của cửa hàng
    if(_getSetting('lichhd.enabled', true) === false){ const _nL=document.getElementById('nav-lichca'); if(_nL) _nL.style.display='none'; }
    // Hiện tab Bán hàng
    document.getElementById('nav-banhang').style.display='';
    // [v5.6] Menu Phiên bán hàng trong tab Tài khoản
    const mBHCh = document.getElementById('menu-banhang');
    if (mBHCh) mBHCh.style.display='';
    // [v13.28 FIX] Null-safe — menu-lichca-ql có thể đã retire
    const _showCH = (id) => { const el = document.getElementById(id); if (el) el.style.display = ''; };
    // [v13.49] CH KHÔNG quản lý/duyệt nhân sự — chỉ giữ Dashboard bán hàng.
    // Ẩn: Nhân sự, Lịch ca QL (các mục quản lý). Duyệt yêu cầu giữ ẩn (chờ RPC lọc theo CH).
    _showCH('menu-dashboard');
    // [v13.90] Bật nhận đơn Khách Online chạy nền — popup hiện ở mọi tab
    setTimeout(()=>{ try{ if(typeof dhNhanStartGlobal==='function') dhNhanStartGlobal(); }catch(e){} }, 800);
    // Chuyển trang mặc định sang Bán hàng
    setTimeout(()=>{ try{ goToPage('banhang'); }catch(e){} }, 100);
  }

  // [v11] Phân quyền QLBH (Quản lý bán hàng)
  if(isQLBH){
    // Ẩn tab Chấm công và Bản đồ (QLBH không làm nhân sự)
    document.getElementById('nav-chamcong').style.display='none';
    document.getElementById('nav-bandochidung').style.display='none';
    document.getElementById('nav-lichca').style.display='none';
    // [v13.49] QLBH KHÔNG quản lý/duyệt nhân sự (duyệt chỉ QLNS) → ẩn Nhân sự.
    // QLBH chỉ giám sát Bán hàng + Bàn giao (theo quyền "QL nào cũng được" cho 2 mục này).
    document.getElementById('nav-banhang').style.display='';
    // [v5.6] Menu Phiên bán hàng trong tab Tài khoản
    const mBHQl = document.getElementById('menu-banhang');
    if (mBHQl) mBHQl.style.display='';
    // QLBH không duyệt, không quản lý lịch ca → KHÔNG hiện menu-duyetyc, menu-lichca-ql
    // Dashboard vẫn hiện để xem tổng quan
    document.getElementById('menu-dashboard').style.display='';
    // Mặc định mở tab Bán hàng (giám sát)
    setTimeout(()=>{ try{ goToPage('banhang'); }catch(e){} }, 100);
  }

  // [v12-P2] Lấy DS cửa hàng + quản lý từ Supabase
  supa.rpc('fn_get_data_login').then(({ data: d, error }) => {
    if (error || !d) return;
    CH_LIST = d.cuaHang || [];
    window.QL_LIST = d.quanLy || [];
    renderNearby();
    buildNSSuggestData();
    buildKVTabs();
    _buildDNPKVFilter();
  }).catch(()=>{});
  taiLichSu();
}

// ─── CỬA HÀNG AUTOCOMPLETE ──────────────────────────────────
function esc(s){return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
let chTimer=null;
function onCHInput(){
  clearTimeout(chTimer);
  chTimer=setTimeout(()=>{
    const inp=document.getElementById('input-ch-display');
    const q=inp.value.trim().toLowerCase();
    const list=document.getElementById('ch-suggest-list');
    if(!q){list.style.display='none';return;}
    const matched=CH_LIST.filter(ch=>ch.ma.toLowerCase().includes(q)||ch.ten.toLowerCase().includes(q)).slice(0,10);
    if(!matched.length){list.style.display='none';document.getElementById('sel-cuahang').value='';updateSubmitBtn();return;}
    list.innerHTML=matched.map(ch=>'<div class="suggest-item" onmousedown="selectCH(\''+esc(ch.ma)+'\',\''+esc(ch.ten)+'\')"><span class="s-ma">'+ch.ma+'</span><span class="s-ten">'+ch.ten+'</span></div>').join('');
    list.style.display='block';
  },160);
}
function selectCH(ma,ten){
  document.getElementById('input-ch-display').value=ten||ma;
  document.getElementById('sel-cuahang').value=ma;
  document.getElementById('ch-suggest-list').style.display='none';
  // [v10.85 YC#8] Nếu là Đội SALE → hiện card chọn CH thực tế
  _capNhatUISaleTarget(ten || ma);
  updateSubmitBtn();
  if(typeof tcRefreshBanner==='function') tcRefreshBanner(); // [v17.40] Trưởng ca theo cửa hàng
}
function hideCHSuggest(){setTimeout(()=>{document.getElementById('ch-suggest-list').style.display='none';},150);}

// ════════════════════════════════════════════════════════════════════════
// [v10.85 YC#8] ĐỘI SALE — chấm công với CH đích di động
// Quy ước: tên CH bắt đầu bằng "Đội SALE" hoặc "Doi SALE" (không dấu) = đội sale
// Khi gửi: ghép tenCh = "Đội SALE 01 - Hai Bà Trưng"
// ════════════════════════════════════════════════════════════════════════
function _laDoiSale(tenCH){
  if (!tenCH) return false;
  const t = tenCH.trim().toLowerCase();
  return t.startsWith('đội sale') || t.startsWith('doi sale');
}

// [v14.7] CƠ ĐỘNG — vị trí di động, 1 ngày làm nhiều CH. Giống Đội SALE (phải nhập CH thực để
// check GPS) NHƯNG được check-in/out KHÁC cửa hàng vẫn tính giờ (xử lý ở fn_tong_hop_ngay qua
// cột nguon='CO_DONG'). Sai vị trí GPS thì vẫn báo như nhân viên thường.
function _laCoDong(tenCH, maCH){
  if (maCH && String(maCH).trim().toUpperCase() === 'CODONG') return true;
  if (!tenCH) return false;
  const t = tenCH.trim().toLowerCase();
  return t.startsWith('cơ động') || t.startsWith('co dong');
}
// Vị trí di động = Đội SALE hoặc Cơ Động → đều cần ô nhập CH thực tế
function _laViTriDiDong(tenCH, maCH){
  return _laDoiSale(tenCH) || _laCoDong(tenCH, maCH);
}

function _capNhatUISaleTarget(tenCH){
  const card = document.getElementById('card-sale-target');
  const inp = document.getElementById('input-sale-target-display');
  const hid = document.getElementById('sel-sale-target');
  if (!card) return;
  if (_laViTriDiDong(tenCH)){
    card.style.display = 'block';
  } else {
    card.style.display = 'none';
    if (inp) inp.value = '';
    if (hid) hid.value = '';
  }
}

// Autocomplete CH thực tế (loại bỏ Đội SALE khỏi danh sách gợi ý)
let _saleTargetDeb = null;
function onSaleTargetInput(){
  clearTimeout(_saleTargetDeb);
  _saleTargetDeb = setTimeout(()=>{
    const inp = document.getElementById('input-sale-target-display');
    const list = document.getElementById('sale-target-suggest-list');
    if (!inp || !list) return;
    const q = inp.value.trim().toLowerCase();
    const src = (typeof CH_LIST !== 'undefined' && CH_LIST) ? CH_LIST : [];
    // Loại bỏ các vị trí di động (Đội SALE + Cơ Động) khỏi gợi ý CH thực
    const candidates = src.filter(ch => !_laViTriDiDong(ch.ten, ch.ma));
    let matched;
    if (!q){
      matched = candidates.slice(0, 8);
    } else {
      matched = candidates.filter(ch =>
        (ch.ma || '').toLowerCase().includes(q) || (ch.ten || '').toLowerCase().includes(q)
      ).slice(0, 10);
    }
    if (!matched.length){
      list.style.display = 'none';
      document.getElementById('sel-sale-target').value = '';
      updateSubmitBtn();
      return;
    }
    list.innerHTML = matched.map(ch =>
      '<div class="suggest-item" onmousedown="selectSaleTarget(\''+esc(ch.ma)+'\',\''+esc(ch.ten)+'\')"><span class="s-ma">'+ch.ma+'</span><span class="s-ten">'+ch.ten+'</span></div>'
    ).join('');
    list.style.display = 'block';
  }, 160);
}

function selectSaleTarget(ma, ten){
  document.getElementById('input-sale-target-display').value = ten || ma;
  document.getElementById('sel-sale-target').value = ma;
  document.getElementById('sale-target-suggest-list').style.display = 'none';
  updateSubmitBtn();
}

function hideSaleTargetSuggest(){
  setTimeout(()=>{
    const el = document.getElementById('sale-target-suggest-list');
    if (el) el.style.display='none';
  }, 150);
}

// ─── LOẠI CHẤM CÔNG ─────────────────────────────────────────
const TYPE_MAP={vao:{cls:'tb-vao'},ra:{cls:'tb-ra'},'ra-g':{cls:'tb-ra-g'},'vao-g':{cls:'tb-vao-g'}};
function selType(loai,btnId){
  if(state.submitted)return;
  state.loai=loai;state.btnId=btnId;
  Object.keys(TYPE_MAP).forEach(k=>{document.getElementById('btn-'+k).className='type-btn '+TYPE_MAP[k].cls+(k===btnId?' sel':'');});
  updateSubmitBtn();
}

// ─── GPS ────────────────────────────────────────────────────
function layViTri(){
  if(state.gpsOk||state.submitted)return;
  const btn=document.getElementById('gps-btn'),label=document.getElementById('gps-label'),sub=document.getElementById('gps-sub'),badge=document.getElementById('gps-badge');
  btn.className='gps-btn loading';label.textContent='Đang lấy tọa độ...';sub.textContent='Vui lòng giữ yên thiết bị';badge.innerHTML='<span class="blinking">●</span> Đang lấy';
  if(!navigator.geolocation){setGpsErr('Thiết bị không hỗ trợ GPS');return;}
  navigator.geolocation.getCurrentPosition(
    pos=>{
      state.lat=pos.coords.latitude.toFixed(6);
      state.lng=pos.coords.longitude.toFixed(6);
      state.gpsAcc=Math.round(pos.coords.accuracy);
      state.gpsOk=true;
      state.gpsCaptureTs = Date.now();  // [v10.85] thời điểm capture GPS
      // [v10.85 YC#4] Cảnh báo GPS kém (accuracy > 100m): mạng yếu → tọa độ có thể sai
      const accVal = state.gpsAcc;
      const isWeak = accVal > Number(_getSetting("cc.gps_weak_threshold_m", 100));
      btn.className = isWeak ? 'gps-btn warn' : 'gps-btn success';
      label.textContent = isWeak ? '⚠ GPS YẾU — vị trí có thể sai' : 'ĐÃ XÁC NHẬN VỊ TRÍ';
      sub.textContent = '±' + accVal + 'm' + (isWeak ? ' · Hãy ra ngoài trời / bật wifi để chính xác hơn' : '');
      badge.textContent = isWeak ? '⚠ ' + accVal + 'm' : '✓ ĐÃ XÁC NHẬN';
      document.getElementById('gps-icon').textContent = isWeak ? '⚠️' : '✅';
      updateSubmitBtn();
    },
    err=>{const msgs={1:'Từ chối truy cập vị trí',2:'Không lấy được GPS',3:'Quá thời gian chờ'};setGpsErr(msgs[err.code]||'Lỗi GPS');},
    {enableHighAccuracy:true,timeout:10000,maximumAge:0}
  );
}
function setGpsErr(msg){document.getElementById('gps-btn').className='gps-btn error';document.getElementById('gps-label').textContent=msg;document.getElementById('gps-sub').textContent='Bấm để thử lại';document.getElementById('gps-badge').textContent='Thử lại';document.getElementById('gps-icon').textContent='❌';state.gpsOk=false;updateSubmitBtn();}

// ─── CAMERA ─────────────────────────────────────────────────
// [v12-FIX] Camera stream thực sự - không cho chọn từ thư viện
let _cameraStream = null;
let _cameraVideo = null;
let _cameraTarget = 'cham_cong'; // 'cham_cong' | 'don_nghi' | 'lich_nghi'
let _cameraNgay = '';

// Detect mobile
function _isMobile(){
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

async function moCamera(){
  if(state.submitted)return;
  _cameraTarget = 'cham_cong';

  // [v12.4] Nếu face.chamcong_enabled BẬT + NV enrolled → mở face verify thay vì camera chụp
  // Chỉ áp dụng cho role NV (admin/QL vẫn dùng camera thường)
  if (typeof nsFaceCheckEnabled === 'function' && String(SESSION.vaiTro||'').toUpperCase() === 'NV') {
    const faceOn = await nsFaceCheckEnabled();
    if (faceOn) {
      // Mở face verify
      nsFaceStartChamCong(
        function onSuccess(r) {
          // Capture frame từ video face verify làm ảnh xác minh
          _captureFrameAsSelfie(r);
        },
        function onFail(r) {
          // Fallback: cho user chụp ảnh tay
          if (typeof showToast === 'function') showToast('Chuyển sang chụp ảnh tay', 'warn');
          _moCameraNormal();
        }
      );
      return;
    }
  }

  // Flow gốc (face TẮT hoặc không phải NV)
  _moCameraNormal();
}

// Tách flow camera gốc ra hàm riêng để gọi lại được
function _moCameraNormal(){
  if(_isMobile()){
    const inp = document.getElementById('camera-file-input');
    inp.disabled = false;
    inp.value = '';
    inp.click();
  } else {
    _moCameraDialog('user');
  }
}

// [v12.4] Sau face verify pass → tạo "ảnh xác minh" tổng hợp (text + similarity)
// [v13.14] Nếu verifyResult.faceImage có → dùng làm background (ảnh face thật)
//          + overlay dải tối dưới với check icon + similarity + ma_nv + timestamp
//          Fallback synthetic teal nếu không có faceImage
function _captureFrameAsSelfie(verifyResult) {
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 800;
  const ctx = canvas.getContext('2d');

  if (verifyResult && verifyResult.faceImage) {
    // [v13.14] Async: load ảnh face → crop center fit 600x800 → overlay
    const img = new Image();
    img.onload = () => {
      const iw = img.width, ih = img.height;
      const targetRatio = 600 / 800;
      const srcRatio = iw / ih;
      let sx, sy, sw, sh;
      if (srcRatio > targetRatio) {
        // Ảnh rộng hơn target → crop trái/phải
        sh = ih; sw = ih * targetRatio;
        sx = (iw - sw) / 2; sy = 0;
      } else {
        // Ảnh cao hơn → crop trên/dưới
        sw = iw; sh = iw / targetRatio;
        sx = 0; sy = (ih - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 600, 800);
      _drawSelfieOverlay(ctx, verifyResult);
      _finalizeSelfie(canvas, verifyResult);
    };
    img.onerror = () => {
      _drawSelfieSynthetic(ctx);
      _drawSelfieOverlay(ctx, verifyResult);
      _finalizeSelfie(canvas, verifyResult);
    };
    img.src = verifyResult.faceImage;
  } else {
    // Không có faceImage → fallback synthetic
    _drawSelfieSynthetic(ctx);
    _drawSelfieOverlay(ctx, verifyResult);
    _finalizeSelfie(canvas, verifyResult);
  }
}

// [v13.14] Background synthetic (fallback khi không có ảnh face thật)
function _drawSelfieSynthetic(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, 800);
  grad.addColorStop(0, '#0F6E56');
  grad.addColorStop(1, '#1f2d28');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 800);
  // Vòng tròn lớn ở giữa cho fallback synthetic
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath(); ctx.arc(300, 320, 110, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = '#2BC084'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(300, 320, 110, 0, 2 * Math.PI); ctx.stroke();
  ctx.strokeStyle = '#2BC084'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(250, 325); ctx.lineTo(290, 365); ctx.lineTo(355, 280);
  ctx.stroke();
}

// [v13.14] Overlay dải tối ở đáy + check icon nhỏ + similarity + ma_nv + timestamp
function _drawSelfieOverlay(ctx, verifyResult) {
  // Gradient tối từ trong suốt → đen ở đáy
  const overlayGrad = ctx.createLinearGradient(0, 580, 0, 800);
  overlayGrad.addColorStop(0, 'rgba(0,0,0,0)');
  overlayGrad.addColorStop(0.35, 'rgba(0,0,0,0.55)');
  overlayGrad.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = overlayGrad;
  ctx.fillRect(0, 580, 600, 220);

  // Check icon nhỏ (vòng tròn xanh + dấu V trắng)
  ctx.fillStyle = '#2BC084';
  ctx.beginPath(); ctx.arc(58, 705, 22, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(47, 706); ctx.lineTo(55, 714); ctx.lineTo(70, 696);
  ctx.stroke();

  // Tiêu đề
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px -apple-system, sans-serif';
  ctx.fillText('Xác minh khuôn mặt', 95, 700);

  // Độ khớp
  const simPct = verifyResult && verifyResult.match_pct !== undefined
    ? verifyResult.match_pct
    : Math.round((1 - ((verifyResult && verifyResult.distance) || 0)) * 100);
  ctx.font = '17px -apple-system, sans-serif';
  ctx.fillStyle = '#2BC084';
  ctx.fillText('Độ khớp ' + simPct + '%', 95, 725);

  // ma_nv + timestamp
  const now = new Date();
  const ts = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds())
           + '  ' + pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '13px monospace';
  ctx.fillText(SESSION.ma + '  ·  ' + ts, 95, 750);
}

// [v13.14] Finalize: lưu state + update UI (tách ra để gọi từ cả 2 nhánh sync/async)
function _finalizeSelfie(canvas, verifyResult) {
  state.selfieB64 = canvas.toDataURL('image/jpeg', 0.85);
  state.selfieOk = true;
  state.selfieCaptureTs = Date.now();
  state.selfieIsFaceVerified = true;

  const preview = document.getElementById('selfie-preview');
  if (preview) { preview.src = state.selfieB64; preview.style.display = 'block'; }
  const icon = document.getElementById('selfie-icon');
  if (icon) icon.style.display = 'none';
  const btn = document.getElementById('selfie-btn');
  if (btn) btn.className = 'selfie-btn done face-verified';
  const txt = document.getElementById('selfie-text');
  if (txt) txt.textContent = '✓ Đã xác minh khuôn mặt';
  const sub = document.getElementById('selfie-sub');
  const simPct = verifyResult && verifyResult.match_pct !== undefined
    ? verifyResult.match_pct
    : Math.round((1 - ((verifyResult && verifyResult.distance) || 0)) * 100);
  if (sub) sub.textContent = 'Độ khớp ' + simPct + '% · Bấm để quét lại';
  updateSubmitBtn();
}

async function _moCameraDialog(facingMode){
  let dlg = document.getElementById('cameraDialog');
  if(!dlg){
    dlg = document.createElement('div');
    dlg.id = 'cameraDialog';
    dlg.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    dlg.innerHTML = `
      <video id="cameraVideo" autoplay playsinline style="max-width:100%;max-height:75vh;background:#000"></video>
      <div style="position:absolute;top:16px;left:16px;color:#fff;font-size:14px" id="cameraStatus">⏳ Đang mở camera...</div>
      <div style="position:absolute;bottom:30px;left:0;right:0;display:flex;gap:16px;justify-content:center;align-items:center">
        <button onclick="dongCamera()" style="padding:14px 22px;background:#444;color:#fff;border:none;border-radius:50px;font-size:14px">Hủy</button>
        <button onclick="chupAnhCamera()" id="btn-chup-anh" style="width:72px;height:72px;border-radius:50%;background:#fff;border:5px solid #ccc;font-size:32px">📷</button>
      </div>
    `;
    document.body.appendChild(dlg);
  }
  dlg.style.display = 'flex';
  _cameraVideo = document.getElementById('cameraVideo');
  const status = document.getElementById('cameraStatus');

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Browser không hỗ trợ camera');
    }
    _cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    _cameraVideo.srcObject = _cameraStream;
    status.textContent = '📷 Bấm nút để chụp';
  } catch(e) {
    status.textContent = '❌ Không truy cập được camera';
    const btnChup = document.getElementById('btn-chup-anh');
    if(btnChup) btnChup.style.display = 'none';
    status.innerHTML = '❌ Thiết bị không có camera hoặc chưa cấp quyền.<br><br>' +
      '<span style="font-size:13px;color:#ccc">Vui lòng:<br>' +
      '• Sử dụng điện thoại có camera<br>' +
      '• Cấp quyền truy cập camera cho trình duyệt</span>';
  }
}

function dongCamera(){
  if(_cameraStream){
    _cameraStream.getTracks().forEach(t=>t.stop());
    _cameraStream = null;
  }
  const dlg = document.getElementById('cameraDialog');
  if(dlg) dlg.style.display = 'none';
}

function chupAnhCamera(){
  if(!_cameraVideo || !_cameraStream)return;
  const v = _cameraVideo;
  const w = v.videoWidth, h = v.videoHeight;
  if(!w || !h){ alert('Camera chưa sẵn sàng, đợi 1s rồi thử lại'); return; }
  // Resize về 800px
  const MAX = 800;
  let nw = w, nh = h;
  if(w > h){ if(w > MAX){ nh = Math.round(h*MAX/w); nw = MAX; } }
  else { if(h > MAX){ nw = Math.round(w*MAX/h); nh = MAX; } }
  const canvas = document.createElement('canvas');
  canvas.width = nw; canvas.height = nh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(v, 0, 0, nw, nh);
  // Watermark
  const now = new Date();
  const ts = pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds())+'  '+pad(now.getDate())+'/'+pad(now.getMonth()+1)+'/'+now.getFullYear();
  ctx.font = '13px monospace'; ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(0, nh-26, nw, 26);
  ctx.fillStyle = 'white';
  ctx.fillText('📍 '+ts+'  '+(SESSION ? SESSION.ma : ''), 8, nh-9);
  const b64 = canvas.toDataURL('image/jpeg', 0.75);
  dongCamera();

  // Routing theo target
  if(_cameraTarget === 'cham_cong'){
    state.selfieB64 = b64; state.selfieOk = true;
    state.selfieCaptureTs = Date.now(); // [v10.85] timestamp chụp ảnh
    const preview = document.getElementById('selfie-preview');
    preview.src = b64; preview.style.display = 'block';
    document.getElementById('selfie-icon').style.display = 'none';
    document.getElementById('selfie-btn').className = 'selfie-btn done';
    document.getElementById('selfie-text').textContent = 'Ảnh đã chụp ✓';
    document.getElementById('selfie-sub').textContent = 'Bấm để chụp lại nếu cần';
    updateSubmitBtn();
  } else if(_cameraTarget === 'don_nghi'){
    _dnAnhB64 = b64;
    const prev = document.getElementById('dn-anh-preview');
    if(prev){ prev.src = b64; prev.style.display = 'block'; }
    const btn = document.getElementById('dn-anh-btn');
    if(btn) btn.textContent = '✓ Đã đính kèm ảnh';
  } else if(_cameraTarget === 'lich_nghi' && _cameraNgay){
    _npCamB64[_cameraNgay] = b64;
    const prev = document.getElementById('lcnghi-preview-' + _cameraNgay);
    if(prev){ prev.src = b64; prev.style.display = 'block'; }
  }
}

// Wrapper cho đơn nghỉ phép - mở camera sau (environment)
async function moCameraDonNghi(){
  _cameraTarget = 'don_nghi';
  await _moCameraDialog('environment');
}
// Wrapper cho lịch nghỉ
async function moCameraLichNghi(ngay){
  _cameraTarget = 'lich_nghi';
  _cameraNgay = ngay;
  await _moCameraDialog('environment');
}

// [v10.85] Bản gốc: không can thiệp EXIF, không lật gương — để iOS/Android tự xử lý theo cài đặt máy
function xuLyAnhChup(input){
  if(!input.files||!input.files[0])return;
  const file=input.files[0];
  // [v12-FIX] Kiểm tra ảnh vừa chụp (lastModified < 120s trước)
  const ageMs = Date.now() - (file.lastModified || 0);
  if(ageMs > 120000){ // 2 phút
    const errEl = document.getElementById('camera-err');
    if(errEl){ errEl.textContent = '⚠ Ảnh không hợp lệ — vui lòng chụp ảnh mới bằng camera, không chọn từ thư viện.'; errEl.style.display = 'block'; }
    showToast('⚠ Không được chọn ảnh cũ. Vui lòng chụp ảnh mới.', 'err');
    input.value = '';
    return;
  }
  // Ẩn lỗi cũ
  const errEl2 = document.getElementById('camera-err');
  if(errEl2) errEl2.style.display = 'none';
  const reader=new FileReader();
  reader.onload=function(e){
    const img=new Image();
    img.onload=function(){
      const MAX=800;let w=img.width,h=img.height;
      if(w>h){if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}}
      else{if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}}
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);
      const now=new Date();
      const ts=pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds())+'  '+pad(now.getDate())+'/'+pad(now.getMonth()+1)+'/'+now.getFullYear();
      ctx.font='13px monospace';ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(0,h-26,w,26);
      ctx.fillStyle='white';ctx.fillText('📍 '+ts+'  '+SESSION.ma,8,h-9);
      state.selfieB64=canvas.toDataURL('image/jpeg',0.75);state.selfieOk=true;
      state.selfieCaptureTs = Date.now(); // [v10.85]
      const preview=document.getElementById('selfie-preview');
      preview.src=state.selfieB64;preview.style.display='block';
      document.getElementById('selfie-icon').style.display='none';
      document.getElementById('selfie-btn').className='selfie-btn done';
      document.getElementById('selfie-text').textContent='Ảnh đã chụp ✓';
      document.getElementById('selfie-sub').textContent='Bấm để chụp lại nếu cần';
      updateSubmitBtn();
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
function stopCamera(){}

// ─── SUBMIT ─────────────────────────────────────────────────
function updateSubmitBtn(){
  if(state.submitted)return;
  const maCH=document.getElementById('sel-cuahang').value;
  if(!maCH)       {setBtn('s-disabled','Chọn cửa hàng trước');return;}
  // [v10.85 YC#8] Nếu CH chọn là vị trí di động (Đội SALE / Cơ Động) → phải chọn thêm CH thực tế
  const tenCHHien = document.getElementById('input-ch-display').value || '';
  if (_laViTriDiDong(tenCHHien)){
    const targetMa = document.getElementById('sel-sale-target').value;
    if (!targetMa){ setBtn('s-disabled','Chọn CH thực tế đang đến'); return; }
  }
  if(!state.loai) {setBtn('s-disabled','Chọn thời điểm chấm công');return;}
  if(!state.gpsOk){setBtn('s-disabled','Cần xác nhận vị trí GPS');return;}
  if(!state.selfieOk){setBtn('s-disabled','Cần chụp ảnh xác minh');return;}
  setBtn('s-ready','XÁC NHẬN — '+state.loai.toUpperCase());
}
function setBtn(cls,txt){const b=document.getElementById('submit-btn');b.className='submit-btn '+cls;b.textContent=txt;}

// [v11.3 CC-05] Handler khi user tick/bỏ tick checkbox Trưởng ca
function onTruongCaChange(){
  // Chỉ là visual feedback, value sẽ được lấy lại lúc submit
  const cb = document.getElementById('tc-checkbox');
  if(cb && cb.checked) {
    if(navigator.vibrate) try{ navigator.vibrate(15); }catch(e){}
  }
}

// [v10.85] Kiểm tra dữ liệu chấm công còn tươi không (≤ 60s)
// [v10.85] Lấy từ settings, fallback 60s
function _ccFreshLimitMs(){ return Number(_getSetting('cc.fresh_seconds', 60)) * 1000; }
function _ccDataExpired(){
  const now = Date.now();
  const lim = _ccFreshLimitMs();
  if (state.gpsOk && state.gpsCaptureTs && (now - state.gpsCaptureTs > lim)) return 'gps';
  if (state.selfieOk && state.selfieCaptureTs && (now - state.selfieCaptureTs > lim)) return 'selfie';
  return null;
}
function _ccCountdownTick(){
  if (state.submitted || state.submitting) return;
  const now = Date.now();
  // GPS countdown
  if (state.gpsOk && state.gpsCaptureTs) {
    const left = Math.ceil((_ccFreshLimitMs() - (now - state.gpsCaptureTs)) / 1000);
    if (left > 0 && left <= 60) {
      const sub = document.getElementById('gps-sub');
      if (sub && state.gpsAcc != null) {
        const isWeak = state.gpsAcc > Number(_getSetting("cc.gps_weak_threshold_m", 100));
        const baseTxt = '±' + state.gpsAcc + 'm';
        sub.innerHTML = baseTxt + ' · <span style="color:'+(left<=15?'#DC2626':'#D97706')+';font-weight:700">Còn ' + left + 's</span>';
      }
    }
  }
  // Ảnh countdown
  if (state.selfieOk && state.selfieCaptureTs) {
    const left = Math.ceil((_ccFreshLimitMs() - (now - state.selfieCaptureTs)) / 1000);
    if (left > 0 && left <= 60) {
      const sub = document.getElementById('selfie-sub');
      if (sub) sub.innerHTML = '<span style="color:'+(left<=15?'#DC2626':'#D97706')+';font-weight:700">Còn ' + left + 's trước khi hết hạn</span>';
    }
  }
}
function _ccInvalidateStale(){
  if (state.submitted || state.submitting) return;
  const now = Date.now();
  let changed = false;
  if (state.gpsOk && state.gpsCaptureTs && (now - state.gpsCaptureTs > _ccFreshLimitMs())) {
    state.gpsOk = false; state.lat = null; state.lng = null; state.gpsAcc = null; state.gpsCaptureTs = null;
    const btn = document.getElementById('gps-btn');
    if (btn) { btn.className = 'gps-btn'; }
    const lbl = document.getElementById('gps-label'); if (lbl) lbl.textContent = 'Bấm để lấy vị trí';
    const sub = document.getElementById('gps-sub'); if (sub) sub.textContent = 'Đã quá ' + (_ccFreshLimitMs()/1000) + 's — cần lấy lại';
    const badge = document.getElementById('gps-badge'); if (badge) badge.textContent = 'Lấy lại';
    const icon = document.getElementById('gps-icon'); if (icon) icon.textContent = '📍';
    changed = true;
  }
  if (state.selfieOk && state.selfieCaptureTs && (now - state.selfieCaptureTs > _ccFreshLimitMs())) {
    state.selfieOk = false; state.selfieB64 = null; state.selfieCaptureTs = null;
    const preview = document.getElementById('selfie-preview');
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    const sIcon = document.getElementById('selfie-icon'); if (sIcon) sIcon.style.display = '';
    const sBtn = document.getElementById('selfie-btn'); if (sBtn) sBtn.className = 'selfie-btn';
    const sText = document.getElementById('selfie-text'); if (sText) sText.textContent = 'Chụp ảnh xác minh';
    const sSub = document.getElementById('selfie-sub'); if (sSub) sSub.textContent = 'Đã quá ' + (_ccFreshLimitMs()/1000) + 's — cần chụp lại';
    changed = true;
  }
  if (changed) {
    updateSubmitBtn();
    if (typeof showToast === 'function') showToast('⚠ Dữ liệu chấm công đã hết hạn ' + (_ccFreshLimitMs()/1000) + 's, vui lòng lấy lại GPS / chụp ảnh', 'warn');
  }
  _ccCountdownTick();
}
setInterval(_ccInvalidateStale, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) _ccInvalidateStale(); });

function doSubmit(){
  if(state.submitting||state.submitted)return;
  if(document.getElementById('submit-btn').classList.contains('s-disabled'))return;
  if(!SESSION)return;

  // [v10.85] Chặn nếu hệ thống đang bảo trì
  const maint = _getSetting('sys.maintenance_mode', false);
  if ((maint === true || maint === 'true') && String(SESSION.vaiTro||'').toUpperCase() !== 'ADMIN') {
    if (typeof showToast === 'function') showToast('🔧 ' + _getSetting('sys.maintenance_message', 'Hệ thống đang bảo trì'), 'warn');
    return;
  }

  // [v10.85] Chặn nếu GPS hoặc ảnh đã quá 60s
  const expired = _ccDataExpired();
  if (expired) {
    _ccInvalidateStale();
    return;
  }

  // [v12.4] Face verify đã chạy ở moCamera() khi face BẬT → không cần check ở đây nữa
  // [v17.40] Bảng hỏi Trưởng ca khi vào ca + ca chưa có TC + chưa tick nút gạt
  if(typeof tcCheckDialogBeforeSubmit==='function'){ tcCheckDialogBeforeSubmit(_doSubmitContinueWithGPS); }
  else { _doSubmitContinueWithGPS(); }
}

// [v12.2] Tách phần GPS pre-check ra thành hàm riêng để gọi sau face verify
function _doSubmitContinueWithGPS(){
  // [v11.3 GPS-02] Pre-check: nếu user xa CH đã chọn > 200m → tìm CH gần nhất
  const maCH = document.getElementById('sel-cuahang').value;
  const lat = state.lat, lng = state.lng;
  if(lat && lng && maCH){
    const chDaChon = (typeof CH_LIST !== 'undefined' ? CH_LIST.find(c => c.ma === maCH) : null);
    if(chDaChon && chDaChon.lat && chDaChon.lng){
      const dChosen = _distMeters(lat, lng, parseFloat(chDaChon.lat), parseFloat(chDaChon.lng));
      if(dChosen > 200){
        let nearest = null;
        let minD = Infinity;
        CH_LIST.forEach(ch => {
          if(ch.ma === maCH || !ch.lat || !ch.lng) return;
          const d = _distMeters(lat, lng, parseFloat(ch.lat), parseFloat(ch.lng));
          if(d < minD && d <= 200){ minD = d; nearest = {...ch, khoangCach: Math.round(d)}; }
        });
        if(nearest){
          gpsShowModal({chDaChon: {...chDaChon, khoangCach: Math.round(dChosen)}, nearest});
          return;
        }
      }
    }
  }
  _doSubmitFinal();
}

// [v11.3 GPS] Tính khoảng cách haversine ở client
function _distMeters(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// [v11.3 GPS-02] Show modal đề xuất chọn lại CH
let _gpsModalCtx = null;
function gpsShowModal(ctx){
  _gpsModalCtx = ctx;
  document.getElementById('gps-md-sub').textContent =
    `Bạn đang ở vị trí cách "${ctx.chDaChon.ten}" ${ctx.chDaChon.khoangCach}m, nhưng cách "${ctx.nearest.ten}" chỉ ${ctx.nearest.khoangCach}m`;
  document.getElementById('gps-opt-near-name').innerHTML =
    bhEscHtmlGps(ctx.nearest.ten) + '<span class="gps-option-pill green">Đề xuất</span>';
  document.getElementById('gps-opt-near-meta').textContent =
    `Cách bạn ${ctx.nearest.khoangCach}m · Đổi sang cửa hàng này`;
  document.getElementById('gps-opt-keep-name').innerHTML =
    bhEscHtmlGps(ctx.chDaChon.ten) + '<span class="gps-option-pill gray">Giữ nguyên</span>';
  document.getElementById('gps-opt-keep-meta').textContent =
    `Cách bạn ${ctx.chDaChon.khoangCach}m · Cần giải trình lý do (đi nộp tiền NH...)`;
  document.getElementById('gps-md').classList.add('show');
  document.getElementById('gps-md-bd').classList.add('show');
  document.getElementById('gps-md-bd').onclick = gpsCloseModal;
}
function gpsCloseModal(){
  document.getElementById('gps-md').classList.remove('show');
  document.getElementById('gps-md-bd').classList.remove('show');
}
function bhEscHtmlGps(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// [v11.3 GPS-02] User chọn CH gần nhất → tự đổi rồi submit
function gpsChonChGan(){
  if(!_gpsModalCtx) return;
  // Đổi mã CH đã chọn
  document.getElementById('sel-cuahang').value = _gpsModalCtx.nearest.ma;
  document.getElementById('input-ch-display').value = _gpsModalCtx.nearest.ten;
  gpsCloseModal();
  _doSubmitFinal();
}
// [v11.3 GPS-02] User giữ CH đã chọn → submit như cũ (sẽ bị tag "Sai vị trí" → giải trình)
function gpsGiuChDaChon(){
  gpsCloseModal();
  _doSubmitFinal();
}

function _doSubmitFinal(){
  // [v11.6 Item 1] Fire-and-forget — phản hồi xanh NGAY, server xử lý ngầm
  state.submitting=true;
  state.submitted=true;
  let maCH=document.getElementById('sel-cuahang').value;
  const tenCHDisplay = document.getElementById('input-ch-display').value;
  // [v10.85 YC#8] Đội SALE: nếu user đã chọn CH thực tế → dùng MÃ CH THỰC TẾ để check GPS đúng
  //   Lưu tên Đội SALE gốc + đổi maCH sang CH thực tế.
  let _saleOriginMa = '';
  let _saleOriginTen = '';
  let _isCoDong = false;  // [v14.7] đánh dấu Cơ Động → ghi nguon='CO_DONG'
  if (typeof _laViTriDiDong === 'function' && _laViTriDiDong(tenCHDisplay, maCH)){
    const tgMa = document.getElementById('sel-sale-target').value;
    const tgTen = document.getElementById('input-sale-target-display').value;
    if (tgMa){
      _saleOriginMa = maCH;
      _saleOriginTen = tenCHDisplay;
      _isCoDong = (typeof _laCoDong === 'function') && _laCoDong(tenCHDisplay, maCH);
      maCH = tgMa;  // đổi sang CH thực tế để backend check GPS theo LAT/LNG đúng
    }
  }
  const truongCa = document.getElementById('tc-checkbox') ? document.getElementById('tc-checkbox').checked : false;
  const nowStr = new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  const ngayCham = new Date().toISOString().substring(0, 10);

  // Pre-check ở client: tính xem có sai vị trí không (để hiển thị UI sớm)
  let preCheckGPS = null;
  let preKhoangCach = null;
  try {
    const ch = (typeof CH_LIST !== 'undefined' ? CH_LIST.find(c => c.ma === maCH) : null);
    if (ch && ch.lat && ch.lng && state.lat && state.lng) {
      preKhoangCach = Math.round(_distMeters(state.lat, state.lng, parseFloat(ch.lat), parseFloat(ch.lng)));
      preCheckGPS = preKhoangCach <= Number(_getSetting('cc.gps_radius_m', 100)); // [v10.85] từ setting
    }
  } catch(e){}

  // [v16.7] KHÔNG báo thành công vội — CHỜ server xác nhận để tránh mất bản ghi khi mạng lỗi
  setBtn('s-loading', '⏳ Đang chấm công...');
  const rb = document.getElementById('result-box');
  rb.style.display = 'block';
  rb.className = 'result-box r-ok';
  rb.innerHTML = '⏳ Đang gửi lên hệ thống, vui lòng đợi...';

  // [v12-P2] Gửi server qua Supabase Storage + RPC
  // 1) Upload ảnh selfie lên Storage trước (nếu có) → lấy URL
  // 2) Gọi RPC fn_ghi_cham_cong_v2 với URL ảnh
  // Map loại chấm công text → enum
  const loaiEnumMap = { 'Vào ca':'VAO_CA', 'Ra ca':'RA_CA', 'Ra giữa ca':'RA_GIUA_CA', 'Vào giữa ca':'VAO_GIUA_CA' };
  const loaiEnum = loaiEnumMap[state.loai] || 'VAO_CA';
  const idemKey = 'cc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  (async () => {
    let anhUrl = null, anhPath = null;
    // Upload ảnh nếu có
    if (state.selfieB64) {
      try {
        const b64 = String(state.selfieB64).replace(/^data:image\/\w+;base64,/, '');
        const byteChars = atob(b64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const today = new Date();
        const dStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
        anhPath = dStr + '/' + (SESSION.ma||'KHAC') + '_' + Date.now() + '.jpg';
        const { error: upErr } = await supa.storage.from('cham-cong-anh').upload(anhPath, blob, { contentType: 'image/jpeg' });
        if (!upErr) {
          const { data: urlData } = supa.storage.from('cham-cong-anh').getPublicUrl(anhPath);
          anhUrl = urlData ? urlData.publicUrl : null;
        }
      } catch(e) { console.warn('[CC] upload ảnh lỗi:', e); }
    }

    // [v10.85 YC#8] Đội SALE: maCH đã đổi sang CH thực tế ở _doSubmitFinal
    //   → đính kèm Đội SALE gốc vào device_info để Sheet sync ghép tên đúng
    let _deviceInfo = navigator.userAgent.substring(0, 180);
    if (_saleOriginMa && _saleOriginTen){
      _deviceInfo = '[SALE_ORIGIN:' + _saleOriginMa + '|' + _saleOriginTen + '] ' + _deviceInfo;
    }
    // [v10.85 YC#4] Đính kèm flag GPS_WEAK nếu accuracy > 100m → QLNS biết để xem xét linh hoạt
    if (state.gpsAcc && state.gpsAcc > Number(_getSetting("cc.gps_weak_threshold_m", 100))){
      _deviceInfo = '[GPS_WEAK:' + state.gpsAcc + 'm] ' + _deviceInfo;
    }

    // [v16.7] Gọi RPC với retry — CHỜ xác nhận success=true mới báo thành công
    let res = null, lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++){
      try {
        const { data, error } = await supa.rpc('fn_ghi_cham_cong_v2', {
          p_ma_nv: SESSION.ma,
          p_ten_nv: SESSION.ten,
          p_ma_ch: maCH,
          p_loai: loaiEnum,
          p_lat: state.lat,
          p_lng: state.lng,
          p_gps_accuracy: state.gpsAcc,
          p_anh_url: anhUrl,
          p_anh_path: anhPath,
          p_truong_ca: !!truongCa,
          p_idempotency_key: idemKey,
          p_device_info: _deviceInfo,
          p_nguon: _isCoDong ? 'CO_DONG' : null
        });
        if (!error && data && data.success !== false){ res = data; break; }
        lastErr = (error && error.message) || (data && data.error) || 'Lỗi không xác định';
      } catch(ex){ lastErr = (ex && ex.message) || 'Lỗi mạng'; }
      // Chưa thành công → thử lại (trừ lần cuối), backoff tăng dần
      if (attempt < 3){
        setBtn('s-loading', '⏳ Mạng chậm, thử lại (' + attempt + '/3)...');
        await new Promise(r => setTimeout(r, 1200 * attempt));
      }
    }

    // [v16.7] Thất bại sau 3 lần → BÁO LỖI RÕ, KHÔNG thêm lịch sử, cho chấm lại
    if (!res){
      console.error('CC failed after retries:', lastErr);
      _ccChamThatBai('Kiểm tra mạng rồi chấm lại');
      return;
    }

    // [v16.7] ĐÃ XÁC NHẬN từ server (idempotency_key chống ghi trùng) → giờ mới báo thành công
    const realTime = res.timestamp ? res.timestamp.substring(11,19) : nowStr;
    setBtn('s-done', '✓ Đã chấm công thành công');
    if (res.coLoiGPS){
      rb.className = 'result-box r-warn';
      rb.innerHTML = '⚠ <strong>' + state.loai + '</strong> · Ngoài vùng (' + (res.khoangCach||preKhoangCach||'?') + 'm) · Đã cảnh báo QLNS';
    } else {
      rb.className = 'result-box r-ok';
      rb.innerHTML = '✓ <strong>' + state.loai + '</strong> · ' + realTime;
    }
    // Thêm vào lịch sử local (giờ chắc chắn đã vào DB)
    const lbMap = {'Vào ca':'lb-v','Ra ca':'lb-r','Ra giữa ca':'lb-rg','Vào giữa ca':'lb-vg'};
    logs.unshift({
      loai:state.loai, lbcls:lbMap[state.loai]||'lb-v', time:realTime,
      dist: (res.khoangCach!=null ? res.khoangCach+'m' : (preKhoangCach!=null ? preKhoangCach+'m' : '--')),
      ok: !res.coLoiGPS, xacNhan: res.coLoiGPS ? 'KHÔNG HỢP LỆ' : 'OK',
      ghiChu:'', loiType: res.coLoiGPS ? 'gps' : '',
      tenCH:tenCHDisplay, ngay:ngayCham,
    });
    renderLog();

    // Xử lý cảnh báo / giải trình / đếm ngược
    if (res.coLoiGPS || res.coLoiThuTu || (res.canhBao && res.canhBao.length > 0)) {
      if (state.loai === 'Ra ca') hienTomTatCa(realTime);
      const khoangCach = res.khoangCach || preKhoangCach || '?';
      // [v12-FIX] Hiện rõ loại lỗi thay vì "Chấm công cần xác nhận"
      const loiParts = [];
      if(res.coLoiGPS) loiParts.push('Sai vị trí (' + khoangCach + 'm)');
      if(res.coLoiThuTu) loiParts.push('Sai ca');
      const title = '⚠️ ' + (loiParts.length ? loiParts.join(' + ') : 'Cần giải trình');
      const subParts = [];
      if(res.coLoiGPS) subParts.push('Vị trí chấm công cách cửa hàng ' + khoangCach + 'm');
      if(res.coLoiThuTu) subParts.push('Chấm công không đúng trình tự ca');
      const sub = (subParts.length ? subParts.join('. ') + '. ' : '') + 'Vui lòng giải trình để quản lý duyệt.';
      _gtCcId = res.id || ''; // cham_cong_id vừa tạo
      // [v8.1] Set loại lỗi để modal hiện UI sửa CH/loại ca ngay
      _gtLoiType = res.coLoiGPS ? 'gps' : (res.coLoiThuTu ? 'ca' : '');
      // Lấy id cảnh báo đầu tiên (BE trả về trong res.canhBao)
      _gtCbId = (res.canhBao && res.canhBao.length > 0) ? (res.canhBao[0].id || res.canhBao[0].cbId || '') : '';
      openGiaiTrinh(title, sub, res.ngayChamCong || ngayCham, res.id);
      _gtSetupSuaUI();
      startGtTimer(300);
    } else if (state.loai === 'Ra ca') {
      hienTomTatCa(realTime);
      startCountdown(30);
    } else {
      startCountdown(30);
    }
  })().catch((e) => {
    console.error('CC exception:', e);
    _ccChamThatBai('Kiểm tra mạng rồi chấm lại');
  });
}

// [v16.7] Chấm công thất bại (mạng/server lỗi sau khi đã thử lại) — KHÔNG ghi lịch sử giả,
//          reset nút để nhân viên chấm lại, báo lỗi rõ ràng.
function _ccChamThatBai(msg){
  state.submitting = false;
  state.submitted = false;
  const rb = document.getElementById('result-box');
  if (rb){
    rb.style.display = 'block';
    rb.className = 'result-box r-warn';
    rb.innerHTML = '✗ <strong>Chấm công CHƯA thành công</strong> · ' + (msg || 'Vui lòng chấm lại');
  }
  showToast('✗ Chưa gửi được — vui lòng chấm lại', 'warn');
  updateSubmitBtn(); // dựng lại nút XÁC NHẬN để chấm lại
}

// ─── COUNTDOWN (reload trang) ────────────────────────────────
let _countdownTimer=null;
function startCountdown(giay){
  clearInterval(_countdownTimer);
  const bar=document.getElementById('countdown-bar');bar.style.display='block';let dem=giay;
  bar.textContent='Trang sẽ làm mới sau '+dem+' giây...';
  _countdownTimer=setInterval(()=>{
    dem--;
    if(dem<=0){clearInterval(_countdownTimer);location.reload();}
    else bar.textContent='Trang sẽ làm mới sau '+dem+' giây...';
  },1000);
}

// ─── TÓM TẮT CA ─────────────────────────────────────────────
function hienTomTatCa(gioRaCa){
  const card=document.getElementById('summary-card'),rows=document.getElementById('summary-rows');
  card.style.display='block';rows.innerHTML='<div style="font-size:12px;color:var(--text-m)">Đang tải...</div>';
  document.getElementById('summary-total-val').textContent='--';
  // [v12-P2] Supabase RPC
  supa.rpc('fn_get_lich_su_hom_nay', { p_ma_nv: SESSION.ma }).then(({ data, error }) => {
    const ls = (!error && Array.isArray(data)) ? data : [];
    if(!ls.length){rows.innerHTML='<div style="font-size:12px;color:var(--text-m)">Không có dữ liệu</div>';return;}
    let html='',gioVao='',gioRaG='',tgRaNgoai=0;
    ls.forEach(l=>{
      html+='<div class="summary-row"><span class="summary-label">'+l.loai+'</span><span class="summary-value">'+l.gio+'</span></div>';
      if(l.loai==='Vào ca')gioVao=l.gio;if(l.loai==='Ra giữa ca')gioRaG=l.gio;
      if(l.loai==='Vào giữa ca'&&gioRaG){tgRaNgoai+=toPhut(l.gio)-toPhut(gioRaG);gioRaG='';}
    });
    const tp=gioVao?toPhut(gioRaCa)-toPhut(gioVao)-tgRaNgoai:0;
    rows.innerHTML=html;document.getElementById('summary-total-val').textContent=tp>0?fmtPhut(tp):'--';
  }).catch(()=>{rows.innerHTML='<div style="font-size:12px;color:var(--red)">Lỗi tải</div>';});
}
function toPhut(s){if(!s)return 0;const p=s.split(':').map(Number);return p[0]*60+(p[1]||0)+(p[2]||0)/60;}
function fmtPhut(m){const g=Math.floor(m/60),p=Math.round(m%60);return g+'g '+String(p).padStart(2,'0')+'p';}

// ─── LỊCH SỬ HÔM NAY ────────────────────────────────────────
function taiLichSu(){
  if(!SESSION)return;
  console.log('[taiLichSu] gọi cho ma_nv:', SESSION.ma);
  // [v12-P2] Supabase RPC
  supa.rpc('fn_get_lich_su_hom_nay', { p_ma_nv: SESSION.ma }).then(async ({ data, error }) => {
    if (error) {
      console.error('[taiLichSu] LỖI:', error);
      return;
    }
    console.log('[taiLichSu] data:', data);
    const ls = (Array.isArray(data)) ? data : [];
    if(!ls.length) {
      console.log('[taiLichSu] không có data');
      logs.length = 0;
      try { renderLog(); } catch(e) {}
      return;
    }
    const lbMap={'Vào ca':'lb-v','Ra ca':'lb-r','Ra giữa ca':'lb-rg','Vào giữa ca':'lb-vg'};
    const today=new Date().toISOString().substring(0,10);
    // [v10.85] Build doiMap từ cham_cong hôm nay (RPC này không trả device_info)
    try {
      const { data: ccData } = await supa.from('cham_cong')
        .select('ma_nv, ngay, ten_ch_snapshot, ghi_chu, device_info')
        .eq('ma_nv', SESSION.ma).eq('ngay', today);
      window._doiSaleMap = _buildDoiSaleMap(ccData || []);
    } catch(e) { window._doiSaleMap = {}; }
    logs.length=0;
    ls.slice().reverse().forEach(l=>{
      const isLoi=l.xacNhan==='KHÔNG HỢP LỆ';
      const cbList = l.canhBaoList || [];
      logs.push({
        ccId:l.ccId||'',
        loai:l.loai, lbcls:lbMap[l.loai]||'lb-v',
        time:l.gio.substring(0,5), dist:'--',
        ok:!isLoi, xacNhan:l.xacNhan||'',
        ghiChu:l.ghiChu||'',
        tenCH:l.tenCH||'', ngay:today,
        truongCa: l.truongCa || '',
        canhBaoList: cbList,
      });
    });
    renderLog();
  }).catch((e)=>{
    console.error('[taiLichSu] catch:', e);
  });
}

function renderLog(){
  const el=document.getElementById('log-list');
  if(!logs.length){el.innerHTML='<div class="log-empty">Chưa có dữ liệu hôm nay.</div>';return;}
  el.innerHTML=logs.map((l,i)=>{
    const cbList = l.canhBaoList || [];

    // [v5.4] Trạng thái mỗi log TÍNH TỪ CB CỦA RIÊNG LOG ĐÓ (không gộp theo cham_cong.xac_nhan)
    // - Có CB CHUA_GIAI_TRINH / DA_GIAI_TRINH → log đang CẢNH BÁO
    // - Tất cả CB đã DA_DUYET → log "Đã được duyệt"
    // - Có CB TU_CHOI và không còn cb chưa xử lý → log "Bị từ chối"
    // - Không có CB → Hợp lệ
    const cbCho   = cbList.filter(cb => cb.trangThai === 'CHUA_GIAI_TRINH' || cb.trangThai === 'DA_GIAI_TRINH');
    const cbDuyet = cbList.filter(cb => cb.trangThai === 'DA_DUYET');
    const cbTuChoi= cbList.filter(cb => cb.trangThai === 'TU_CHOI');

    let logStatus; // 'CHO' | 'DUYET' | 'TUCHOI' | 'OK'
    if (cbCho.length > 0)                          logStatus = 'CHO';
    else if (cbDuyet.length > 0 && cbTuChoi.length === 0) logStatus = 'DUYET';
    else if (cbTuChoi.length > 0)                  logStatus = 'TUCHOI';
    else                                           logStatus = 'OK';

    const isLoi = (logStatus === 'CHO' || logStatus === 'TUCHOI');

    // Text trạng thái tổng của log dựa vào CB chưa xử lý
    let stTxt='',stCls='ls-ok';
    if(logStatus === 'CHO'){
      const types = cbCho.map(cb=>cb.loiType);
      if(types.includes('gps') && types.includes('ca'))  { stTxt='Sai vị trí + Sai ca'; stCls='ls-gps'; }
      else if(types.includes('gps'))                     { stTxt='Sai vị trí'; stCls='ls-gps'; }
      else if(types.includes('thieu'))                   { stTxt='Thiếu Ra ca'; stCls='ls-ca'; }
      else                                               { stTxt='Sai ca'; stCls='ls-ca'; }
    } else if(logStatus === 'TUCHOI'){
      stTxt='Bị từ chối'; stCls='ls-gps';
    }

    let errRows='';
    if(logStatus === 'CHO'){
      const loiLabels = cbCho.map(cb=>cb.loiType==='gps'?'📍 Sai vị trí':cb.loiType==='ca'?'🔄 Sai ca':cb.loiType==='thieu'?'⏰ Thiếu Ra ca':'⚠ '+cb.loaiCB);
      const tatCaDaGT = cbCho.every(cb => cb.daGiaiTrinh || !!cb.giaiTrinh);
      const giaiTrinhText = (cbCho.find(cb => cb.giaiTrinh) || {}).giaiTrinh || '';
      const loiDisplay = loiLabels.join(' · ');
      const ghiChuShow = giaiTrinhText || 'Chưa có giải trình';
      let btn='';
      if(tatCaDaGT){
        btn='<button class="log-gt-btn lgt-da" disabled>Đã giải trình</button>';
      } else {
        const allCbIds = cbCho.filter(cb=>!cb.daGiaiTrinh && !cb.giaiTrinh).map(cb=>cb.cbId).join(',');
        // [v7.0] truyền loaiCB + cbId đầu tiên để modal biết hiện UI sửa CH/loại ca
        const firstCb = cbCho.find(cb=>!cb.daGiaiTrinh && !cb.giaiTrinh) || cbCho[0];
        const cbType = firstCb ? (firstCb.loiType || '') : '';
        const cbId1  = firstCb ? firstCb.cbId : '';
        btn=`<button class="log-gt-btn lgt-chua" onclick="moGiaiTrinhNhieuCB('${allCbIds}','${l.ngay||''}','${l.ccId||''}','${cbType}','${cbId1}')">Giải trình</button>`;
      }
      errRows=`<div class="log-item-err"><span class="log-err-txt">${loiDisplay}: ${ghiChuShow}</span>${btn}</div>`;
    } else if(logStatus === 'TUCHOI'){
      errRows='<div class="log-item-err"><span class="log-err-txt" style="color:var(--red)">✗ Giải trình bị từ chối</span></div>';
    } else if(logStatus === 'DUYET'){
      errRows='<div class="log-item-err"><span class="log-err-txt" style="color:var(--green-m)">✓ Đã được duyệt</span></div>';
    }

    return `<div class="log-item">
      <div class="log-item-top">
        <span class="log-badge ${l.lbcls}">${l.loai}</span>
        <span class="log-time">${l.time}</span>
        ${l.tenCH?`<span class="log-ch">· ${_fmtChVoiDoiSale(SESSION&&SESSION.ma, l.tenCH, l.ngay)}</span>`:''}
        ${isLoi?`<span class="log-st ${stCls}">⚠ ${stTxt}</span>`:`<span class="log-st ls-ok">✓ Hợp lệ</span>`}
      </div>
      ${errRows}
    </div>`;
  }).join('');
}

function moGiaiTrinhTuLog(ngay){
  openGiaiTrinh('⚠️ Giải trình chấm công', 'Vui lòng chọn lý do để QLNS xem xét.', ngay);
  document.getElementById('gt-timer').style.display='none';
}

// [v7.0] State cho phần NV sửa CH/loại ca
let _gtCbId = '';
let _gtLoiType = '';   // 'gps' | 'ca' | 'thieu' | ''
let _gtCcMaCH = '';    // mã CH của log gốc

// [v12-FIX] Giải trình tất cả CB cùng lúc — dùng chung 1 modal
// [v7.0] Thêm tham số loaiCB + cbId để show UI sửa tương ứng
function moGiaiTrinhNhieuCB(cbIdsStr, ngay, ccId, loiType, cbId){
  _gtCcId = ccId || '';
  _gtCbId = cbId || '';
  _gtLoiType = loiType || '';
  openGiaiTrinh('⚠️ Giải trình chấm công', 'Vui lòng chọn lý do để QLNS xem xét.', ngay);
  document.getElementById('gt-timer').style.display='none';
  // [v7.0] Hiện UI sửa CH / loại ca nếu là lỗi GPS/SAI CH/SAI CA
  _gtSetupSuaUI();
}

// ─── GIỜ CÔNG (NV) ──────────────────────────────────────────
const THANG_VI=['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
const THU_VI=['CN','T2','T3','T4','T5','T6','T7'];
function doiThang(delta){
  const [y,m]=gcThang.split('-').map(Number);
  const d=new Date(y,m-1+delta,1);
  const now=new Date();if(d>new Date(now.getFullYear(),now.getMonth(),1))return;
  gcThang=d.getFullYear()+'-'+pad(d.getMonth()+1);taiGioCong();
}
function taiGioCong(){
  if(!SESSION)return;
  gcData=[];
  const [y,m]=gcThang.split('-').map(Number);
  document.getElementById('thang-label').textContent=THANG_VI[m]+' '+y;
  document.getElementById('gc-content').innerHTML='<div class="gc-empty">⏳ Đang tải dữ liệu...</div>';
  ['gc-so-ngay','gc-tong-gio'].forEach(id=>document.getElementById(id).textContent='--');

  // [v10.85] Đồng thời load cham_cong raw để build doiMap (detect bản ghi tại Đội SALE)
  const lastDay = new Date(y, m, 0).getDate();
  const ngayDau = gcThang + '-01';
  const ngayCuoi = gcThang + '-' + String(lastDay).padStart(2,'0');

  Promise.all([
    supa.rpc('fn_get_gio_cong_thang', { p_ma_nv: SESSION.ma, p_thang: gcThang }),
    supa.from('cham_cong')
      .select('ma_nv, ngay, ten_ch_snapshot, ghi_chu, device_info')
      .eq('ma_nv', SESSION.ma)
      .gte('ngay', ngayDau)
      .lte('ngay', ngayCuoi)
  ]).then(([gcRes, ccRes]) => {
    const error = gcRes.error;
    let d = gcRes.data;
    if (error || !d) {
      document.getElementById('gc-content').innerHTML='<div class="gc-empty" style="color:var(--red)">Lỗi tải dữ liệu.</div>';
      return;
    }
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch(e) {
        document.getElementById('gc-content').innerHTML='<div class="gc-empty" style="color:var(--red)">Lỗi parse dữ liệu.</div>';
        return;
      }
    }
    gcData = d.cacCap || [];
    // [v10.85] Build doiMap từ cham_cong để hiển thị prefix Đội SALE
    window._doiSaleMap = _buildDoiSaleMap(ccRes.data || []);
    document.getElementById('gc-so-ngay').textContent = d.soNgay || 0;
    const tongGioGiay = Math.round((Number(d.tongGio)||0) * 3600);
    const tgGio = Math.floor(tongGioGiay / 3600);
    const tgPhut = Math.floor((tongGioGiay % 3600) / 60);
    document.getElementById('gc-tong-gio').textContent = tgGio + 'g ' + String(tgPhut).padStart(2,'0') + 'p';
    _renderGioCongTable();
  })
  .catch(()=>{document.getElementById('gc-content').innerHTML='<div class="gc-empty" style="color:var(--red)">Lỗi tải dữ liệu.</div>';});
}

// [v8.2] Helper: render badge trạng thái CB/bổ sung ca
// CHỈ render khi cặp KHÔNG hợp lệ (có lyDo). Cặp OK không cần badge.
function _gcBadgeTrangThai(p) {
  // Cặp hợp lệ + không có lyDo → không cần badge (đỡ rối)
  if (p.hopLe && !p.lyDo) return '';

  const cb = p.cb_trang_thai;
  const bs = p.bs_trang_thai;
  const isThieu = p.lyDo === 'THIEU_VAO' || p.lyDo === 'THIEU_RA';
  const STYLE_BASE = 'display:inline-block;padding:2px 7px;border-radius:8px;font-size:9px;font-weight:600;margin-top:3px;line-height:1.3;white-space:nowrap;';

  // Map trạng thái → style + text
  const renderBadge = (text, type) => {
    let bg, color;
    if (type === 'wait')      { bg = 'var(--amber-lt)';  color = 'var(--amber)'; }
    else if (type === 'ok')   { bg = 'var(--green-lt)';  color = 'var(--green)'; }
    else if (type === 'fail') { bg = 'var(--red-lt)';    color = 'var(--red)'; }
    else                      { bg = 'var(--gray-lt)';   color = 'var(--text-m)'; }
    return `<div style="${STYLE_BASE}background:${bg};color:${color}">${text}</div>`;
  };

  // ─── Ưu tiên 1: Có CB → hiển thị trạng thái CB ───
  if (cb) {
    if (cb === 'DA_DUYET') {
      // Đã duyệt — nhưng nếu vẫn 0g (khác CH, thiếu ra...) thì ghi rõ
      if (!p.hopLe) return renderBadge('✓ Đã duyệt (không cộng giờ)', 'ok');
      return renderBadge('✓ Đã duyệt', 'ok');
    }
    if (cb === 'TU_CHOI') {
      const ly = p.cb_ly_do_tu_choi ? ` – ${p.cb_ly_do_tu_choi.substring(0, 30)}${p.cb_ly_do_tu_choi.length > 30 ? '…' : ''}` : '';
      return renderBadge(`✕ Bị từ chối${ly}`, 'fail');
    }
    if (cb === 'DA_GIAI_TRINH') return renderBadge('⏳ Chờ duyệt', 'wait');
    if (cb === 'CHUA_GIAI_TRINH') return renderBadge('• Chưa giải trình', 'none');
  }

  // ─── Ưu tiên 2: Thiếu Vào/Ra → kiểm tra đơn xin bổ sung ───
  if (isThieu) {
    // [v10.85] Nếu Thiếu RA mà là NGÀY HÔM NAY → NV chưa chấm ra là bình thường, không cảnh báo
    if (p.lyDo === 'THIEU_RA') {
      const vnNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
      const yToday = vnNow.getFullYear() + '-' + pad(vnNow.getMonth()+1) + '-' + pad(vnNow.getDate());
      if (p.ngay === yToday) return ''; // không hiện badge
    }
    if (bs === 'DA_DUYET')      return renderBadge('✓ Đã duyệt bổ sung', 'ok');
    if (bs === 'TU_CHOI') {
      const ly = p.bs_ly_do_tu_choi ? ` – ${p.bs_ly_do_tu_choi.substring(0, 30)}${p.bs_ly_do_tu_choi.length > 30 ? '…' : ''}` : '';
      return renderBadge(`✕ Bị từ chối${ly}`, 'fail');
    }
    if (bs === 'CHO_DUYET' || bs === 'DA_GIAI_TRINH') return renderBadge('⏳ Chờ duyệt bổ sung', 'wait');
    return renderBadge('• Chưa xin bổ sung', 'none');
  }

  return '';
}

function _renderGioCongTable(){
  if(!gcData.length){
    document.getElementById('gc-content').innerHTML='<div class="gc-empty">📭 Chưa có dữ liệu tháng này</div>';
    return;
  }
  const byNgay = {};
  gcData.forEach(p => { if(!byNgay[p.ngay]) byNgay[p.ngay]=[]; byNgay[p.ngay].push(p); });

  const LY_DO_MAP = {
    'KHAC_CH':     '⚠ Khác CH',
    'CO_CANH_BAO': '⚠ Có cảnh báo',
    'THIEU_RA':    '⚠ Thiếu Ra',
    'THIEU_VAO':   '⚠ Thiếu Vào'
  };

  let rows='';
  Object.keys(byNgay).sort().forEach(ngay => {
    const dt=new Date(ngay+'T00:00:00');
    const thu=THU_VI[dt.getDay()];
    const ngFmt=pad(dt.getDate())+'/'+pad(dt.getMonth()+1);
    const caps = byNgay[ngay];
    caps.forEach((p, idx) => {
      // [v10.85] Prefix Đội SALE nếu cùng ngày NV có chấm tại Đội SALE
      const _maNV = SESSION && SESSION.ma;
      const tenVao = p.tenCHVao ? _fmtChVoiDoiSale(_maNV, p.tenCHVao, ngay) : (p.maCHVao || '');
      const tenRa  = p.tenCHRa  ? _fmtChVoiDoiSale(_maNV, p.tenCHRa,  ngay) : (p.maCHRa  || '');
      // [v8.2 - hotfix] Hiện cả 2 CH nếu khác nhau, xuống dòng cho dễ đọc, KHÔNG cắt cụt
      const khacCH = (p.tenCHVao && p.tenCHRa && p.maCHVao !== p.maCHRa);
      let chHtml;
      if (khacCH) {
        chHtml = `<div style="line-height:1.4">${tenVao} →</div><div style="line-height:1.4">${tenRa}</div>`;
      } else {
        const ten = tenVao || tenRa || '--';
        chHtml = `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ten}</div>`;
      }

      let gioCongStr = '--';
      if (p.gioCong != null) {
        const giay = Math.round(Number(p.gioCong) * 3600);
        const h = Math.floor(giay / 3600);
        const mPad = String(Math.floor((giay % 3600) / 60)).padStart(2,'0');
        gioCongStr = h + 'g ' + mPad + 'p';
      }

      // [v10.85] Ẩn cảnh báo Thiếu Ra cho ngày hôm nay (NV đang trong ca, chưa chấm ra là bình thường)
      let warnTxt = '';
      if (p.lyDo) {
        const vnNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const yToday = vnNow.getFullYear() + '-' + pad(vnNow.getMonth()+1) + '-' + pad(vnNow.getDate());
        const skipToday = (p.lyDo === 'THIEU_RA' && p.ngay === yToday);
        if (!skipToday) {
          warnTxt = `<div style="font-size:9px;color:#DC2626;line-height:1.2;margin-top:2px">${LY_DO_MAP[p.lyDo]||p.lyDo}</div>`;
        }
      }
      // [v8.2] Badge trạng thái xử lý (CB / bổ sung ca)
      const ttBadge = _gcBadgeTrangThai(p);
      const ngayCell = (idx === 0)
        ? `<div class="gc-ngay">${ngFmt}</div><div class="gc-thu">${thu}</div>${caps.length>1?'<div style="font-size:9px;color:#6B7280">'+caps.length+' cặp</div>':''}`
        : '<div style="font-size:10px;color:#9CA3AF">↳</div>';

      // [v10.85] Cell không tô đỏ nếu chỉ là Thiếu Ra hôm nay (NV đang trong ca)
      const vnNowCell = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
      const yTodayCell = vnNowCell.getFullYear() + '-' + pad(vnNowCell.getMonth()+1) + '-' + pad(vnNowCell.getDate());
      const skipTodayCell = (p.lyDo === 'THIEU_RA' && p.ngay === yTodayCell);
      const cellStyle = (p.hopLe || skipTodayCell) ? '' : 'background:#FEF2F2';

      // [v10.85] Class trạng thái cho hover/active style + border accent màu
      let rowCls = 'gc-r-ok';
      if (skipTodayCell) rowCls = 'gc-r-today';
      else if (!p.hopLe) {
        if (p.cb_trang_thai === 'DA_DUYET' || p.bs_trang_thai === 'DA_DUYET') rowCls = 'gc-r-approved';
        else if (p.cb_trang_thai === 'TU_CHOI' || p.bs_trang_thai === 'TU_CHOI') rowCls = 'gc-r-reject';
        else if (p.cb_trang_thai === 'DA_GIAI_TRINH' || p.bs_trang_thai === 'CHO_DUYET' || p.bs_trang_thai === 'DA_GIAI_TRINH') rowCls = 'gc-r-wait';
        else rowCls = 'gc-r-err';
      }

      rows += `<tr class="gc-r ${rowCls}">
        <td>${ngayCell}</td>
        <td class="gc-gio">${p.gioVao||'--'}</td>
        <td class="gc-gio">${p.gioRa||'--'}</td>
        <td class="gc-tong">${gioCongStr}${warnTxt}${ttBadge}</td>
        <td style="font-size:11px;color:var(--text-m);max-width:140px;word-break:break-word">${chHtml}</td>
      </tr>`;
    });
  });
  const soNgay=document.getElementById('gc-so-ngay').textContent;
  const tongGio=document.getElementById('gc-tong-gio').textContent;
  rows+=`<tr class="gc-total"><td colspan="3" style="font-size:11px">Tổng (${soNgay} ngày)</td><td class="gc-tong">${tongGio}</td><td></td></tr>`;
  document.getElementById('gc-content').innerHTML=`<table class="gc-table"><thead><tr><th>Ngày</th><th>Vào</th><th>Ra</th><th>Giờ công</th><th>Cửa hàng</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderGioCong(){
  if(!gcData.length){
    document.getElementById('gc-so-ngay').textContent='0';
    document.getElementById('gc-tong-gio').textContent='0g';
    document.getElementById('gc-content').innerHTML='<div class="gc-empty">📭 Chưa có dữ liệu tháng này</div>';
    return;
  }
  // FIX v9: đếm ngày DUY NHẤT có trạng thái ĐỦ CA
  const ngayDone=new Set();
  let tongPhutAll=0;
  gcData.forEach(r=>{
    const tt=(r.trangThai||'').trim();
    if(tt==='ĐỦ CA'||tt==='HOÀN THÀNH'){
      ngayDone.add(r.ngay);
      tongPhutAll+=parseGioCong(r.tongGioCong);
    }
  });
  document.getElementById('gc-so-ngay').textContent=ngayDone.size;
  document.getElementById('gc-tong-gio').textContent=fmtPhut(tongPhutAll);

  let rows='';
  gcData.forEach(r=>{
    const dt=new Date(r.ngay+'T00:00:00');
    const thu=THU_VI[dt.getDay()];
    const ngFmt=pad(dt.getDate())+'/'+pad(dt.getMonth()+1);
    const chName=r.cuaHang||'--';
    const chShort=chName.length>14?chName.substring(0,13)+'…':chName;
    rows+=`<tr><td><div class="gc-ngay">${ngFmt}</div><div class="gc-thu">${thu}</div></td><td class="gc-gio">${r.gioCaVao||'--'}</td><td class="gc-gio">${r.gioCaRa||'--'}</td><td class="gc-tong">${r.tongGioCong||'--'}</td><td style="font-size:11px;color:var(--text-m);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${chShort}</td></tr>`;
  });
  rows+=`<tr class="gc-total"><td colspan="3" style="font-size:11px">Tổng (${ngayDone.size} ngày)</td><td class="gc-tong">${fmtPhut(tongPhutAll)}</td><td></td></tr>`;
  document.getElementById('gc-content').innerHTML=`<table class="gc-table"><thead><tr><th>Ngày</th><th>Vào ca</th><th>Ra ca</th><th>Tổng</th><th>Cửa hàng</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function parseGioCong(str){if(!str)return 0;const g=str.match(/(\d+)g/),p=str.match(/(\d+)p/);return(g?parseInt(g[1]):0)*60+(p?parseInt(p[1]):0);}

// ─── GIỜ CÔNG TOÀN HỆ THỐNG (QLNS) ─────────────────────────
// ─── GIỜ CÔNG QLNS — MODE + DATE RANGE ─────────────────────
let gcqlMode='thang'; // 'thang' | 'range'
function setGCQLMode(mode){
  gcqlMode=mode;
  document.querySelectorAll('.gcql-mode-tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('gcqlm-'+mode).classList.add('active');
  if(mode==='thang'){
    document.getElementById('gcql-nav-thang').style.display='';
    document.getElementById('gcql-nav-range').style.display='none';
    document.getElementById('gcql-filter-range').style.display='none';
    taiGioCongQL();
  } else {
    document.getElementById('gcql-nav-thang').style.display='none';
    document.getElementById('gcql-nav-range').style.display='';
    document.getElementById('gcql-filter-range').style.display='flex';
    // Mặc định: đầu tháng → hôm nay
    const now=new Date();
    const y=now.getFullYear(),m=pad(now.getMonth()+1),d=pad(now.getDate());
    const dauThang=`${y}-${m}-01`;
    const homNay=`${y}-${m}-${d}`;
    if(!document.getElementById('gcql-tu').value)
      document.getElementById('gcql-tu').value=dauThang;
    if(!document.getElementById('gcql-den').value)
      document.getElementById('gcql-den').value=homNay;
    taiGioCongQLRange();
  }
}
function taiGioCongQLRange(){
  const tu=document.getElementById('gcql-tu').value;
  const den=document.getElementById('gcql-den').value;
  if(!tu||!den)return;
  if(tu>den){document.getElementById('gcql-den').value=tu;return;}
  document.getElementById('gcql-nav-range').querySelector('.thang-label').textContent=
    fmtNgay(tu)+' → '+fmtNgay(den);
  document.getElementById('gcql-content').innerHTML='<div class="gc-empty">⏳ Đang tải...</div>';
  ['gcql-nv','gcql-ngay','gcql-gio'].forEach(id=>document.getElementById(id).textContent='--');
  // [v12-P2] Supabase RPC theo từng tháng rồi gộp lại
  const thangTu=tu.substring(0,7), thangDen=den.substring(0,7);
  const fetches=[];
  let cur=thangTu;
  while(cur<=thangDen){
    fetches.push(supa.rpc('fn_get_tong_hop_thang_all', { p_thang: cur }).then(r => r.data || []));
    const [y,m]=cur.split('-').map(Number);
    const next=new Date(y,m,1);
    cur=next.getFullYear()+'-'+pad(next.getMonth()+1);
  }
  Promise.all(fetches).then(results=>{
    const all=results.flat();
    gcDataQL=all.filter(r=>r.ngay>=tu&&r.ngay<=den);
    renderGioCongQL();
  }).catch(()=>{
    document.getElementById('gcql-content').innerHTML='<div class="gc-empty" style="color:var(--red)">Lỗi tải dữ liệu.</div>';
  });
}
function fmtNgay(s){
  if(!s)return'--';
  const p=s.split('-');return p[2]+'/'+p[1]+'/'+p[0];
}

function doiThangQL(delta){
  const [y,m]=gcThangQL.split('-').map(Number);
  const d=new Date(y,m-1+delta,1);
  const now=new Date();if(d>new Date(now.getFullYear(),now.getMonth(),1))return;
  gcThangQL=d.getFullYear()+'-'+pad(d.getMonth()+1);taiGioCongQL();
}
function taiGioCongQL(){
  gcDataQL=[]; // [v10.85 Yc #3] reset state
  const [y,m]=gcThangQL.split('-').map(Number);
  document.getElementById('thang-label-ql').textContent=THANG_VI[m]+' '+y;
  document.getElementById('gcql-content').innerHTML='<div class="gc-empty">⏳ Đang tải...</div>';
  ['gcql-nv','gcql-ngay','gcql-gio'].forEach(id=>document.getElementById(id).textContent='--');
  // [v12-P2] Supabase RPC
  // [v10.85 YC#1] Load song song: RPC + bảng cua_hang để enrich khu vực
  Promise.all([
    supa.rpc('fn_get_tong_hop_thang_all', { p_thang: gcThangQL }),
    supa.from('cua_hang').select('ma_ch, ten_ch, khu_vuc'),
    supa.from('nhan_vien').select('ma_nv, ma_ch_mac_dinh, khu_vuc').eq('trang_thai', 'ACTIVE')
  ])
  .then(([rpcRes, chRes, nvRes]) => {
    if (rpcRes.error || !rpcRes.data) {
      document.getElementById('gcql-content').innerHTML='<div class="gc-empty" style="color:var(--red)">Lỗi tải dữ liệu.</div>';
      return;
    }
    // Build map: ma_ch → khu_vuc
    const chMap = {};
    (chRes.data || []).forEach(c => {
      chMap[c.ma_ch] = { khuVuc: c.khu_vuc || '', tenCh: c.ten_ch || '' };
      if (c.ten_ch) chMap[c.ten_ch.toLowerCase()] = { khuVuc: c.khu_vuc || '', tenCh: c.ten_ch };
    });
    // Build map NV → CH mặc định + khu vực
    const nvMap = {};
    (nvRes.data || []).forEach(nv => {
      nvMap[nv.ma_nv] = { maCH: nv.ma_ch_mac_dinh || '', khuVuc: nv.khu_vuc || '' };
    });
    // Enrich: nếu khuVuc trống → tìm từ chMap, nvMap
    gcDataQL = (rpcRes.data || []).map(r => {
      // [v10.85] Check cả camelCase và snake_case
      let kv = r.khuVuc || r.khu_vuc || '';
      let maCH = r.maCH || r.ma_ch || '';
      let cuaHang = r.cuaHang || r.cua_hang || '';
      if (!kv) {
        let found = null;
        if (maCH) found = chMap[maCH];
        if (!found && cuaHang) found = chMap[cuaHang.toLowerCase()];
        // Fallback: lấy từ nhan_vien → ma_ch_mac_dinh → chMap
        if (!found) {
          const maNV = r.maNV || r.ma_nv || '';
          const nv = nvMap[maNV];
          if (nv) {
            if (nv.khuVuc) kv = nv.khuVuc;
            else if (nv.maCH) found = chMap[nv.maCH];
          }
        }
        if (found && !kv) kv = found.khuVuc;
      }
      r.khuVuc = kv;
      // Cũng normalize maCH/cuaHang
      if (!r.maCH && maCH) r.maCH = maCH;
      if (!r.cuaHang && cuaHang) r.cuaHang = cuaHang;
      return r;
    });
    renderGioCongQL();
  })
  .catch(()=>{document.getElementById('gcql-content').innerHTML='<div class="gc-empty" style="color:var(--red)">Lỗi tải dữ liệu.</div>';});
}
// [v10.85 YC#3] State accordion giờ công QL
let _gcqlExpandedKV = new Set();
let _gcqlExpandedCH = new Set();

function _gcqlToggleKV(kv){
  if (_gcqlExpandedKV.has(kv)) _gcqlExpandedKV.delete(kv);
  else _gcqlExpandedKV.add(kv);
  renderGioCongQL();
}
function _gcqlToggleCH(key){
  if (_gcqlExpandedCH.has(key)) _gcqlExpandedCH.delete(key);
  else _gcqlExpandedCH.add(key);
  renderGioCongQL();
}

function renderGioCongQL(){
  const q=(document.getElementById('gcql-search').value||'').trim().toLowerCase();
  // [v10.85 YC#6] Ẩn NV chưa hoàn tất chấm công (CÓ LỖI = chưa duyệt giải trình → coi như chưa xong)
  const _isValid = tt => tt==='ĐỦ CA' || tt==='HOÀN THÀNH' || tt==='DUYET_KHONG_CONG';
  const filtered = gcDataQL.filter(r => {
    if (q && !(r.maNV.toLowerCase().includes(q) || r.tenNV.toLowerCase().includes(q) || r.cuaHang.toLowerCase().includes(q) || (r.khuVuc||'').toLowerCase().includes(q))) {
      return false;
    }
    return _isValid(r.trangThai);
  });
  if(!filtered.length){
    ['gcql-nv','gcql-ngay','gcql-gio'].forEach(id=>document.getElementById(id).textContent='0');
    document.getElementById('gcql-content').innerHTML='<div class="gc-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 8px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Không có nhân viên nào đã hoàn tất chấm công</div>';
    return;
  }
  const nvSet = new Set(filtered.map(r => r.maNV));
  const ngayDone = new Set(filtered.map(r => r.maNV + '_' + r.ngay));
  let tongPhut = 0;
  filtered.forEach(r => {
    if (r.tongPhut != null) tongPhut += Number(r.tongPhut) || 0;
    else tongPhut += parseGioCong(r.tongGioCong);
  });
  const _fmtVN = (n) => Number(n).toLocaleString('vi-VN');
  // [v10.85] fmtPhut → có dấu chấm
  const _fmtPhutVN = (m) => {
    const h = Math.floor(m / 60);
    const p = m % 60;
    return _fmtVN(h) + 'g ' + pad(p) + 'p';
  };
  document.getElementById('gcql-nv').textContent   = _fmtVN(nvSet.size);
  document.getElementById('gcql-ngay').textContent = _fmtVN(ngayDone.size);
  document.getElementById('gcql-gio').textContent  = _fmtPhutVN(tongPhut);

  // [v10.85 YC#2] Map KV đầy đủ về tên ngắn — bỏ prefix "Khu vực"
  const _kvShort = (kv) => {
    if (!kv) return 'Khác';
    const k = kv.toLowerCase().replace(/^khu vực\s+/i, '');
    if (k.includes('hồ chí minh') || k.includes('ho chi minh') || k === 'hcm') return 'Hồ Chí Minh';
    if (k.includes('hà nội') || k.includes('ha noi') || k === 'hn') return 'Hà Nội';
    if (k.includes('bắc trung') || k.includes('bac trung')) return 'Bắc Trung Bộ';
    if (k.includes('trung tây nguyên') || k.includes('trung tay nguyen')) return 'Trung Tây Nguyên';
    if (k.includes('đông nam') || k.includes('dong nam')) return 'Đông Nam Bộ';
    if (k.includes('tây nam') || k.includes('tay nam')) return 'Tây Nam Bộ';
    if (k.includes('miền bắc') || k.includes('mien bac')) return 'Miền Bắc';
    if (k.includes('miền trung') || k.includes('mien trung')) return 'Miền Trung';
    if (k.includes('miền đông') || k.includes('mien dong')) return 'Miền Đông';
    if (k.includes('miền tây') || k.includes('mien tay')) return 'Miền Tây';
    return kv.replace(/^khu vực\s+/i, '');
  };

  // Build groups: KV (ngắn) → KV thực → CH → NV → items
  const groups = {};
  filtered.forEach(r => {
    const kvFull = r.khuVuc || 'Khác';
    const kv = _kvShort(kvFull);
    const ch = r.cuaHang || '--';
    const maNV = r.maNV;
    if (!groups[kv]) groups[kv] = { kvFullList: new Set(), chs: {} };
    groups[kv].kvFullList.add(kvFull);
    if (!groups[kv].chs[ch]) groups[kv].chs[ch] = {};
    if (!groups[kv].chs[ch][maNV]) {
      groups[kv].chs[ch][maNV] = {
        maNV, tenNV: r.tenNV || maNV,
        items: [], tongPhut: 0, soNgay: new Set()
      };
    }
    const nv = groups[kv].chs[ch][maNV];
    nv.items.push(r);
    nv.soNgay.add(r.ngay);
    if (r.tongPhut != null) nv.tongPhut += Number(r.tongPhut) || 0;
    else nv.tongPhut += parseGioCong(r.tongGioCong);
  });

  // [v10.85 YC#2] Sort theo thứ tự yêu cầu
  const KV_ORDER = ['Hà Nội', 'Bắc Trung Bộ', 'Trung Tây Nguyên', 'Hồ Chí Minh', 'Đông Nam Bộ', 'Tây Nam Bộ'];
  const allKVs = Object.keys(groups);
  const sortedKVs = [
    ...KV_ORDER.filter(k => groups[k]),
    ...allKVs.filter(k => !KV_ORDER.includes(k) && k !== 'Khác').sort(),
    ...(groups['Khác'] ? ['Khác'] : [])
  ];

  let html = '';
  sortedKVs.forEach(kv => {
    const chs = groups[kv].chs;
    const chKeys = Object.keys(chs).sort();
    let kvTongPhut = 0, kvSoNV = 0, kvSoCH = chKeys.length;
    chKeys.forEach(ch => {
      Object.values(chs[ch]).forEach(nv => {
        kvTongPhut += nv.tongPhut;
        kvSoNV++;
      });
    });
    const isKVExpanded = _gcqlExpandedKV.has(kv);
    const chevronKV = isKVExpanded
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    // [v10.85] Mỗi KV 1 màu — style action card: nền tint nhạt + chữ đậm + viền mỏng accent
    const KV_COLORS = {
      'Hà Nội':         { accent:'#0284C7', tint:'#F0F9FF', bd:'#BAE6FD' },
      'Bắc Trung Bộ':   { accent:'#0F6E56', tint:'#ECFDF5', bd:'#A7F3D0' },
      'Trung Tây Nguyên':{ accent:'#0D9488', tint:'#F0FDFA', bd:'#99F6E4' },
      'Hồ Chí Minh':    { accent:'#DC2626', tint:'#FEF2F2', bd:'#FECACA' },
      'Đông Nam Bộ':    { accent:'#D97706', tint:'#FFFBEB', bd:'#FDE68A' },
      'Tây Nam Bộ':     { accent:'#BE185D', tint:'#FDF2F8', bd:'#FBCFE8' },
      'Khác':           { accent:'#475569', tint:'#F8FAFC', bd:'#E2E8F0' },
    };
    const kvc = KV_COLORS[kv] || KV_COLORS['Khác'];
    html += `<div class="gcql-kv-group">
      <div class="gcql-kv-header" onclick="_gcqlToggleKV('${kv.replace(/'/g,"\\'")}')" style="cursor:pointer;background:${kvc.tint};color:${kvc.accent};border-left:4px solid ${kvc.accent}">
        <span class="gcql-kv-name">${escHtml(kv)}</span>
        <span class="gcql-kv-meta" style="color:${kvc.accent};opacity:.75">${_fmtVN(kvSoCH)} CH · ${_fmtVN(kvSoNV)} NV · ${_fmtPhutVN(kvTongPhut)}</span>
        ${chevronKV}
      </div>`;
    if (isKVExpanded){
      html += `<div class="gcql-kv-body">`;
      chKeys.forEach(ch => {
        const nvList = Object.values(chs[ch]).sort((a,b) => (a.tenNV||'').localeCompare(b.tenNV||'', 'vi'));
        let chTongPhut = 0;
        nvList.forEach(nv => chTongPhut += nv.tongPhut);
        const chKey = kv + '::' + ch;
        const isCHExpanded = _gcqlExpandedCH.has(chKey);
        const chevronCH = isCHExpanded
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
        html += `<div class="gcql-ch-group">
          <div class="gcql-ch-header" onclick="_gcqlToggleCH('${chKey.replace(/'/g,"\\'")}')" style="cursor:pointer">
            <span class="gcql-ch-name">${escHtml(ch)}</span>
            <span class="gcql-ch-meta">${nvList.length} NV · ${_fmtPhutVN(chTongPhut)}</span>
            ${chevronCH}
          </div>`;
        if (isCHExpanded){
          html += `<div class="gcql-nv-list">`;
          nvList.forEach(nv => {
            const ngayClick = nv.items[0]?.ngay || '';
            const esTen = (nv.tenNV || '').replace(/'/g,"\\'");
            html += `<div class="gcql-nv-row" onclick="_openGioCongChiTiet('${nv.maNV}','${esTen}','${ngayClick}')">
              ${_renderAvatar(nv.maNV, nv.tenNV, 32)}
              <div style="flex:1;min-width:0">
                <div class="gcql-nv-name">${escHtml(nv.tenNV)} <span style="font-size:11px;font-weight:400;color:var(--text-m)">${nv.maNV}</span></div>
                <div class="gcql-nv-sub">${_fmtVN(nv.soNgay.size)} ngày làm việc</div>
              </div>
              <div class="gcql-nv-gio">${_fmtPhutVN(nv.tongPhut)}</div>
            </div>`;
          });
          html += `</div>`;
        }
        html += `</div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });
  document.getElementById('gcql-content').innerHTML = html;
}

// ════════════════════════════════════════════════════════════════
// [v8.2] DRILL-DOWN — Admin/QLNS click vào row NV → mở modal chi tiết
// Tái dụng _renderGioCongTable bằng cách set tạm gcData = data của NV được chọn.
// ════════════════════════════════════════════════════════════════
let _gcSaveBackup = null;  // Backup gcData khi vào modal
let _gcSaveSoNgay = null;
let _gcSaveTongGio = null;

function _openGioCongChiTiet(maNV, tenNV, ngayClick){
  // Lấy tháng từ ngày click (ngayClick = 'YYYY-MM-DD')
  const thang = ngayClick.substring(0, 7);
  const modal = document.getElementById('gcql-detail-modal');
  if (!modal) return;
  document.getElementById('gcql-detail-title').textContent = tenNV + ' (' + maNV + ')';
  document.getElementById('gcql-detail-thang').textContent = thang;
  document.getElementById('gcql-detail-content').innerHTML = '<div class="gc-empty">⏳ Đang tải...</div>';
  document.getElementById('gcql-detail-so-ngay').textContent = '--';
  document.getElementById('gcql-detail-tong-gio').textContent = '--';
  modal.style.display = 'flex';

  supa.rpc('fn_get_gio_cong_thang', { p_ma_nv: maNV, p_thang: thang })
  .then(({ data: d, error }) => {
    if (error || !d) {
      document.getElementById('gcql-detail-content').innerHTML = '<div class="gc-empty" style="color:var(--red)">Lỗi tải dữ liệu.</div>';
      return;
    }
    // [v8.2] Parse string nếu cần
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch(e) {
        document.getElementById('gcql-detail-content').innerHTML = '<div class="gc-empty" style="color:var(--red)">Lỗi parse dữ liệu.</div>';
        return;
      }
    }
    // Tính tổng & số ngày
    const tongGioGiay = Math.round((Number(d.tongGio)||0) * 3600);
    const tgGio = Math.floor(tongGioGiay / 3600);
    const tgPhut = Math.floor((tongGioGiay % 3600) / 60);
    document.getElementById('gcql-detail-so-ngay').textContent = d.soNgay || 0;
    document.getElementById('gcql-detail-tong-gio').textContent = tgGio + 'g ' + String(tgPhut).padStart(2,'0') + 'p';

    // Tái dụng _renderGioCongTable: backup state hiện tại, render vào element tạm, copy HTML qua
    _gcSaveBackup = gcData;
    _gcSaveSoNgay = document.getElementById('gc-so-ngay').textContent;
    _gcSaveTongGio = document.getElementById('gc-tong-gio').textContent;
    gcData = d.cacCap || [];

    // Render tạm vào element 'gc-content' (của NV), sau đó copy sang modal
    const gcContent = document.getElementById('gc-content');
    const saveHtml = gcContent ? gcContent.innerHTML : '';
    document.getElementById('gc-so-ngay').textContent = d.soNgay || 0;
    document.getElementById('gc-tong-gio').textContent = tgGio + 'g ' + String(tgPhut).padStart(2,'0') + 'p';

    _renderGioCongTable();

    // Copy HTML vừa render sang modal
    document.getElementById('gcql-detail-content').innerHTML = gcContent.innerHTML;

    // Restore state cho view NV
    gcContent.innerHTML = saveHtml;
    gcData = _gcSaveBackup;
    document.getElementById('gc-so-ngay').textContent = _gcSaveSoNgay;
    document.getElementById('gc-tong-gio').textContent = _gcSaveTongGio;
    _gcSaveBackup = null;
  })
  .catch(()=>{
    document.getElementById('gcql-detail-content').innerHTML = '<div class="gc-empty" style="color:var(--red)">Lỗi tải dữ liệu.</div>';
  });
}

function _closeGioCongChiTiet(){
  const modal = document.getElementById('gcql-detail-modal');
  if (modal) modal.style.display = 'none';
}

// [v9.45] AVATAR: Fetch URL từ DB (chạy ngầm sau login/reload)
async function _fetchAvatarUrl() {
  if (!SESSION || !SESSION.ma) return;
  try {
    const { data, error } = await supa
      .from('nhan_vien')
      .select('avatar_url')
      .eq('ma_nv', SESSION.ma)
      .maybeSingle();
    
    if (error || !data) return;
    
    if (data.avatar_url !== SESSION.avatarUrl) {
      SESSION.avatarUrl = data.avatar_url;
      // [v10.85] Persist sang localStorage
      try{ localStorage.setItem('session_cc', JSON.stringify(SESSION)); }catch(e){}
      // Re-render UI nếu đang ở tab Tài khoản
      if (typeof renderTaiKhoan === 'function' && document.getElementById('page-taikhoan').style.display !== 'none') {
        renderTaiKhoan();
      }
      // Update header avatar nếu có
      if (typeof _renderHeaderAvatar === 'function') _renderHeaderAvatar();
    }
  } catch (e) {
    console.warn('[Avatar] Fetch lỗi (bỏ qua):', e.message);
  }
}

// ─── TÀI KHOẢN ──────────────────────────────────────────────
function renderTaiKhoan(){
  if(!SESSION)return;
  const init=SESSION.ten.split(' ').map(w=>w[0]).slice(-2).join('').toUpperCase();
  
  // [v9.45] Render avatar — nếu có URL thì hiện ảnh, không thì hiện chữ cái
  _renderAvatarUI(SESSION.avatarUrl, init);
  
  document.getElementById('acc-name').textContent=SESSION.ten;
  document.getElementById('acc-ma').textContent=SESSION.ma+' · '+SESSION.cuaHangTen;
  const vt=SESSION.vaiTro;
  if(vt==='QLNS'||vt==='ADMIN'){
    const el=document.getElementById('acc-vaitro');
    el.textContent=vt==='ADMIN'?'👑 Admin':'🛡️ Quản lý nhân sự';
    el.style.display='inline-block';
  }

  // [v16.95] Thẻ tải ứng dụng
  if (typeof tkRefreshInstallCard === 'function') tkRefreshInstallCard();
}

// [v16.95] ─── Thẻ tải ứng dụng (PWA install) ───
function tkRefreshInstallCard() {
  const wrap = document.getElementById('tk-install-wrap');
  const card = document.getElementById('tk-install-card');
  if (!card) return;
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  const ico = (path) => '<div style="flex-shrink:0;width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#1D9E75,#0F6E56);display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg></div>';
  const dlIcon = ico('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><rect x="4" y="18" width="16" height="3" rx="1"/>');
  let inner;
  if (standalone) {
    inner = '<div style="display:flex;align-items:center;gap:12px">' +
      ico('<polyline points="20 6 9 17 4 12"/>') +
      '<div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:600;color:#0F172A">Đã cài đặt ứng dụng</div>' +
      '<div style="font-size:12px;color:#94A3B8;margin-top:2px">Bạn đang dùng bản đã cài trên thiết bị này</div></div></div>';
  } else if (window._pwaCanInstall) {
    inner = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
      '<div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">' + dlIcon +
      '<div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:600;color:#0F172A">Tải ứng dụng về máy</div>' +
      '<div style="font-size:12px;color:#94A3B8;margin-top:2px">Cài Chấm công thành ứng dụng riêng trên máy</div></div></div>' +
      '<button onclick="tkInstallApp()" style="flex-shrink:0;background:linear-gradient(135deg,#1D9E75,#0F6E56);color:#fff;border:none;padding:9px 16px;border-radius:9px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Cài đặt</button></div>';
  } else if (isIOS) {
    inner = '<div style="display:flex;align-items:flex-start;gap:12px">' +
      ico('<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>') +
      '<div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:600;color:#0F172A">Thêm vào màn hình chính</div>' +
      '<div style="font-size:12px;color:#64748B;margin-top:3px;line-height:1.5">Mở bằng Safari, bấm nút Chia sẻ ở thanh dưới, rồi chọn "Thêm vào MH chính".</div></div></div>';
  } else {
    inner = '<div style="display:flex;align-items:flex-start;gap:12px">' + dlIcon +
      '<div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:600;color:#0F172A">Tải ứng dụng về máy</div>' +
      '<div style="font-size:12px;color:#64748B;margin-top:3px;line-height:1.5">Trên Chrome/Edge ở máy tính: mở menu <b>⋮</b> góc phải trên → chọn <b>"Cài đặt Chấm công…"</b> (hoặc bấm biểu tượng cài đặt ở thanh địa chỉ).</div></div></div>';
  }
  card.innerHTML = inner;
  if (wrap) wrap.style.display = '';
}
window.tkRefreshInstallCard = tkRefreshInstallCard;

function tkInstallApp() {
  if (typeof window.pwaInstall === 'function' && window._pwaCanInstall) {
    window.pwaInstall();
  } else if (typeof showToast === 'function') {
    showToast('Mở menu trình duyệt để cài ứng dụng.', 'warn');
  }
}
window.tkInstallApp = tkInstallApp;

// [v9.45] Helper render avatar UI dùng chung
function _renderAvatarUI(avatarUrl, initialsText) {
  const avatarEl = document.getElementById('acc-avatar');
  const lettersEl = document.getElementById('acc-avatar-letters');
  const controlsEl = document.getElementById('acc-avatar-controls');
  if (!avatarEl) return;
  
  // Xóa img cũ nếu có
  const oldImg = avatarEl.querySelector('img');
  if (oldImg) oldImg.remove();
  
  if (avatarUrl && /^https?:\/\//i.test(avatarUrl)) {
    // Có URL → hiện ảnh
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = 'Avatar';
    img.onerror = function() {
      // Lỗi load → fallback về chữ cái
      this.remove();
      if (lettersEl) {
        lettersEl.style.display = '';
        lettersEl.textContent = initialsText || '?';
      }
    };
    img.onload = function() {
      if (lettersEl) lettersEl.style.display = 'none';
    };
    avatarEl.insertBefore(img, avatarEl.firstChild);
    if (lettersEl) lettersEl.style.display = 'none';
    if (controlsEl) controlsEl.style.display = '';
  } else {
    // Không có URL → chữ cái
    if (lettersEl) {
      lettersEl.style.display = '';
      lettersEl.textContent = initialsText || '?';
    }
    if (controlsEl) controlsEl.style.display = 'none';
  }
}

// [v9.45] AVATAR: Chọn ảnh từ máy
function chonAnhAvatar() {
  if (!SESSION) return;
  const input = document.getElementById('acc-avatar-file');
  if (input) input.click();
}

// [v9.45] AVATAR: Xử lý khi user chọn file → mở modal crop
async function onAvatarFileChange(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  
  // Validate kiểu file
  if (!/^image\/(jpeg|jpg|png|webp|heic)$/i.test(file.type)) {
    showToast('Chỉ chấp nhận ảnh JPG/PNG/WEBP/HEIC.', 'err');
    input.value = '';
    return;
  }
  
  // Validate size 10MB (gốc, sau crop sẽ nhỏ hơn nhiều)
  if (file.size > 10 * 1024 * 1024) {
    showToast('Ảnh quá lớn (tối đa 10MB).', 'err');
    input.value = '';
    return;
  }
  
  // Đọc file → mở modal crop
  const reader = new FileReader();
  reader.onload = (e) => {
    _openCropModal(e.target.result);
  };
  reader.onerror = () => {
    showToast('Không đọc được file ảnh.', 'err');
  };
  reader.readAsDataURL(file);
  
  input.value = ''; // Reset để chọn lại cùng file được
}

// [v9.45] Mở modal crop ảnh
function _openCropModal(imgDataUrl) {
  const modal = document.getElementById('avatar-crop-modal');
  const img = document.getElementById('avatar-crop-img');
  if (!modal || !img) return;
  
  // Reset state
  _cropState = {
    imgUrl: imgDataUrl,
    imgNaturalW: 0,
    imgNaturalH: 0,
    containerW: 0,
    containerH: 0,
    cropX: 0,        // Tọa độ crop trong container (CSS pixel)
    cropY: 0,
    cropSize: 0,     // Kích thước hộp crop (CSS pixel)
    dragMode: null,  // null | 'move' | 'resize'
    dragStartX: 0,
    dragStartY: 0,
    dragStartCropX: 0,
    dragStartCropY: 0,
    dragStartCropSize: 0,
  };
  
  img.src = imgDataUrl;
  
  img.onload = () => {
    _cropState.imgNaturalW = img.naturalWidth;
    _cropState.imgNaturalH = img.naturalHeight;
    
    // Setup khung crop sau khi DOM render xong
    setTimeout(() => _setupCropBox(), 50);
  };
  
  modal.style.display = 'flex';
}

// [v9.45] Setup khung crop ở giữa ảnh, kích thước = min(W,H) * 0.8
function _setupCropBox() {
  const container = document.getElementById('avatar-crop-container');
  if (!container) return;
  
  const rect = container.getBoundingClientRect();
  _cropState.containerW = rect.width;
  _cropState.containerH = rect.height;
  
  const minSide = Math.min(rect.width, rect.height);
  _cropState.cropSize = Math.floor(minSide * 0.8);
  _cropState.cropX = (rect.width - _cropState.cropSize) / 2;
  _cropState.cropY = (rect.height - _cropState.cropSize) / 2;
  
  _renderCropBox();
}

function _renderCropBox() {
  const box = document.getElementById('avatar-crop-box');
  const overlay = document.getElementById('avatar-crop-overlay');
  if (!box) return;
  
  box.style.left = _cropState.cropX + 'px';
  box.style.top = _cropState.cropY + 'px';
  box.style.width = _cropState.cropSize + 'px';
  box.style.height = _cropState.cropSize + 'px';
  
  // Dùng clip-path để tạo overlay tối với lỗ vuông giữa
  if (overlay) {
    const x1 = _cropState.cropX;
    const y1 = _cropState.cropY;
    const x2 = x1 + _cropState.cropSize;
    const y2 = y1 + _cropState.cropSize;
    overlay.style.clipPath = `polygon(
      0 0, 100% 0, 100% 100%, 0 100%, 0 0,
      ${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px
    )`;
  }
}

let _cropState = {};

// Drag start (mouse + touch)
function _cropDragStart(e, mode) {
  e.preventDefault();
  e.stopPropagation();
  const point = e.touches ? e.touches[0] : e;
  _cropState.dragMode = mode;
  _cropState.dragStartX = point.clientX;
  _cropState.dragStartY = point.clientY;
  _cropState.dragStartCropX = _cropState.cropX;
  _cropState.dragStartCropY = _cropState.cropY;
  _cropState.dragStartCropSize = _cropState.cropSize;
  
  document.addEventListener('mousemove', _cropDragMove);
  document.addEventListener('mouseup', _cropDragEnd);
  document.addEventListener('touchmove', _cropDragMove, { passive: false });
  document.addEventListener('touchend', _cropDragEnd);
}

function _cropDragMove(e) {
  if (!_cropState.dragMode) return;
  e.preventDefault();
  const point = e.touches ? e.touches[0] : e;
  const dx = point.clientX - _cropState.dragStartX;
  const dy = point.clientY - _cropState.dragStartY;
  
  if (_cropState.dragMode === 'move') {
    // Di chuyển hộp crop, giới hạn trong container
    let newX = _cropState.dragStartCropX + dx;
    let newY = _cropState.dragStartCropY + dy;
    newX = Math.max(0, Math.min(newX, _cropState.containerW - _cropState.cropSize));
    newY = Math.max(0, Math.min(newY, _cropState.containerH - _cropState.cropSize));
    _cropState.cropX = newX;
    _cropState.cropY = newY;
  } else if (_cropState.dragMode === 'resize') {
    // Resize: chỉnh kích thước, neo góc trên-trái, giữ vuông
    // Dùng max(dx, dy) để resize đều
    const delta = Math.max(dx, dy);
    let newSize = _cropState.dragStartCropSize + delta;
    
    // Min size = 80px
    newSize = Math.max(80, newSize);
    // Max size = giới hạn để không tràn container
    const maxByRight = _cropState.containerW - _cropState.cropX;
    const maxByBottom = _cropState.containerH - _cropState.cropY;
    newSize = Math.min(newSize, maxByRight, maxByBottom);
    
    _cropState.cropSize = newSize;
  }
  
  _renderCropBox();
}

function _cropDragEnd() {
  _cropState.dragMode = null;
  document.removeEventListener('mousemove', _cropDragMove);
  document.removeEventListener('mouseup', _cropDragEnd);
  document.removeEventListener('touchmove', _cropDragMove);
  document.removeEventListener('touchend', _cropDragEnd);
}

function _cancelCrop() {
  document.getElementById('avatar-crop-modal').style.display = 'none';
}

// [v9.45] Crop ảnh + upload
async function _confirmCrop() {
  const modal = document.getElementById('avatar-crop-modal');
  const img = document.getElementById('avatar-crop-img');
  const confirmBtn = document.getElementById('avatar-crop-confirm-btn');
  
  if (!img || !_cropState.imgUrl) return;
  
  // Disable button
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = '0.6';
  confirmBtn.innerHTML = 'Đang xử lý...';
  
  try {
    // Tính tỉ lệ: container hiển thị ảnh fit-contain
    // → Tìm kích thước ảnh thực hiển thị trong container
    const containerW = _cropState.containerW;
    const containerH = _cropState.containerH;
    const imgRatio = _cropState.imgNaturalW / _cropState.imgNaturalH;
    const containerRatio = containerW / containerH;
    
    let displayW, displayH, offsetX, offsetY;
    if (imgRatio > containerRatio) {
      // Ảnh rộng hơn container → fit theo width
      displayW = containerW;
      displayH = containerW / imgRatio;
      offsetX = 0;
      offsetY = (containerH - displayH) / 2;
    } else {
      // Ảnh cao hơn container → fit theo height
      displayH = containerH;
      displayW = containerH * imgRatio;
      offsetX = (containerW - displayW) / 2;
      offsetY = 0;
    }
    
    // Tính tọa độ crop trên ảnh gốc (natural)
    const scaleX = _cropState.imgNaturalW / displayW;
    const scaleY = _cropState.imgNaturalH / displayH;
    
    const cropOnImageX = (_cropState.cropX - offsetX) * scaleX;
    const cropOnImageY = (_cropState.cropY - offsetY) * scaleY;
    const cropOnImageSize = _cropState.cropSize * scaleX;
    
    // Clamp lại nếu lệch ra ngoài
    const safeX = Math.max(0, Math.min(cropOnImageX, _cropState.imgNaturalW - 1));
    const safeY = Math.max(0, Math.min(cropOnImageY, _cropState.imgNaturalH - 1));
    const maxSize = Math.min(
      _cropState.imgNaturalW - safeX,
      _cropState.imgNaturalH - safeY
    );
    const safeSize = Math.max(10, Math.min(cropOnImageSize, maxSize));
    
    // Render vào canvas 600x600
    const TARGET_SIZE = 600;
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext('2d');
    
    // Load lại ảnh để đảm bảo decoded
    const fullImg = new Image();
    await new Promise((resolve, reject) => {
      fullImg.onload = resolve;
      fullImg.onerror = reject;
      fullImg.src = _cropState.imgUrl;
    });
    
    ctx.drawImage(fullImg, safeX, safeY, safeSize, safeSize, 0, 0, TARGET_SIZE, TARGET_SIZE);
    
    // Export blob
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => {
        if (b) resolve(b);
        else reject(new Error('Không tạo được blob'));
      }, 'image/jpeg', 0.92);
    });
    
    // Đóng modal
    modal.style.display = 'none';
    
    // Upload
    await _uploadAvatarBlob(blob);
  } catch (e) {
    console.error('[Crop] Lỗi:', e);
    showToast('Lỗi xử lý ảnh: ' + (e.message || ''), 'err');
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
    confirmBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Cắt và Upload';
  }
}

// [v9.45] Upload blob đã crop lên Supabase
async function _uploadAvatarBlob(blob) {
  if (!SESSION) return;
  
  const avatarEl = document.getElementById('acc-avatar');
  if (avatarEl) avatarEl.style.opacity = '0.5';
  showToast('Đang upload ảnh...', 'ok');
  
  try {
    const fileName = SESSION.ma + '_' + Date.now() + '.jpg';
    const filePath = SESSION.ma + '/' + fileName;
    
    const { data: uploadData, error: uploadErr } = await supa.storage
      .from('avatars')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        upsert: false,
        cacheControl: '3600'
      });
    
    if (uploadErr) throw uploadErr;
    
    const { data: urlData } = supa.storage.from('avatars').getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;
    
    const { data: res, error: rpcErr } = await supa.rpc('fn_update_avatar', {
      p_ma_nv: SESSION.ma,
      p_avatar_url: publicUrl
    });
    
    if (rpcErr || !res || !res.success) {
      throw new Error((res && res.error) || (rpcErr && rpcErr.message) || 'Lỗi DB');
    }
    
    if (res.old_url) {
      _deleteOldAvatar(res.old_url);
    }
    
    SESSION.avatarUrl = publicUrl;
    try {
      localStorage.setItem('session_cc', JSON.stringify(SESSION));
    } catch(e) {}
    
    const init = SESSION.ten.split(' ').map(w=>w[0]).slice(-2).join('').toUpperCase();
    _renderAvatarUI(publicUrl, init);
    
    if (typeof _renderHeaderAvatar === 'function') _renderHeaderAvatar();
    
    showToast('✓ Đã đổi ảnh đại diện', 'ok');
  } catch (e) {
    console.error('[Avatar Upload] Lỗi:', e);
    showToast('Lỗi upload: ' + (e.message || ''), 'err');
  } finally {
    if (avatarEl) avatarEl.style.opacity = '1';
  }
}

// [v9.45] Resize ảnh phía client (KHÔNG dùng nữa — giữ làm fallback nếu cần)
function _resizeImageForAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        try {
          const TARGET_SIZE = 600;
          const canvas = document.createElement('canvas');
          canvas.width = TARGET_SIZE;
          canvas.height = TARGET_SIZE;
          const ctx = canvas.getContext('2d');
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, TARGET_SIZE, TARGET_SIZE);
          canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('Không tạo được blob'));
          }, 'image/jpeg', 0.92);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Không đọc được ảnh'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsDataURL(file);
  });
}

// [v9.45] Xóa avatar cũ trong storage (cleanup)
async function _deleteOldAvatar(oldUrl) {
  if (!oldUrl) return;
  try {
    // Extract path từ URL: .../avatars/{ma_nv}/{filename}
    const match = oldUrl.match(/\/avatars\/(.+?)(\?|$)/);
    if (!match || !match[1]) return;
    const path = decodeURIComponent(match[1]);
    await supa.storage.from('avatars').remove([path]);
    console.log('[Avatar] Đã xóa file cũ:', path);
  } catch (e) {
    console.warn('[Avatar] Không xóa được file cũ:', e.message);
  }
}

// [v9.45] AVATAR: Xóa ảnh đại diện
async function xoaAvatar() {
  if (!SESSION || !SESSION.avatarUrl) return;
  
  const ok = await appConfirm(
    'Xóa ảnh đại diện hiện tại? Avatar sẽ trở về dạng chữ cái viết tắt.',
    { title: 'Xóa ảnh đại diện', okLabel: 'Xóa', danger: true }
  );
  if (!ok) return;
  
  const avatarEl = document.getElementById('acc-avatar');
  avatarEl.style.opacity = '0.5';
  
  try {
    const oldUrl = SESSION.avatarUrl;
    
    // Update DB (set null)
    const { data: res, error: rpcErr } = await supa.rpc('fn_update_avatar', {
      p_ma_nv: SESSION.ma,
      p_avatar_url: null
    });
    
    if (rpcErr || !res || !res.success) {
      throw new Error((rpcErr && rpcErr.message) || 'Lỗi DB');
    }
    
    // Xóa file storage
    if (oldUrl) _deleteOldAvatar(oldUrl);
    
    // Update SESSION
    SESSION.avatarUrl = null;
    // [v10.85 FIX BUG] Đã dùng sai key 'nonson_session' → đổi về 'session_cc' (đồng bộ với toàn app)
    try { localStorage.setItem('session_cc', JSON.stringify(SESSION)); } catch(e) {}
    
    // Re-render
    const init = SESSION.ten.split(' ').map(w=>w[0]).slice(-2).join('').toUpperCase();
    _renderAvatarUI(null, init);
    if (typeof _renderHeaderAvatar === 'function') _renderHeaderAvatar();
    
    showToast('✓ Đã xóa ảnh đại diện', 'ok');
  } catch (e) {
    console.error('[Avatar xóa] Lỗi:', e);
    showToast('Lỗi: ' + (e.message || ''), 'err');
  } finally {
    avatarEl.style.opacity = '1';
  }
}

// ─── ĐỔI MẬT KHẨU ───────────────────────────────────────────
function openPwModal(){
  ['pw-cu','pw-moi','pw-xn'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pw-msg').style.display='none';
  const btn=document.getElementById('pw-btn');btn.disabled=false;btn.textContent='XÁC NHẬN ĐỔI MẬT KHẨU';
  document.getElementById('pw-modal').classList.add('show');
}
function closePwModal(){document.getElementById('pw-modal').classList.remove('show');}
function doDoiMatKhau(){
  const cu=document.getElementById('pw-cu').value.trim(),moi=document.getElementById('pw-moi').value.trim(),xn=document.getElementById('pw-xn').value.trim();
  const btn=document.getElementById('pw-btn');
  document.getElementById('pw-msg').style.display='none';
  if(!cu||!moi||!xn){showPwMsg('Vui lòng nhập đầy đủ.','err');return;}
  if(moi.length<6){showPwMsg('Mật khẩu mới phải ít nhất 6 ký tự.','err');return;}
  if(moi!==xn){showPwMsg('Mật khẩu mới và xác nhận không khớp.','err');return;}
  btn.disabled=true;btn.textContent='Đang xử lý...';
  // [v12-P2] Supabase RPC
  supa.rpc('fn_doi_mat_khau_v2', {
    p_ma: SESSION.ma,
    p_old_password: cu,
    p_new_password: moi,
    p_vai_tro: SESSION.vaiTro || ''
  }).then(({ data: res, error }) => {
    btn.disabled=false;btn.textContent='XÁC NHẬN ĐỔI MẬT KHẨU';
    if(error){showPwMsg(error.message || 'Lỗi máy chủ','err');return;}
    if(!res || !res.success){showPwMsg((res && res.error) || 'Đổi mật khẩu thất bại','err');return;}
    showPwMsg('✓ Đổi mật khẩu thành công!','ok');
    SESSION.laDatMacDinh=false;
    try{ localStorage.setItem('session_cc',JSON.stringify(SESSION)); }catch(e){}
    document.getElementById('banner-pw').style.display='none';
    setTimeout(closePwModal,2000);
  }).catch(()=>{btn.disabled=false;btn.textContent='XÁC NHẬN ĐỔI MẬT KHẨU';showPwMsg('Lỗi kết nối.','err');});
}
function showPwMsg(msg,type){const el=document.getElementById('pw-msg');el.textContent=msg;el.className='pw-msg '+(type==='ok'?'pw-ok':'pw-err');el.style.display='block';}

// ─── MODAL GIẢI TRÌNH ───────────────────────────────────────
let gtLyDo='', gtNgay='', _gtTimerInterval=null, _gtCcId='';

function openGiaiTrinh(title,sub,ngay,ccId){
  gtLyDo='';gtNgay=ngay;
  if(ccId) _gtCcId = ccId;
  document.getElementById('gt-title').textContent=title;
  document.getElementById('gt-sub').textContent=sub;
  document.getElementById('gt-timer').style.display='flex';
  document.getElementById('gt-timer-dem').textContent='5:00';
  document.getElementById('gt-err').style.display='none';
  document.getElementById('gt-input').value='';
  const btn = document.getElementById('gt-btn');
  btn.disabled=true;
  btn.style.opacity='0.5';
  btn.textContent='GỬI GIẢI TRÌNH';
  document.querySelectorAll('.gt-opt').forEach(el=>el.classList.remove('sel'));
  document.getElementById('gt-modal').classList.add('show');
}

function startGtTimer(giay){
  clearInterval(_gtTimerInterval);
  let dem=giay;
  _gtTimerInterval=setInterval(()=>{
    dem--;
    const m=Math.floor(dem/60),s=dem%60;
    document.getElementById('gt-timer-dem').textContent=m+':'+String(s).padStart(2,'0');
    if(dem<=0){
      clearInterval(_gtTimerInterval);
      closeGiaiTrinh();
      startCountdown(30); // hết giờ → bỏ qua, reload sau 15s
    }
  },1000);
}

function skipGiaiTrinh(){
  clearInterval(_gtTimerInterval);
  closeGiaiTrinh();
  // [v8.1] Reload lịch sử để hiển thị đúng trạng thái (đừng hiện ✓ Hợp lệ nhầm)
  if (typeof taiLichSu === 'function') taiLichSu();
  startCountdown(30);
}

function closeGiaiTrinh(){
  clearInterval(_gtTimerInterval);
  document.getElementById('gt-modal').classList.remove('show');
}

function chonLyDo(el,lyDo){
  document.querySelectorAll('.gt-opt').forEach(o=>o.classList.remove('sel'));
  el.classList.add('sel');
  // [v10.85 FIX] Khi chọn "Lý do khác": gtLyDo = 'Khác' (không phải '') để qua checkGtFormState
  if(lyDo==='__khac__'){
    gtLyDo = 'Khác';
    document.getElementById('gt-input').focus();
  } else {
    gtLyDo=lyDo;
  }
  checkGtFormState();
}

// [v11.6 Item 5] Validate state để enable/disable nút Gửi
function checkGtFormState(){
  const inp = document.getElementById('gt-input');
  const noteVal = (inp.value || '').trim();
  const btn = document.getElementById('gt-btn');
  // Bắt buộc: chọn 1 lý do (gtLyDo có giá trị) + ghi chú >= 10 ký tự
  const ok = !!gtLyDo && noteVal.length >= 10;
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '0.5';
}

// [v7.0] Setup UI sửa CH/loại ca trong modal giải trình
async function _gtSetupSuaUI() {
  const wrap     = document.getElementById('gt-sua-wrap');
  const info     = document.getElementById('gt-sua-info');
  const chWrap   = document.getElementById('gt-sua-ch-wrap');
  const loaiWrap = document.getElementById('gt-sua-loai-wrap');
  const quotaInfo= document.getElementById('gt-quota-info');
  if (!wrap) return;
  // Reset
  wrap.style.display = 'none';
  chWrap.style.display = 'none';
  loaiWrap.style.display = 'none';

  if (!_gtLoiType) return;

  // Check quota trước
  try {
    const q = await supa.rpc('fn_nv_quota_status', { p_ma_nv: SESSION.ma }).then(r => r.data);
    if (q) {
      if (q.da_dong_bang) {
        info.textContent = '⛔ Tài khoản đã bị đóng băng do vượt quota. Chỉ có thể giải trình bằng text, không sửa CH/loại ca.';
        wrap.style.display = 'block';
        return;
      }
      quotaInfo.textContent = `Quota sửa giải trình tháng này: còn ${q.quota_sua_cb_con}/3 lần`;
    }
  } catch (e) {}

  if (_gtLoiType === 'gps') {
    info.textContent = 'Bạn chấm sai vị trí. Nếu chấm nhầm CH khác, hãy chọn lại CH đúng bên dưới. Khoảng cách mới sẽ được tính lại.';
    chWrap.style.display = '';
    await _gtLoadCHOptions();
    wrap.style.display = 'block';
  } else if (_gtLoiType === 'ca') {
    info.textContent = 'Bạn chấm sai loại ca. Vui lòng chọn loại ca đúng bên dưới.';
    loaiWrap.style.display = '';
    wrap.style.display = 'block';
  } else if (_gtLoiType === 'thieu') {
    info.textContent = 'Bạn bị thiếu ca. Đây là tình huống đặc biệt — chỉ giải trình bằng text. Nếu cần bổ sung ca, vào tab Tài khoản → "Xin bổ sung ca".';
    wrap.style.display = 'block';
  }
}

// [v8.1] Cache danh sách CH cho autocomplete
let _gtAllCH = [];

async function _gtLoadCHOptions() {
  if (_gtAllCH.length > 0) return; // đã cache rồi
  try {
    const { data } = await supa.from('cua_hang')
      .select('ma_ch, ten_ch, khu_vuc')
      .eq('trang_thai', 'ĐANG HOẠT ĐỘNG')
      .order('khu_vuc').order('ten_ch');
    if (data) _gtAllCH = data;
  } catch (e) { console.error('Load CH error', e); }
}

// [v8.1] Filter CH theo input - hiển thị dropdown gợi ý
function _gtFilterCH(q) {
  const list = document.getElementById('gt-sua-ch-list');
  if (!list) return;
  q = (q || '').trim().toLowerCase();
  if (!_gtAllCH.length) { list.style.display = 'none'; return; }
  const filtered = q
    ? _gtAllCH.filter(ch => 
        (ch.ma_ch || '').toLowerCase().includes(q) ||
        (ch.ten_ch || '').toLowerCase().includes(q) ||
        (ch.khu_vuc || '').toLowerCase().includes(q)
      ).slice(0, 30)
    : _gtAllCH.slice(0, 30);
  if (!filtered.length) {
    list.innerHTML = '<div style="padding:10px;color:#9CA3AF;font-size:12px;text-align:center">Không tìm thấy CH phù hợp</div>';
    list.style.display = 'block';
    return;
  }
  list.innerHTML = filtered.map(ch => `
    <div onclick="_gtPickCH('${ch.ma_ch}','${(ch.ten_ch||'').replace(/'/g,"\\'")}','${(ch.khu_vuc||'').replace(/'/g,"\\'")}')" 
         style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #F3F4F6;font-size:13px" 
         onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background='#fff'">
      <div style="font-weight:500;color:#111827">${ch.ma_ch} · ${ch.ten_ch || ''}</div>
      <div style="font-size:11px;color:#6B7280">${ch.khu_vuc || ''}</div>
    </div>`).join('');
  list.style.display = 'block';
}

function _gtPickCH(maCh, tenCh, khuVuc) {
  document.getElementById('gt-sua-ch-input').value = maCh + ' · ' + tenCh;
  document.getElementById('gt-sua-ch').value = maCh;
  document.getElementById('gt-sua-ch-list').style.display = 'none';
  document.getElementById('gt-sua-ch-info').textContent = '✓ Đã chọn: ' + tenCh + ' (' + (khuVuc||'') + ')';
}

function guiGiaiTrinh(){
  const inp=document.getElementById('gt-input');
  const noteVal = (inp.value || '').trim();
  if(!gtLyDo){
    const err=document.getElementById('gt-err');err.textContent='Vui lòng chọn 1 lý do.';err.style.display='block';return;
  }
  if(noteVal.length < 10){
    const err=document.getElementById('gt-err');err.textContent='Ghi chú bắt buộc, tối thiểu 10 ký tự.';err.style.display='block';return;
  }
  const lyDoGui = gtLyDo === noteVal ? noteVal : `${gtLyDo}: ${noteVal}`;
  const btn=document.getElementById('gt-btn');
  btn.disabled=true;btn.textContent='Đang gửi...';
  document.getElementById('gt-err').style.display='none';

  // [v7.0] Nếu NV chọn sửa CH hoặc loại ca → gọi fn_nv_sua_cham_cong_giai_trinh
  const maChMoi = (document.getElementById('gt-sua-ch') && document.getElementById('gt-sua-ch').value) || '';
  const loaiMoi = (document.getElementById('gt-sua-loai') && document.getElementById('gt-sua-loai').value) || '';
  const coSua = (maChMoi || loaiMoi) && _gtCbId;

  const submitDone = (res, error) => {
    btn.disabled=false;btn.textContent='GỬI GIẢI TRÌNH';
    if(!error && res && res.success){
      clearInterval(_gtTimerInterval);
      closeGiaiTrinh();
      let msg = '✓ Đã gửi giải trình. QLNS sẽ xem xét sớm.';
      if (res.khoang_cach_moi != null) {
        msg = `✓ Đã gửi. Khoảng cách mới: ${res.khoang_cach_moi}m. ${res.khoang_cach_moi > 100 ? '⚠ Vẫn xa CH, đã báo QLNS.' : '✓ Trong phạm vi.'}`;
      }
      showToast(msg,'ok');
      taiLichSu();
      startCountdown(30);
    } else {
      const err=document.getElementById('gt-err');
      err.textContent=(res&&res.error)||(error&&error.message)||'Lỗi gửi giải trình.';
      err.style.display='block';
    }
  };

  if (coSua) {
    supa.rpc('fn_nv_sua_cham_cong_giai_trinh', {
      p_ma_nv: SESSION.ma,
      p_cb_id: _gtCbId,
      p_giai_trinh: lyDoGui,
      p_ma_ch_moi: maChMoi || null,
      p_loai_moi: loaiMoi || null
    }).then(({ data, error }) => submitDone(data, error))
      .catch(() => submitDone(null, { message: 'Lỗi kết nối' }));
  } else {
    supa.rpc('fn_gui_giai_trinh', {
      p_ma_nv: SESSION.ma,
      p_ngay: gtNgay,
      p_ly_do: lyDoGui,
      p_cb_id: null,
      p_loai_cb: null,
      p_gio: null,
      p_cc_id: _gtCcId || null
    }).then(({ data: res, error }) => submitDone(res, error))
      .catch(() => submitDone(null, { message: 'Lỗi kết nối' }));
  }
}


// ─── REAL-TIME POLLING CHO QLNS ────────────────────────────
// Poll nhẹ mỗi 30s khi đang ở tab Nhân Sự
// Chỉ fetch và cập nhật nếu số cảnh báo thay đổi
let _pollTimer=null, _pollLastCount=-1;
function startNSPolling(){
  stopNSPolling();
  _pollTimer=setInterval(()=>{
    if(currentPage!=='nhansu')return;
    const [nsTu,nsDen]=_getNSRange();
    // [v10.85 FIX YC#5] CUA_HANG chỉ thấy NS của CH mình
    const _maCH = (SESSION && SESSION.vaiTro === 'CUA_HANG') ? SESSION.cuaHangMa : null;
    // [v12-P2] Supabase RPC
    supa.rpc('fn_get_nhan_su_overview', {
      p_q: nsSearchQ || null,
      p_cua_hang: _maCH, p_khu_vuc: null,
      p_tu_ngay: nsTu, p_den_ngay: nsDen
    }).then(({ data: d, error }) => {
      if(error || !d)return;
      const newCBList=d.canhBaoChuaXuLy||[];
      const newCount=newCBList.length;
      if(newCount!==_pollLastCount){
        _pollLastCount=newCount;
        nsData=d.danhSach||[];
        nsCBList=newCBList;
        document.getElementById('ns-s-dang').textContent=d.stats.dangLamViec||d.stats.dangLam||0;
        document.getElementById('ns-s-ra').textContent=d.stats.raNgoai;
        document.getElementById('ns-s-ket').textContent=d.stats.hetCa;
        const nghiEl=document.getElementById('ns-s-nghi');
        if(nghiEl)nghiEl.textContent=d.stats.nghiPhep||0;
        document.getElementById('ns-s-loi').textContent=newCount;
        document.getElementById('ns-s-tong').textContent=d.stats.tongNhanSu||nsData.length;
        const banner=document.getElementById('ns-loi-banner');
        if(banner){if(newCount>0){const el=document.getElementById('ns-loi-count');if(el)el.textContent=newCount;banner.style.display='flex';}else banner.style.display='none';}
        _capNhatBadgeNS(newCount);
        renderNhanSu();
        const now=new Date();
        document.getElementById('ns-updated').textContent='Cập nhật lúc '+pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds())+' (tự động)';
      }
    }).catch(()=>{});
  },30000);
}
function stopNSPolling(){clearInterval(_pollTimer);_pollTimer=null;}

// ─── BADGE THÔNG BÁO TAB NHÂN SỰ ───────────────────────────
// [v10.85 Yc #6] Badge bottom nav "Nhân sự" = tổng cảnh báo chờ duyệt + đơn nghỉ chờ duyệt
let _nsBadgeCB=0, _nsBadgeDN=0;
function _capNhatBadgeNS(soLoi){
  if(typeof soLoi === 'number') _nsBadgeCB = soLoi;
  const badge=document.getElementById('ns-nav-badge');
  if(!badge)return;
  const tong = _nsBadgeCB + _nsBadgeDN;
  if(tong>0){badge.textContent=tong>99?'99+':String(tong);badge.style.display='flex';}
  else{badge.style.display='none';}
}
function _capNhatBadgeNSDonNghi(soDN){
  _nsBadgeDN = soDN || 0;
  _capNhatBadgeNS(); // recompute
}

// ─── TAB NHÂN SỰ (QLNS) ─────────────────────────────────────
let nsData=[], nsCBList=[], nsFilter='all', nsSearchQ='', nsSuggestType='';
let nsNghiMaSet=new Set();  // [v10 Yc #3] Mã NV có đơn nghỉ đã duyệt trong phạm vi
let nsSuggestAll=[]; // dữ liệu gợi ý tìm kiếm

// ─── MAP KHU VỰC VIẾT TẮT [SỬA v8] ─────────────────────────
const KV_VIET_TAT = {
  'hồ chí minh':'HCM', 'ho chi minh':'HCM', 'hcm':'HCM',
  'hà nội':'HN', 'ha noi':'HN', 'hn':'HN',
  'tây nam bộ':'MT', 'tay nam bo':'MT', 'miền tây':'MT', 'mt':'MT',
  'đông nam bộ':'MĐ', 'dong nam bo':'MĐ', 'miền đông':'MĐ', 'mđ':'MĐ',
  'bắc trung bộ':'TB', 'bac trung bo':'TB', 'tb':'TB',
  'trung tây nguyên':'TTN', 'trung tay nguyen':'TTN', 'tây nguyên':'TTN', 'ttn':'TTN',
};
function _viTatKV(kv){
  if(!kv)return kv;
  const lower=kv.toLowerCase();
  for(const [k,v] of Object.entries(KV_VIET_TAT))
    if(lower.includes(k))return v;
  // Tự viết tắt: lấy chữ cái đầu mỗi từ, tối đa 3 ký tự
  return kv.split(/\s+/).map(w=>w[0]||'').join('').toUpperCase().substring(0,3);
}

let nsKhuVucFilter=''; // filter khu vực riêng (khác nsFilter)

function buildKVTabs(){
  const kvSet=new Set(CH_LIST.map(ch=>ch.khuVuc).filter(Boolean));
  const tabsEl=document.getElementById('ns-kv-tabs');
  if(!tabsEl)return;
  // Xóa tab cũ trừ "Tất cả"
  Array.from(tabsEl.children).slice(1).forEach(el=>el.remove());
  [...kvSet].sort().forEach(kv=>{
    const btn=document.createElement('button');
    btn.className='ns-tab';
    btn.textContent=_viTatKV(kv);
    btn.title=kv; // tooltip tên đầy đủ
    btn.onclick=()=>setNSKhuVuc(kv);
    tabsEl.appendChild(btn);
  });
}

function setNSKhuVuc(kv){
  nsKhuVucFilter=kv;
  document.querySelectorAll('#ns-kv-tabs .ns-tab').forEach(b=>{
    b.classList.toggle('active',
      (kv===''&&(b.id==='nst-all'||b.title===''||b.title==='Tất cả khu vực')) ||
      (kv!==''&&b.title===kv)
    );
  });
  renderNhanSu();
}

// Xây dựng danh sách gợi ý: Cửa hàng + Khu vực từ CH_LIST, NV từ nsData
function buildNSSuggestData(){
  nsSuggestAll=[];
  // Khu vực trước (icon 📍)
  const kvSet=new Set();
  CH_LIST.forEach(ch=>{
    if(ch.khuVuc&&!kvSet.has(ch.khuVuc)){
      kvSet.add(ch.khuVuc);
      nsSuggestAll.push({type:'kv',icon:'📍',main:ch.khuVuc,sub:'Khu vực'});
    }
  });
  // Cửa hàng (icon 🏪)
  CH_LIST.forEach(ch=>{
    nsSuggestAll.push({type:'ch',icon:'🏪',main:ch.ten,sub:ch.ma+(ch.khuVuc?' · '+ch.khuVuc:'')});
  });
  // NV thêm sau khi taiNhanSu xong (gọi lại từ taiNhanSu)
}

function _addNVToSuggest(){
  nsData.forEach(nv=>{
    if(!nsSuggestAll.find(x=>x.type==='nv'&&x.sub===nv.ma))
      nsSuggestAll.push({type:'nv',icon:'👤',main:nv.ten,sub:nv.ma});
  });
}

function onNSSearch(){
  nsSuggestType=''; // reset khi gõ tay
  nsSearchQ=document.getElementById('ns-search').value.trim();
  const q=nsSearchQ.toLowerCase();
  const sug=document.getElementById('ns-suggest');
  if(!q){sug.style.display='none';renderNhanSu();return;}
  // Gợi ý — lấy tối đa 3 mỗi loại: khu vực, cửa hàng, nhân viên
  const kvMatched =nsSuggestAll.filter(x=>x.type==='kv'&&(x.main.toLowerCase().includes(q)||x.sub.toLowerCase().includes(q))).slice(0,3);
  const chMatched =nsSuggestAll.filter(x=>x.type==='ch'&&(x.main.toLowerCase().includes(q)||x.sub.toLowerCase().includes(q))).slice(0,3);
  const nvMatched =nsSuggestAll.filter(x=>x.type==='nv'&&(x.main.toLowerCase().includes(q)||x.sub.toLowerCase().includes(q))).slice(0,3);
  const matched=[...kvMatched,...chMatched,...nvMatched];
  if(matched.length){
    sug.innerHTML=matched.map((x,i)=>`<div class="ns-sug-item" onclick="chonNSSuggest('${escHtml(x.main)}','${x.type}')"><span class="ns-sug-icon">${x.icon}</span><div><div class="ns-sug-main">${x.main}</div><div class="ns-sug-sub">${x.sub}</div></div></div>`).join('');
    sug.style.display='block';
  } else {
    sug.style.display='none';
  }
  renderNhanSu();
}
function escHtml(s){return (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// ════════════════════════════════════════════════════════════════════════
// [v10.85 YC#7] Avatar helper — dùng cho mọi nơi cần hiển thị ảnh đại diện
// _renderAvatar(maNV, tenNV, sizePx, avatarUrl?) → HTML string
// - Có avatarUrl → <img>
// - Không có → <div> với chữ cái đầu họ tên + màu nền mặc định
// Cache avatar_url để khỏi query lại
// ════════════════════════════════════════════════════════════════════════
window._avatarCache = window._avatarCache || {};   // {ma_nv: url}
window._avatarLoadedAll = false;

async function _loadAvatarBulk(){
  if (window._avatarLoadedAll) return;
  try {
    // [v10.85 YC#5] Paginate vì Supabase mặc định 1000 dòng/request; NS có >500 NV
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supa.from('nhan_vien')
        .select('ma_nv, avatar_url')
        .not('avatar_url', 'is', null)
        .range(offset, offset + PAGE - 1);
      if (error) { console.warn('[_loadAvatarBulk]', error.message); break; }
      if (!data || !data.length) break;
      data.forEach(r => { if (r.avatar_url) window._avatarCache[r.ma_nv] = r.avatar_url; });
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    window._avatarLoadedAll = true;
    console.log('[avatar] loaded', Object.keys(window._avatarCache).length, 'urls');
    // [v10.85] Bù ảnh cho mọi avatar đang hiện chữ trên toàn DOM
    try { _patchAvatars(); } catch(e){ console.warn('[patch avatar]', e.message); }
    // [v10.85] Patch thêm vài lần để bắt các trang/list render muộn (polling, lazy)
    setTimeout(()=>{ try{_patchAvatars();}catch(e){} }, 800);
    setTimeout(()=>{ try{_patchAvatars();}catch(e){} }, 2500);
  } catch(e){ console.warn('[_loadAvatarBulk]', e.message); }
}

function _avatarInitial(ten){
  if (!ten) return '?';
  const parts = String(ten).trim().split(/\s+/);
  const last = parts[parts.length-1] || '';
  return (last.charAt(0) || '?').toUpperCase();
}

function _renderAvatar(maNV, tenNV, sizePx, urlOverride){
  const size = sizePx || 36;
  const url = urlOverride || window._avatarCache[maNV] || '';
  const initial = _avatarInitial(tenNV);
  const fontSize = Math.round(size * 0.44);
  const baseStyle = `width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;`;
  // [v10.85] data-anv = mã NV để bù ảnh khi cache load sau; data-asz = size
  if (url){
    return `<span class="ns-avatar" data-anv="${escHtml(maNV||'')}" data-asz="${size}" style="${baseStyle}background:#E0F2F1;position:relative">
      <img src="${url}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <span style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:600;color:#0F6E56;background:#E0F2F1">${initial}</span>
    </span>`;
  }
  // Chưa có URL → render initial NHƯNG vẫn gắn data-anv để bù ảnh sau khi cache về
  return `<span class="ns-avatar" data-anv="${escHtml(maNV||'')}" data-asz="${size}" data-aini="${initial}" style="${baseStyle}background:#E0F2F1;font-size:${fontSize}px;font-weight:600;color:#0F6E56">${initial}</span>`;
}

// [v10.85] Bù ảnh cho mọi avatar đang hiện chữ (sau khi cache load xong)
function _patchAvatars(){
  if (!window._avatarCache) return;
  document.querySelectorAll('span.ns-avatar[data-anv]').forEach(span => {
    const anv = span.getAttribute('data-anv');
    const url = window._avatarCache[anv];
    if (!url) return;
    // Nếu span chưa có <img> (đang hiện chữ) → chèn img
    if (!span.querySelector('img')) {
      const sz = span.getAttribute('data-asz') || 36;
      const ini = span.getAttribute('data-aini') || '';
      const fs = Math.round(Number(sz) * 0.44);
      span.style.position = 'relative';
      span.innerHTML = `<img src="${url}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <span style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;font-size:${fs}px;font-weight:600;color:#0F6E56;background:#E0F2F1">${ini}</span>`;
    }
  });
}
function chonNSSuggest(val,type){
  document.getElementById('ns-search').value=val;
  nsSearchQ=val;
  nsSuggestType=type; // lưu type để filter chính xác
  document.getElementById('ns-suggest').style.display='none';
  renderNhanSu();
}
function hideNSSuggest(){setTimeout(()=>{document.getElementById('ns-suggest').style.display='none';},200);}

function setNSFilter(filter){
  nsFilter=filter;
  // [FIX v8] Giữ nguyên vị trí scroll, không nhảy lên đầu trang
  const listEl=document.getElementById('ns-list');
  const scrollY=window.scrollY;
  renderNhanSu();
  window.scrollTo({top:scrollY,behavior:'instant'});
}

// ═══════════════════════════════════════════════════════════
// [v10 Yc #2/#3] BỘ LỌC THỜI GIAN — Nhân sự & Đơn nghỉ phép
// ═══════════════════════════════════════════════════════════
let _nsRange  = 'thangnay';   // 'thangnay' | 'thangtruoc' | 'tuy'
let _dnpRange = 'tatca';      // [v10 FIX #6] mặc định 'Tất cả' để không bỏ sót đơn tương lai

function _ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function _thangNay(){const n=new Date();return [_ymd(new Date(n.getFullYear(),n.getMonth(),1)), _ymd(n)];}
function _thangTruoc(){
  const n=new Date();
  const tu=new Date(n.getFullYear(),n.getMonth()-1,1);
  const den=new Date(n.getFullYear(),n.getMonth(),0);
  return [_ymd(tu),_ymd(den)];
}
function _30ngay(){const n=new Date();const tu=new Date(n.getTime()-29*86400000);return [_ymd(tu),_ymd(n)];}

function _getNSRange(){
  if(_nsRange==='thangnay')  return _thangNay();
  if(_nsRange==='thangtruoc')return _thangTruoc();
  if(_nsRange==='tuy'){
    const tu=document.getElementById('ns-tu')?.value;
    const den=document.getElementById('ns-den')?.value;
    const def=_thangNay();
    return [tu||def[0], den||def[1]];
  }
  return _thangNay();
}
function setNSRange(r){
  _nsRange=r;
  document.querySelectorAll('.ns-time-tab[data-nsrange]').forEach(b=>{
    b.classList.toggle('active',b.dataset.nsrange===r);
  });
  document.getElementById('ns-daterange').style.display=r==='tuy'?'flex':'none';
  if(r==='tuy'){
    const def=_thangNay();
    if(!document.getElementById('ns-tu').value) document.getElementById('ns-tu').value=def[0];
    if(!document.getElementById('ns-den').value) document.getElementById('ns-den').value=def[1];
  }
  taiNhanSu(true);
}

function _getDNPRange(){
  if(_dnpRange==='thangnay')  return _thangNay();
  if(_dnpRange==='thangtruoc')return _thangTruoc();
  if(_dnpRange==='30ngay')    return _30ngay();
  if(_dnpRange==='tatca')     return ['1970-01-01','2999-12-31'];
  if(_dnpRange==='tuy'){
    const tu=document.getElementById('dnp-tu')?.value;
    const den=document.getElementById('dnp-den')?.value;
    const def=_thangNay();
    return [tu||def[0], den||def[1]];
  }
  return ['1970-01-01','2999-12-31'];
}
function setDNPRange(r){
  _dnpRange=r;
  document.querySelectorAll('.ns-time-tab[data-dnprange]').forEach(b=>{
    b.classList.toggle('active',b.dataset.dnprange===r);
  });
  document.getElementById('dnp-daterange').style.display=r==='tuy'?'flex':'none';
  if(r==='tuy'){
    const def=_thangNay();
    if(!document.getElementById('dnp-tu').value) document.getElementById('dnp-tu').value=def[0];
    if(!document.getElementById('dnp-den').value) document.getElementById('dnp-den').value=def[1];
  }
  taiDonNghiPhep();
}

// [v11.4 NS-05] Dedupe các fetch giống nhau trong vòng 2s
const _fetchDedupe = {};
function _dedupedFetch(url){
  const now = Date.now();
  const cached = _fetchDedupe[url];
  if(cached && (now - cached.t) < 2000){
    return cached.promise;
  }
  const promise = fetch(url);
  _fetchDedupe[url] = { promise, t: now };
  // Cleanup sau 5s
  setTimeout(() => { delete _fetchDedupe[url]; }, 5000);
  return promise;
}

function taiNhanSu(forceRefresh){
  if(_chanQuanLyNS()) return;   // [v13.49] chỉ ADMIN/QLNS
  const list=document.getElementById('ns-list');
  if(!nsData.length||forceRefresh)
    list.innerHTML='<div class="ns-empty">⏳ Đang tải nhân sự...</div>';
  const q=nsSearchQ?'&q='+encodeURIComponent(nsSearchQ):'';
  // [v10 Yc #3] Phạm vi thời gian cho "Nghỉ phép"
  const [nsTu,nsDen]=_getNSRange();
  const timeParam='&tuNgay='+nsTu+'&denNgay='+nsDen;
  // [v10.85 FIX YC#5] CUA_HANG chỉ thấy NS của CH mình
  const _maCH = (SESSION && SESSION.vaiTro === 'CUA_HANG') ? SESSION.cuaHangMa : null;
  // [v12-P2] Supabase RPC thay nhansu
  supa.rpc('fn_get_nhan_su_overview', {
    p_q: nsSearchQ || null,
    p_cua_hang: _maCH, p_khu_vuc: null,
    p_tu_ngay: nsTu, p_den_ngay: nsDen
  }).then(({ data: d, error }) => {
    if(error || !d){list.innerHTML='<div class="ns-empty">❌ Lỗi tải. Bấm ↻ để thử lại.</div>';return;}
    nsData=d.danhSach||[];
    nsCBList=d.canhBaoChuaXuLy||[];
    nsNghiMaSet=new Set((d.stats && d.stats.dsNghiMa) || []);
    document.getElementById('ns-s-dang').textContent=d.stats.dangLamViec||d.stats.dangLam||0;
    document.getElementById('ns-s-ra').textContent=d.stats.raNgoai;
    document.getElementById('ns-s-ket').textContent=d.stats.hetCa;
    const nghiEl=document.getElementById('ns-s-nghi');
    if(nghiEl)nghiEl.textContent=d.stats.nghiPhep||0;
    const soCB=nsCBList.length;
    document.getElementById('ns-s-loi').textContent=soCB;
    document.getElementById('ns-s-tong').textContent=d.stats.tongNhanSu||nsData.length;
    _capNhatBadgeNS(soCB);
    _addNVToSuggest();
    const now=new Date();
    document.getElementById('ns-updated').textContent='Cập nhật lúc '+pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
    _pollLastCount=nsCBList.length;
    renderNhanSu();
    document.getElementById('ns-refresh-btn').style.display='flex';
    _silentCheckDonNghi();
  })
  .catch(()=>{list.innerHTML='<div class="ns-empty">❌ Lỗi tải. Bấm ↻ để thử lại.</div>';});
}

// [v10.85 Yc #6] Chỉ cập nhật badge (banner ns-donnghi-banner đã bị xóa)
function _silentCheckDonNghi(){
  // [v12-P3] Supabase RPC
  // [v13.10] CH chỉ đếm đơn của CH mình
  const _maCH = (SESSION && SESSION.vaiTro === 'CUA_HANG') ? (SESSION.cuaHangMa || null) : null;
  supa.rpc('fn_get_don_nghi_list', { p_trang_thai: 'Chờ duyệt', p_ma_ch: _maCH })
  .then(({ data, error }) => {
    if(error || !data)return;
    const cho = data.tongChoDuyet || 0;
    const badge=document.getElementById('dnp-badge');
    if(badge){badge.textContent=cho>0?String(cho):'';badge.style.display=cho>0?'flex':'none';}
    _capNhatBadgeNSDonNghi(cho);
  }).catch(()=>{});
}

function renderNhanSu(){
  const q=nsSearchQ.toLowerCase();
  // Lọc theo tab khu vực trước
  const byKV = nsKhuVucFilter
    ? nsData.filter(nv=>nv.khuVuc===nsKhuVucFilter)
    : nsData;

  // Lọc theo search query — nếu chọn từ gợi ý, lọc chính xác theo loại
  const filtered=byKV.filter(nv=>{
    if(!q)return true;
    if(nsSuggestType==='kv') return nv.khuVuc.toLowerCase().includes(q);
    if(nsSuggestType==='ch') return nv.cuaHang.toLowerCase().includes(q);
    return nv.ma.toLowerCase().includes(q)||nv.ten.toLowerCase().includes(q)||
           nv.cuaHang.toLowerCase().includes(q)||nv.khuVuc.toLowerCase().includes(q);
  });
  // [v10 FIX #8] Cập nhật thống kê theo KV + search: luôn dùng `filtered` (đã áp cả 2 filter)
  // thay vì `nsData` để khi click tab KV, các ô KPI cũng lọc theo đúng KV
  const statsBase = filtered;
  document.getElementById('ns-s-dang').textContent=statsBase.filter(n=>n.trangThai==='ĐANG LÀM VIỆC').length;
  document.getElementById('ns-s-ra').textContent=statsBase.filter(n=>n.trangThai==='RA NGOÀI').length;
  document.getElementById('ns-s-ket').textContent=statsBase.filter(n=>n.trangThai==='KẾT THÚC').length;
  // [v10 Yc #3] Ô "Nghỉ phép" — đếm NV có đơn nghỉ đã duyệt (đã lọc theo KV nếu chọn tab)
  const nghiEl=document.getElementById('ns-s-nghi');
  if(nghiEl){
    const nghiCount = statsBase.filter(n=>nsNghiMaSet.has(n.ma)).length;
    nghiEl.textContent=nghiCount;
  }
  // Đếm cảnh báo theo KV + search
  const cbFiltered = nsCBList.filter(cb=>{
    const nv = nsData.find(n=>n.ma===cb.maNV);
    if(!nv)return false;
    // Theo KV
    if(nsKhuVucFilter && nv.khuVuc!==nsKhuVucFilter) return false;
    // Theo search (nếu có)
    if(q){
      if(nsSuggestType==='kv') return nv.khuVuc.toLowerCase().includes(q);
      if(nsSuggestType==='ch') return nv.cuaHang.toLowerCase().includes(q);
      return cb.maNV.toLowerCase().includes(q)||cb.tenNV.toLowerCase().includes(q)||
             nv.cuaHang.toLowerCase().includes(q)||nv.khuVuc.toLowerCase().includes(q);
    }
    return true;
  });
  const loiCount=cbFiltered.length;
  document.getElementById('ns-s-loi').textContent=loiCount;
  document.getElementById('ns-s-tong').textContent=statsBase.length;
  // Banner cần duyệt
  const banner=document.getElementById('ns-loi-banner'); /* v10.85: banner removed */
  if(banner){if(loiCount>0){const el=document.getElementById('ns-loi-count');if(el)el.textContent=loiCount;banner.style.display='flex';}else banner.style.display='none';}
  // Badge tab — luôn dùng tổng toàn hệ thống
  _capNhatBadgeNS(nsCBList.length);

  const isQL=SESSION&&(SESSION.vaiTro==='QLNS'||SESSION.vaiTro==='ADMIN');
  const el=document.getElementById('ns-list');

  // Tab "Cần duyệt": hiển thị từng CẢNH BÁO riêng lẻ
  if(nsFilter==='__loi__'){
    const cbShow=cbFiltered;
    if(!cbShow.length){el.innerHTML='<div class="ns-empty">Không có trường hợp cần duyệt.</div>';return;}
    // [v10.8] Bulk bar "Duyệt tất cả" — chỉ đếm các CB đã giải trình (eligible)
    const daGT = cbShow.filter(cb=>!!cb.giaiTrinh);
    const bulkHtml = (isQL && daGT.length > 0) ? `
      <div class="yc-bulk-bar" style="margin:0 14px 10px">
        <button class="yc-bulk-btn yc-bulk-ok" onclick="duyetTatCaCBNS('ok')">✓ Duyệt tất cả (${daGT.length})</button>
        <button class="yc-bulk-btn yc-bulk-no" onclick="duyetTatCaCBNS('no')">✗ Từ chối tất cả</button>
      </div>` : '';
    el.innerHTML = bulkHtml + cbShow.map(cb=>{
      const initials=cb.tenNV.split(' ').slice(-2).map(w=>w[0]||'').join('').toUpperCase();
      const daDaGT=!!cb.giaiTrinh;
      // [v9.45] Hiển thị đầy đủ thông tin giống Admin cảnh báo chưa duyệt
      const isRequireFix = (cb.loaiCB === 'SAI CA' || cb.loaiCB === 'THIẾU CA');
      const badgeFix = isRequireFix
        ? '<span style="display:inline-block;padding:2px 6px;background:#FEF3C7;color:#92400E;border-radius:4px;font-size:10px;font-weight:600;margin-left:4px">CẦN SỬA GIỜ</span>'
        : '';
      const noiDung = cb.noiDung ? `<div style="font-size:11px;color:var(--text-m);margin-top:3px;line-height:1.4">${escHtml(cb.noiDung)}</div>` : '';
      const giaiTrinh = daDaGT
        ? `<div style="background:#FFFBEB;border-left:3px solid #F59E0B;padding:6px 8px;margin-top:5px;border-radius:4px;font-size:11px;line-height:1.4">
             <span style="color:#92400E;font-weight:600">📝 Giải trình:</span> ${escHtml(cb.giaiTrinh)}
           </div>`
        : `<div style="background:#FEF2F2;border-left:3px solid #EF4444;padding:6px 8px;margin-top:5px;border-radius:4px;font-size:11px;color:#991B1B">
             ⚠️ Chưa giải trình
           </div>`;
      const btnDuyet=isQL?`<div class="ns-duyet-wrap" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        ${isRequireFix ? `<button class="ns-btn-ok" style="background:#F59E0B" onclick="adm2OpenSuaLog('${cb.maNV}','${cb.ngay||''}','${cb.id||cb.cbRowIdx}')">✎ Sửa lịch</button>` : ''}
        <button class="ns-btn-ok" onclick="duyetCB(event,'${cb.cbRowIdx}','${cb.maNV}','Duyệt','${cb.ngay||''}')">✓ Duyệt</button>
        <button class="ns-btn-no" onclick="duyetCB(event,'${cb.cbRowIdx}','${cb.maNV}','Không duyệt','${cb.ngay||''}')">✗ Từ chối</button>
      </div>`:'';
      return `<div class="ns-item" id="cb-row-${cb.cbRowIdx}" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;align-items:flex-start;gap:10px">
          ${_renderAvatar(cb.maNV, cb.tenNV, 40)}
          <div class="ns-info" style="flex:1">
            <div class="ns-ten">${cb.tenNV} <span style="font-size:11px;font-weight:400;color:var(--text-m)">${cb.maNV}</span></div>
            <div class="ns-sub"><strong>${cb.loaiCB}</strong>${badgeFix} · ${cb.ngay || ''} ${cb.gio ? '· '+cb.gio : ''}</div>
            ${noiDung}
          </div>
          <span class="ns-badge nsb-loi">${daDaGT?'Đã GT':'Chưa GT'}</span>
        </div>
        ${giaiTrinh}
        ${btnDuyet}
      </div>`;
    }).join('');
    return;
  }

  // Các tab khác: hiển thị theo NV, sắp xếp Khu vực → Cửa hàng → Tên
  const list=filtered.filter(nv=>{
    if(nsFilter==='all') return true;
    // [v10 Yc #3] Tab "NGHỈ PHÉP" — chỉ hiện NV có đơn nghỉ đã duyệt trong phạm vi
    if(nsFilter==='NGHỈ PHÉP') return nsNghiMaSet.has(nv.ma);
    return nv.trangThai===nsFilter;
  }).sort((a,b)=>{
    const kv=(a.khuVuc||'').localeCompare(b.khuVuc||'');
    if(kv!==0)return kv;
    const ch=(a.cuaHang||'').localeCompare(b.cuaHang||'');
    if(ch!==0)return ch;
    return (a.ten||'').localeCompare(b.ten||'');
  });
  if(!list.length){el.innerHTML='<div class="ns-empty">Không có nhân sự phù hợp.</div>';return;}

  const ttCls={'ĐANG LÀM VIỆC':'nsb-dang','RA NGOÀI':'nsb-ra','KẾT THÚC':'nsb-ket','CHƯA CHẤM':'nsb-chua'};
  const avCls={'ĐANG LÀM VIỆC':'ns-av-dang','RA NGOÀI':'ns-av-ra','KẾT THÚC':'ns-av-ket','CHƯA CHẤM':'ns-av-chua'};
  const ttLbl={'ĐANG LÀM VIỆC':'Đang làm','RA NGOÀI':'Ra ngoài','KẾT THÚC':'Hết ca','CHƯA CHẤM':'Chưa chấm'};
  const nghiMode=nsFilter==='NGHỈ PHÉP'; // [v10 Yc #3]

  let lastKV='';
  el.innerHTML=list.map(nv=>{
    const initials=nv.ten.split(' ').slice(-2).map(w=>w[0]||'').join('').toUpperCase();
    const isLoi=nv.xacNhan==='KHÔNG HỢP LỆ';
    const avClass=isLoi?'ns-av-loi':(nghiMode?'ns-av-chua':(avCls[nv.trangThai]||'ns-av-chua'));
    const badgeCls=isLoi?'nsb-loi':(nghiMode?'nsb-chua':(ttCls[nv.trangThai]||'nsb-chua'));
    const badgeLbl=isLoi?'⚠ Cần duyệt':(nghiMode?'🌿 Nghỉ phép':(ttLbl[nv.trangThai]||nv.trangThai));
    const gio=nv.gio?' · '+nv.gio:'';
    const nvCB=nsCBList.filter(cb=>cb.maNV===nv.ma);
    const nvCBTxt=nvCB.length>0?`<span style="font-size:10px;color:var(--red);margin-left:4px">(${nvCB.length} CB)</span>`:'';
    // Group separator khi khu vực thay đổi
    let sep='';
    const kv=nv.khuVuc||'Chưa phân khu';
    if(kv!==lastKV){sep=`<div class="ns-group-sep"><span class="ns-group-dot"></span>${kv}</div>`;lastKV=kv;}
    return sep+`<div class="ns-item">
      ${_renderAvatar(nv.ma, nv.ten, 40)}
      <div class="ns-info">
        <div class="ns-ten">${nv.ten} <span style="font-size:11px;font-weight:400;color:var(--text-m)">${nv.ma}</span>${nvCBTxt}</div>
        <div class="ns-sub">${typeof _fmtChVoiDoiSale === 'function' ? _fmtChVoiDoiSale(nv.ma, nv.cuaHang) : nv.cuaHang}${gio}</div>
      </div>
      <span class="ns-badge ${badgeCls}">${badgeLbl}</span>
    </div>`;
  }).join('');
}

// Duyệt từng cảnh báo riêng lẻ theo cbRowIdx
function duyetCB(event,cbRowIdx,maNV,quyetDinh,ngayParam){
  event.stopPropagation();
  const ngay = ngayParam || new Date().toISOString().substring(0,10);
  const wrap=event.target.closest('.ns-duyet-wrap');
  const btns=wrap?wrap.querySelectorAll('button'):[];
  // Phản hồi UI ngay lập tức
  btns.forEach(b=>{b.disabled=true;});
  const okBtn=event.target.closest('.ns-btn-ok')||event.target.closest('.ns-btn-no');
  if(okBtn){okBtn.textContent='Đang xử lý...';}
  // Xóa row khỏi UI ngay (optimistic update)
  const row=document.getElementById('cb-row-'+cbRowIdx);
  if(row){row.style.opacity='0.4';row.style.pointerEvents='none';}
  // Gửi request background — không chờ
  // [v12-P2] Supabase RPC. cbRowIdx có thể là UUID (sau migrate) hoặc số (legacy)
  const isUuid = String(cbRowIdx).match(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  supa.rpc('fn_duyet_canh_bao', {
    p_ma_nv: maNV,
    p_ngay: ngay,
    p_quyet_dinh: quyetDinh,
    p_ma_nguoi_duyet: SESSION.ma,
    p_cb_id: isUuid ? cbRowIdx : null,
    p_loai_cb: null,
    p_gio: null
  }).then(({ data: res, error }) => {
    if(!error && res && res.success){
      showToast(quyetDinh==='Duyệt'?`✓ Đã duyệt cảnh báo — đã thông báo NV`:`✗ Đã từ chối — đã thông báo NV`,'ok');
      const idx=nsCBList.findIndex(cb=>cb.cbRowIdx===cbRowIdx);
      if(idx>=0)nsCBList.splice(idx,1);
      if(quyetDinh==='Duyệt'){
        const nvIdx=nsData.findIndex(n=>n.ma===maNV);
        if(nvIdx>=0&&!nsCBList.find(cb=>cb.maNV===maNV))
          nsData[nvIdx].xacNhan='DUYỆT';
      }
      renderNhanSu();
      _capNhatBadgeNS(nsCBList.length);
    } else {
      showToast((res&&res.error)||(error&&error.message)||'Lỗi duyệt.','err');
      if(row){row.style.opacity='1';row.style.pointerEvents='';}
      btns.forEach(b=>{b.disabled=false;});
    }
  }).catch(()=>{
    showToast('Lỗi kết nối.','err');
    if(row){row.style.opacity='1';row.style.pointerEvents='';}
    btns.forEach(b=>{b.disabled=false;});
  });
}

// Xem chi tiết 1 cảnh báo cụ thể
let _nsdCBIdx=0, _nsdCBMaNV='';
function xemCBChiTiet(cbRowIdx,maNV,tenNV,noiDung,giaiTrinh){
  _nsdCBIdx=cbRowIdx;_nsdCBMaNV=maNV;
  document.getElementById('nsd-name').textContent=tenNV+' ('+maNV+')';
  document.getElementById('nsd-sub').textContent='Cảnh báo hôm nay';
  document.getElementById('nsd-canhbao').textContent=noiDung||'Chấm công không hợp lệ';
  const gtSec=document.getElementById('nsd-gt-sec');
  if(giaiTrinh){document.getElementById('nsd-giaitrinh').textContent=giaiTrinh;gtSec.style.display='block';}
  else{gtSec.style.display='none';}
  document.getElementById('ns-detail-modal').classList.add('show');
}

// Xem chi tiết giải trình trong modal
let _nsdMaNV='', _nsdNgay='';
function xemGiaiTrinhChiTiet(maNV,tenNV,giaiTrinh,xacNhan){
  _nsdMaNV=maNV;
  _nsdNgay=new Date().toISOString().substring(0,10);
  document.getElementById('nsd-name').textContent=tenNV+' ('+maNV+')';
  document.getElementById('nsd-sub').textContent='Cần xem xét cảnh báo hôm nay';
  document.getElementById('nsd-canhbao').textContent='Chấm công không hợp lệ (GPS ngoài vùng hoặc sai thứ tự)';
  const gtSec=document.getElementById('nsd-gt-sec');
  const gtTxt=document.getElementById('nsd-giaitrinh');
  if(giaiTrinh){
    gtTxt.textContent=giaiTrinh;
    gtSec.style.display='block';
  } else {
    gtSec.style.display='none';
  }
  // Ẩn nút duyệt nếu đã có quyết định
  const actions=document.getElementById('nsd-actions');
  actions.style.display=(xacNhan==='DUYỆT'||xacNhan==='KHÔNG HỢP LỆ'&&!giaiTrinh)?'flex':'flex';
  document.getElementById('ns-detail-modal').classList.add('show');
}
function closeNsDetail(){document.getElementById('ns-detail-modal').classList.remove('show');}
function duyetTuModal(quyetDinh){
  closeNsDetail();
  if(_nsdCBIdx>0 || (typeof _nsdCBIdx === 'string' && _nsdCBIdx)){
    const ngay=new Date().toISOString().substring(0,10);
    const isUuid = String(_nsdCBIdx).match(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    // [v12-P2] Supabase RPC
    supa.rpc('fn_duyet_canh_bao', {
      p_ma_nv: _nsdCBMaNV,
      p_ngay: ngay,
      p_quyet_dinh: quyetDinh,
      p_ma_nguoi_duyet: SESSION.ma,
      p_cb_id: isUuid ? _nsdCBIdx : null,
      p_loai_cb: null,
      p_gio: null
    }).then(({ data: res, error }) => {
      if(!error && res && res.success){
        showToast(quyetDinh==='Duyệt'?'✓ Đã duyệt':'✗ Đã từ chối','ok');
        const idx=nsCBList.findIndex(cb=>cb.cbRowIdx===_nsdCBIdx);
        if(idx>=0)nsCBList.splice(idx,1);
        renderNhanSu();
        _capNhatBadgeNS(nsCBList.length);
      }else{showToast((res&&res.error)||(error&&error.message)||'Lỗi.','err');}
    }).catch(()=>showToast('Lỗi kết nối.','err'));
  } else {
    _duyetNVThuc(_nsdMaNV,_nsdNgay,quyetDinh);
  }
}
// [v10.8 DEPRECATED] Hàm legacy, không còn dùng. Với backend mới, gọi duyetCanhBao
// không truyền cbRowIdx và có nhiều CB cùng NV+ngày sẽ bị từ chối để tránh duyệt nhầm.
// Giữ lại để không phá nếu có nơi khác gọi.
function duyetNhanSu(event,maNV,quyetDinh){
  event.stopPropagation();
  const ngay=new Date().toISOString().substring(0,10);
  const btns=event.target.closest('.ns-duyet-wrap').querySelectorAll('button');
  btns.forEach(b=>{b.disabled=true;});
  _duyetNVThuc(maNV,ngay,quyetDinh,btns);
}
function _duyetNVThuc(maNV,ngay,quyetDinh,btns){
  // [v12-P2] Supabase RPC
  supa.rpc('fn_duyet_canh_bao', {
    p_ma_nv: maNV,
    p_ngay: ngay,
    p_quyet_dinh: quyetDinh,
    p_ma_nguoi_duyet: SESSION.ma,
    p_cb_id: null,
    p_loai_cb: null,
    p_gio: null
  }).then(({ data: res, error }) => {
    if(!error && res && res.success){
      showToast(quyetDinh==='Duyệt'?`✓ Đã duyệt`:`✗ Đã từ chối`,'ok');
      const idx=nsData.findIndex(n=>n.ma===maNV);
      if(idx>=0)nsData[idx].xacNhan=quyetDinh==='Duyệt'?'DUYỆT':'KHÔNG HỢP LỆ';
      renderNhanSu();
    } else {
      showToast((res&&res.error)||(error&&error.message)||'Lỗi duyệt.','err');
      if(btns)btns.forEach(b=>{b.disabled=false;});
    }
  }).catch(()=>{showToast('Lỗi kết nối.','err');if(btns)btns.forEach(b=>{b.disabled=false;});});
}

// ─── BẢN ĐỒ CHỈ ĐƯỜNG ───────────────────────────────────────
let mapSelectedCH=null, userLatLng=null, nearbyRendered=false, mapSearchResults=[];
function khoiDongBanDo(){
  document.getElementById('map-nearby-wrap').style.display='block';
  if(!nearbyRendered&&CH_LIST.length){renderNearby();nearbyRendered=true;}
  if(navigator.geolocation&&!userLatLng){
    navigator.geolocation.getCurrentPosition(
      pos=>{userLatLng={lat:pos.coords.latitude,lng:pos.coords.longitude};renderNearby();},
      ()=>{},{enableHighAccuracy:false,timeout:5000,maximumAge:30000}
    );
  }
}
function onMapSearch(){
  const q=document.getElementById('map-search-input').value.trim().toLowerCase();
  const list=document.getElementById('map-suggest-list');
  if(!q){list.style.display='none';mapSearchResults=[];return;}
  mapSearchResults=CH_LIST.filter(ch=>ch.ma.toLowerCase().includes(q)||ch.ten.toLowerCase().includes(q)).slice(0,10);
  if(!mapSearchResults.length){list.style.display='none';return;}
  list.innerHTML=mapSearchResults.map((ch,i)=>`<div class="map-suggest-item" data-idx="${i}"><span class="map-si-pin">📍</span><div><div class="map-si-main">${ch.ten}</div><div class="map-si-sub">${ch.ma}${ch.khuVuc?' · '+ch.khuVuc:''}</div></div></div>`).join('');
  list.style.display='block';
}
function hideMapSuggest(){setTimeout(()=>{document.getElementById('map-suggest-list').style.display='none';},150);}
document.addEventListener('mousedown',e=>{
  const item=e.target.closest('.map-suggest-item[data-idx]');
  if(!item)return;
  const idx=parseInt(item.dataset.idx);
  if(!isNaN(idx)&&mapSearchResults[idx])chonCuaHangBanDo(mapSearchResults[idx]);
});
function chonCuaHangBanDo(ch){
  if(typeof ch==='string')ch=JSON.parse(ch);
  mapSelectedCH=ch;
  document.getElementById('map-search-input').value=ch.ten;
  document.getElementById('map-suggest-list').style.display='none';
  document.getElementById('map-store-name').textContent=ch.ten;
  document.getElementById('map-store-kv').textContent=ch.khuVuc||ch.ma;
  const diaChiEl=document.getElementById('map-store-diachi');
  if(ch.diaChi){diaChiEl.innerHTML='<span class="map-store-diachi-pin">📍</span><span>'+ch.diaChi+'</span>';}
  else{diaChiEl.innerHTML='';}
  const bar=document.getElementById('map-distance-bar');bar.style.display='none';
  document.getElementById('map-result-card').style.display='block';
  if(ch.lat&&ch.lng&&!isNaN(parseFloat(ch.lat))){
    if(userLatLng){tinhKhoangCachOSRM(ch);}
    else{navigator.geolocation.getCurrentPosition(pos=>{userLatLng={lat:pos.coords.latitude,lng:pos.coords.longitude};tinhKhoangCachOSRM(ch);},()=>{},{enableHighAccuracy:false,timeout:5000,maximumAge:30000});}
  }
}
function tinhKhoangCachOSRM(ch){
  if(!userLatLng||!ch.lat||!ch.lng)return;
  const lat=parseFloat(ch.lat),lng=parseFloat(ch.lng);
  if(isNaN(lat)||isNaN(lng))return;
  const bar=document.getElementById('map-distance-bar'),val=document.getElementById('map-distance-val'),loading=document.getElementById('map-dist-loading'),label=document.getElementById('map-dist-label');
  bar.style.display='block';val.textContent='';loading.style.display='inline';label.textContent='Khoảng cách đường đi:';
  const url=`https://router.project-osrm.org/route/v1/driving/${userLatLng.lng},${userLatLng.lat};${lng},${lat}?overview=false&alternatives=false`;
  fetch(url,{signal:AbortSignal.timeout(8000)})
  .then(r=>r.json()).then(data=>{
    loading.style.display='none';
    if(data.code==='Ok'&&data.routes&&data.routes[0]){
      const dist=data.routes[0].distance,dur=data.routes[0].duration*2.0;
      const distTxt=dist<1000?Math.round(dist)+'m':(dist/1000).toFixed(1)+'km';
      const durPhut=Math.round(dur/60);
      const durTxt=durPhut<60?durPhut+'p':Math.floor(durPhut/60)+'g '+String(durPhut%60).padStart(2,'0')+'p';
      val.textContent=' '+distTxt+' · ~'+durTxt+' lái xe (ước tính)';
    }else{
      const d=haversineMap(userLatLng.lat,userLatLng.lng,lat,lng);
      val.textContent=' ~'+(d<1000?Math.round(d)+'m':(d/1000).toFixed(1)+'km')+' (đường thẳng)';
      label.textContent='Khoảng cách:';
    }
  }).catch(()=>{
    loading.style.display='none';
    const d=haversineMap(userLatLng.lat,userLatLng.lng,lat,lng);
    val.textContent=' ~'+(d<1000?Math.round(d)+'m':(d/1000).toFixed(1)+'km')+' (đường thẳng)';
    label.textContent='Khoảng cách:';
  });
}
function chiDuong(){
  if(!mapSelectedCH)return;
  const {lat,lng}=mapSelectedCH;
  if(!lat||!lng||isNaN(lat)||isNaN(lng)){alert('Cửa hàng này chưa có tọa độ GPS.');return;}
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,'_blank');
}
function haversineMap(lat1,lon1,lat2,lon2){
  const R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function renderNearby(){
  let list=[...CH_LIST];
  if(userLatLng){
    list=list.filter(ch=>ch.lat&&ch.lng).map(ch=>({...ch,dist:haversineMap(userLatLng.lat,userLatLng.lng,parseFloat(ch.lat),parseFloat(ch.lng))})).sort((a,b)=>a.dist-b.dist).slice(0,8);
  }else{list=list.slice(0,8);}
  const wrap=document.getElementById('map-nearby-wrap'),el=document.getElementById('map-nearby-list');
  if(!list.length){el.innerHTML='<div style="padding:16px;font-size:13px;color:var(--text-m);text-align:center">Chưa có dữ liệu cửa hàng.</div>';wrap.style.display='block';return;}
  el.innerHTML=list.map(ch=>{
    const distTxt=ch.dist!=null?(ch.dist<1000?Math.round(ch.dist)+'m':(ch.dist/1000).toFixed(1)+'km'):'';
    const sub=ch.diaChi||ch.khuVuc||ch.ma;
    return `<div class="map-nearby-item" onclick="chonCuaHangBanDo(${JSON.stringify(ch).replace(/"/g,'&quot;')})"><div class="map-nearby-pin">📍</div><div style="flex:1;min-width:0"><div class="map-nearby-name">${ch.ten}</div><div class="map-nearby-kv" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sub}${distTxt?' · <strong>'+distTxt+'</strong>':''}</div></div><div class="map-nearby-arrow">›</div></div>`;
  }).join('');
  wrap.style.display='block';
}

// ─── TOAST ──────────────────────────────────────────────────

// [v11.4 NS-03b/LC-03c] App-style confirm modal — thay confirm() native (iOS đen xấu)
let _appConfirmResolve = null;
function appConfirm(message, opts){
  return new Promise(resolve => {
    _appConfirmResolve = resolve;
    opts = opts || {};
    document.getElementById('app-confirm-title').textContent = opts.title || 'Xác nhận';
    document.getElementById('app-confirm-body').textContent = String(message || '');
    const okBtn = document.getElementById('app-confirm-ok');
    okBtn.textContent = opts.okLabel || 'Xác nhận';
    okBtn.classList.toggle('danger', !!opts.danger);
    // [v11.8] Support cancelLabel
    const cancelBtn = document.getElementById('app-confirm-cancel');
    if (cancelBtn) cancelBtn.textContent = opts.cancelLabel || 'Hủy';
    document.getElementById('app-confirm').classList.add('show');
    document.getElementById('app-confirm-bd').classList.add('show');
    document.getElementById('app-confirm-bd').onclick = () => appConfirmDo(false);
  });
}
function appConfirmDo(result){
  document.getElementById('app-confirm').classList.remove('show');
  document.getElementById('app-confirm-bd').classList.remove('show');
  if(_appConfirmResolve){ _appConfirmResolve(result); _appConfirmResolve = null; }
}

function showToast(msg,type){
  let t=document.getElementById('_toast');
  if(!t){
    t=document.createElement('div');t.id='_toast';
    t.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;z-index:99999;max-width:320px;text-align:center;transition:opacity .3s;white-space:pre-line;box-shadow:0 4px 16px rgba(0,0,0,.18);pointer-events:none';
    document.body.appendChild(t);
  }
  t.style.background=type==='ok'?'var(--green)':'var(--red)';
  t.style.color='white';t.style.opacity='1';t.textContent=msg;
  clearTimeout(t._t);t._t=setTimeout(()=>{t.style.opacity='0';},3500);
}

// [v10 FIX #7] Busy overlay: chặn UI trong lúc xử lý, hiện spinner + text
function _showBusy(txt){
  let ov=document.getElementById('_busy');
  if(!ov){
    ov=document.createElement('div');ov.id='_busy';ov.className='busy-overlay';
    ov.innerHTML='<div class="busy-box"><span class="spinner"></span><span id="_busy-txt">Đang xử lý...</span></div>';
    document.body.appendChild(ov);
  }
  document.getElementById('_busy-txt').textContent=txt||'Đang xử lý...';
  ov.classList.add('on');
}
function _hideBusy(){
  const ov=document.getElementById('_busy');
  if(ov)ov.classList.remove('on');
}

// ═══════════════════════════════════════════════════════════════════════════
// [v13.16] GLOBAL IMAGE FALLBACK: Supabase 404 → Drive URL
// Khi ảnh đã bị xóa khỏi Supabase (theo chu kỳ cleanup tháng), <img> load fail
// → interceptor tự gọi RPC fn_resolve_drive_url → swap src sang Drive.
// Phủ TOÀN BỘ app không cần sửa từng chỗ render.
// ═══════════════════════════════════════════════════════════════════════════
(function(){
  const _resolveCache = {};  // url → driveUrl | 'NONE' (tránh gọi lặp)

  async function _resolveDrive(url){
    if (_resolveCache[url] !== undefined) return _resolveCache[url] === 'NONE' ? null : _resolveCache[url];
    try {
      const { data, error } = await supa.rpc('fn_resolve_drive_url', { p_url: url });
      const result = (!error && data) ? data : null;
      _resolveCache[url] = result || 'NONE';
      return result;
    } catch(e) {
      _resolveCache[url] = 'NONE';
      return null;
    }
  }

  // Capture-phase error listener — bắt mọi img error toàn document
  document.addEventListener('error', async function(ev){
    const img = ev.target;
    if (!img || img.tagName !== 'IMG') return;
    if (img._driveFallbackTried) return;            // tránh loop
    const src = img.src || '';
    if (src.indexOf('/storage/v1/object/public/') < 0) return;  // chỉ ảnh Supabase
    img._driveFallbackTried = true;
    const driveUrl = await _resolveDrive(src);
    if (driveUrl) {
      img.src = driveUrl;
    }
  }, true);  // useCapture = true: error không bubble, phải capture
})();
