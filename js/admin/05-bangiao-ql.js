/* ═══════════════════════════════════════════════════════════════════════════
 *  NÓN SƠN — BÀN GIAO CA · QUẢN LÝ v1.0 (Sprint 2)
 *  
 *  3 tab:
 *   1. Sự vụ: list cross-CH, filter (CH/khu vực/trạng thái/mức độ),
 *      actions: Tiếp nhận / Bắt đầu xử lý / Phản hồi (deadline BẮT BUỘC) / Đóng / Hủy
 *   2. Timeline: ảnh + tóm tắt biên bản từ tất cả CH, filter (ngày/khu vực/CH)
 *   3. Thống kê: 3 thẻ (Đã gửi / Chưa gửi / Phát sinh sự cố) + range ngày
 *
 *  Kế thừa CSS chk-* + bg-tl-* (Timeline NV)
 *  Backend RPCs: fn_su_vu_list, fn_su_vu_tiep_nhan, fn_su_vu_bat_dau,
 *                fn_su_vu_phan_hoi (v2 — deadline), fn_su_vu_hoan_tat,
 *                fn_su_vu_huy, fn_ban_giao_timeline_ql, fn_ban_giao_thong_ke
 * ═══════════════════════════════════════════════════════════════════════════ */

// State
let bgqlSub = 'suvu';
let bgqlInnerTab = 'suvu';  // [v13.28] 'suvu' | 'tienchi'
let bgqlSuVuCache = null;
let bgqlTienChiCache = null;
let bgqlSuVuFilter = { trang_thai:'all', muc_do:'all', khu_vuc:'all', ma_ch:null, nhom:[], muc_con:[], range:'7d', customFrom:null, customTo:null };
let bgqlDanhMucTS = null;          // [v13.71] danh mục tài sản — cho lọc hạng mục 2 cấp
let bgqlHmExpanded = {};           // [v13.71] {key:true} nhóm đang xổ con
let bgqlSuVuSort = 'muc_do';       // [v13.72] muc_do | cua_hang | thoi_gian
let bgqlSvTimeRange = 'all';       // [v13.74] all|today|7d|30d|custom
let bgqlSvCustomFrom = null;
let bgqlSvCustomTo = null;
let bgqlSvSearchTimer = null;
let bgqlTimelineFilter = { content:'all', from:null, to:null, ma_ch:null, khu_vuc:'all' };
let bgqlTLSort = 'moi';            // [v13.76] moi | cu | suvu
let bgqlTimelineCache = null;
let bgqlStatsRange = 'today'; // 'today' | 'week' | 'month' | 'custom'

// ═════════════════════════════════════════════════════════════════════════
//  ENTRY
// ═════════════════════════════════════════════════════════════════════════
function bgqlInitPage(){
  // [v13.27] Giữ tab + cache khi user switch tab về rồi quay lại
  if (bgqlSuVuCache !== null && document.getElementById('bgql-sub-suvu')) {
    // Chỉ refresh badge tab counts (không clear cache)
    bgqlSwitchSub(bgqlSub || 'suvu');
    return;
  }
  bgqlSub = 'suvu';
  bgqlSuVuCache = null;
  bgqlTimelineCache = null;
  bgqlSwitchSub('suvu');
}
window.bgqlInitPage = bgqlInitPage;

function bgqlSwitchSub(sub){
  bgqlSub = sub;
  ['suvu','timeline','stats','aibc','print'].forEach(s => {
    const tab = document.getElementById('bgql-subtab-'+s);
    const body = document.getElementById('bgql-sub-'+s);
    if (tab) tab.classList.toggle('active', s===sub);
    if (body) body.style.display = s===sub ? '' : 'none';
  });
  if (sub==='suvu') bgqlLoadSuVu();
  if (sub==='timeline') bgqlLoadTimeline();
  if (sub==='stats') bgqlLoadStats();
  if (sub==='aibc') bgqlLoadAiBaoCao();
  if (sub==='print') bgqlLoadPrint();
}
window.bgqlSwitchSub = bgqlSwitchSub;

// ═════════════════════════════════════════════════════════════════════════
//  TAB 1: SỰ VỤ
// ═════════════════════════════════════════════════════════════════════════
async function bgqlLoadSuVu(){
  const list = document.getElementById('bgql-suvu-list');
  list.innerHTML = '<div class="ns-empty">⏳ Đang tải...</div>';
  try {
    const { data, error } = await supa.rpc('fn_su_vu_list', {
      p_ma_ch: null, p_limit: 100000, p_offset: 0
    });
    if (error) throw error;
    bgqlSuVuCache = data || [];
    // [v13.71] Nạp danh mục tài sản 1 lần (cho lọc hạng mục 2 cấp)
    if (!bgqlDanhMucTS) {
      try { const { data: dm } = await supa.rpc('fn_get_danh_muc_tai_san'); bgqlDanhMucTS = dm || []; }
      catch(e){ bgqlDanhMucTS = []; }
    }
    bgqlRenderSuVuFilters();
    bgqlRenderSuVuList();
  } catch(e){
    list.innerHTML = '<div class="ns-empty" style="color:#DC2626">Lỗi: '+e.message+'</div>';
  }
}

// [v16.4] Sự vụ "trễ": quá deadline mà chưa hoàn tất, HOẶC tạo >12h mà QL chưa phản hồi
function bgqlLaTre(s){
  if (!s || ['HOAN_TAT','HUY'].includes(s.trang_thai)) return false;
  const now = Date.now();
  if (s.deadline_xu_ly && new Date(s.deadline_xu_ly).getTime() < now) return true;
  if (!s.thoi_gian_phan_hoi && s.created_at){
    const tuoiGio = (now - new Date(s.created_at).getTime()) / 3600000;
    if (tuoiGio > 12) return true;
  }
  return false;
}

// [v16.78] Sự vụ "sắp hết hạn": còn mở, có deadline, CHƯA quá hạn, còn ≤ ngưỡng theo mức độ
function bgqlSapHetHan(s){
  if (!s || ['HOAN_TAT','HUY'].includes(s.trang_thai)) return false;
  if (!s.deadline_xu_ly) return false;
  const now = Date.now();
  const dl = new Date(s.deadline_xu_ly).getTime();
  if (dl <= now) return false;                 // đã quá hạn → thuộc nhóm "trễ"
  const conGio = (dl - now) / 3600000;
  const nguong = s.muc_do==='KHAN_CAP' ? 6 : s.muc_do==='QUAN_TRONG' ? 12 : 24;  // giờ
  return conGio <= nguong;
}

function bgqlRenderSuVuFilters(){
  const cont = document.getElementById('bgql-suvu-filters');
  if (!cont) return;
  const allRaw = (bgqlSuVuCache || []).filter(s => s.trang_thai !== 'HUY');  // [v17.21] trừ hủy — danh sách CH/khu vực đầy đủ cho dropdown
  const all = bgqlGetFilteredSuVu({ skipStatus:true, skipMucDo:true });       // [v17.39] count đi theo bộ lọc CH/khu vực/thời gian
  const open = all.filter(s => !['HOAN_TAT','HUY'].includes(s.trang_thai));
  const _cMoi = all.filter(s => s.trang_thai === 'MOI_TAO').length;
  const _cXuLy = all.filter(s => ['DA_TIEP_NHAN','DANG_XU_LY','DA_PHAN_HOI','DA_XU_LY_XONG'].includes(s.trang_thai)).length;
  const _cXong = all.filter(s => s.trang_thai === 'HOAN_TAT').length;
  const _cHuy = all.filter(s => s.trang_thai === 'HUY').length;
  const _cTre = all.filter(bgqlLaTre).length;
  const _cSap = all.filter(bgqlSapHetHan).length;
  const chList = [...new Map(allRaw.map(s => [s.ma_ch, s.ten_ch_snapshot||s.ma_ch])).entries()];
  const khuVucs = [...new Set(allRaw.map(s => s.khu_vuc).filter(k=>k))].sort();
  // [v13.91] Nút Chọn nhiều — mọi quản lý (ADMIN/QLNS/QLBH), chỉ tab "suvu"
  const isAdmin = (typeof SESSION !== 'undefined' && SESSION && ['ADMIN','QLNS','QLBH'].includes(SESSION.vaiTro));
  const multiBtn = (isAdmin && bgqlInnerTab === 'suvu') ? 
    `<button class="bgql-act bgql-act-ghost bgql-msel-btn" onclick="bgqlToggleMultiSelect()">
      ${bgqlMultiSelectMode?'Đóng chọn':'Chọn nhiều'}
    </button>` : '';

  if (bgqlInnerTab === 'suvu') {
    cont.innerHTML = `
      <div class="bgql-flt-row bgql-flt-3">
        <select class="bg-tl-dropdown" onchange="bgqlSetFilterDD('muc_do', this.value)">
          <option value="all"${bgqlSuVuFilter.muc_do==='all'?' selected':''}>Mức độ: Tất cả</option>
          <option value="KHAN_CAP"${bgqlSuVuFilter.muc_do==='KHAN_CAP'?' selected':''}>Khẩn cấp</option>
          <option value="QUAN_TRONG"${bgqlSuVuFilter.muc_do==='QUAN_TRONG'?' selected':''}>Quan trọng</option>
          <option value="CAN_THIET"${bgqlSuVuFilter.muc_do==='CAN_THIET'?' selected':''}>Cần thiết</option>
        </select>
        <select class="bg-tl-dropdown" onchange="bgqlSetFilterDD('trang_thai', this.value)">
          <option value="all"${bgqlSuVuFilter.trang_thai==='all'?' selected':''}>Tất cả (${all.length})</option>
          <option value="tre"${bgqlSuVuFilter.trang_thai==='tre'?' selected':''}>Cảnh báo trễ (${_cTre})</option>
          <option value="sap_het_han"${bgqlSuVuFilter.trang_thai==='sap_het_han'?' selected':''}>Sắp hết hạn (${_cSap})</option>
          <option value="moi_tao"${bgqlSuVuFilter.trang_thai==='moi_tao'?' selected':''}>Đã tạo (${_cMoi})</option>
          <option value="dang_xu_ly"${bgqlSuVuFilter.trang_thai==='dang_xu_ly'?' selected':''}>Đang xử lý (${_cXuLy})</option>
          <option value="hoan_tat"${bgqlSuVuFilter.trang_thai==='hoan_tat'?' selected':''}>Hoàn tất (${_cXong})</option>
        </select>
        <button class="bgql-nhom-toggle" id="bgql-nhom-toggle" onclick="bgqlToggleNhomPanel()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          <span>Hạng mục</span>
          <span class="bgql-nhom-badge" id="bgql-nhom-badge"${bgqlSuVuFilter.muc_con.length?'':' style="display:none"'}>${bgqlSuVuFilter.muc_con.length||''}</span>
          <svg class="bgql-nhom-caret" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="bgql-nhom-panel" id="bgql-nhom-panel" style="display:none">
        ${bgqlRenderHmTree()}
        <button class="bgql-nhom-done" onclick="bgqlToggleNhomPanel()">Xong</button>
      </div>
      <div class="bgql-flt-row bgql-flt-3">
        <select class="bg-tl-dropdown" onchange="bgqlSetSvTime(this.value)">
          <option value="all"${bgqlSvTimeRange==='all'?' selected':''}>Mọi lúc</option>
          <option value="today"${bgqlSvTimeRange==='today'?' selected':''}>Hôm nay</option>
          <option value="7d"${bgqlSvTimeRange==='7d'?' selected':''}>7 ngày qua</option>
          <option value="30d"${bgqlSvTimeRange==='30d'?' selected':''}>30 ngày qua</option>
          <option value="custom"${bgqlSvTimeRange==='custom'?' selected':''}>Khoảng ngày</option>
        </select>
        <div class="bgql-stats-search">
          <input type="text" class="bg-tl-dropdown bgql-stats-search-input" placeholder="Cửa hàng / khu vực" value="${escHtml(bgqlSvSearchLabel())}" oninput="bgqlSvSearchInput(this.value)" onfocus="bgqlSvSearchInput(this.value)">
          <div class="bgql-stats-search-dd" id="bgql-sv-search-dd" style="display:none"></div>
          ${(bgqlSuVuFilter.ma_ch || (bgqlSuVuFilter.khu_vuc&&bgqlSuVuFilter.khu_vuc!=='all')) ? `<button class="bgql-stats-search-clear" onclick="bgqlSvSearchClear()">✕</button>` : ''}
        </div>
        <select class="bg-tl-dropdown" onchange="bgqlSetSort(this.value)">
          <option value="muc_do"${bgqlSuVuSort==='muc_do'?' selected':''}>Sắp: Mức độ</option>
          <option value="cua_hang"${bgqlSuVuSort==='cua_hang'?' selected':''}>Sắp: Cửa hàng</option>
          <option value="thoi_gian"${bgqlSuVuSort==='thoi_gian'?' selected':''}>Sắp: Ngày gửi</option>
        </select>
      </div>
      ${bgqlSvTimeRange==='custom' ? `<div class="bgql-flt-row">
        <input type="date" class="bg-tl-dropdown" value="${bgqlSvCustomFrom||''}" onchange="bgqlSetSvCustomFrom(this.value)">
        <input type="date" class="bg-tl-dropdown" value="${bgqlSvCustomTo||''}" onchange="bgqlSetSvCustomTo(this.value)">
      </div>` : ''}
      <div class="bgql-flt-row bgql-tool-3">
        ${multiBtn||''}
        <button class="bgql-act bgql-act-ghost bgql-tool-btn" onclick="bgqlExportSuVu()">Xuất Excel</button>
      </div>
    `;
  } else if (bgqlInnerTab === 'tienchi') {
    const tc = bgqlTienChiCache || [];
    const tcChList = [...new Map(tc.map(t => [t.ma_ch, t.ten_ch_snapshot||t.ma_ch])).entries()];
    const tcKhuVucs = [...new Set(tc.map(t => t.khu_vuc).filter(k=>k))].sort();
    cont.innerHTML = `
      <div class="bgql-flt-row">
        <select class="bg-tl-dropdown" onchange="bgqlSetFilterDD('range', this.value)">
          <option value="today"${bgqlSuVuFilter.range==='today'?' selected':''}>Hôm nay</option>
          <option value="7d"${bgqlSuVuFilter.range==='7d'?' selected':''}>7 ngày qua</option>
          <option value="30d"${bgqlSuVuFilter.range==='30d'?' selected':''}>30 ngày qua</option>
          <option value="custom"${bgqlSuVuFilter.range==='custom'?' selected':''}>Tự chọn khoảng…</option>
        </select>
        ${tcKhuVucs.length>1 ? `<select class="bg-tl-dropdown" onchange="bgqlSetFilterDD('khu_vuc', this.value)">
          <option value="all"${bgqlSuVuFilter.khu_vuc==='all'?' selected':''}>Mọi khu vực</option>
          ${tcKhuVucs.map(k=>`<option value="${escHtml(k)}"${bgqlSuVuFilter.khu_vuc===k?' selected':''}>${escHtml(k)}</option>`).join('')}
        </select>` : ''}
      </div>
      ${bgqlSuVuFilter.range === 'custom' ? `<div class="bgql-flt-row">
        <input type="date" class="bg-tl-dropdown" value="${bgqlSuVuFilter.customFrom||''}" onchange="bgqlSetTcCustomFrom(this.value)">
        <input type="date" class="bg-tl-dropdown" value="${bgqlSuVuFilter.customTo||''}" onchange="bgqlSetTcCustomTo(this.value)">
      </div>` : ''}
      ${tcChList.length>5 ? `<div class="bgql-flt-row">
        <select class="bg-tl-dropdown" onchange="bgqlSetFilterDD('ma_ch', this.value)">
          <option value="">Mọi cửa hàng</option>
          ${tcChList.map(([k,v])=>`<option value="${escHtml(k)}"${bgqlSuVuFilter.ma_ch===k?' selected':''}>${escHtml(v)}</option>`).join('')}
        </select>
      </div>` : ''}
    `;
  }

  const itabSV = document.getElementById('bgql-itab-suvu-c');
  if (itabSV) {
    if (open.length > 0) { itabSV.style.display = ''; itabSV.textContent = open.length; }
    else itabSV.style.display = 'none';
  }
  const badge = document.getElementById('bgql-menu-badge');
  if (badge) {
    const urgentOpen = open.filter(s=>s.muc_do==='KHAN_CAP').length;
    if (urgentOpen > 0) { badge.style.display=''; badge.textContent = urgentOpen; }
    else badge.style.display = 'none';
  }
  const sub = document.getElementById('bgql-suvu-count');
  if (sub) {
    if (open.length > 0) { sub.style.display=''; sub.textContent = open.length; }
    else sub.style.display = 'none';
  }
}

window.bgqlSetFilterDD = function(key, value){
  if (key === 'muc_do') bgqlSuVuFilter.muc_do = value;
  else if (key === 'trang_thai') bgqlSuVuFilter.trang_thai = value;
  else if (key === 'khu_vuc') bgqlSuVuFilter.khu_vuc = value || 'all';
  else if (key === 'ma_ch') bgqlSuVuFilter.ma_ch = value || null;
  else if (key === 'range') {
    bgqlSuVuFilter.range = value;
    bgqlTienChiCache = null;
    if (value !== 'custom') bgqlLoadTienChi();
    else bgqlRenderSuVuFilters();  // Hiện datepicker
    return;
  }
  bgqlRenderSuVuFilters();
  if (bgqlInnerTab === 'suvu') bgqlRenderSuVuList();
  else bgqlRenderTienChiList();
};

// [v13.72] Ô tìm cửa hàng / khu vực + sắp xếp
function bgqlSvSearchLabel(){
  if (bgqlSuVuFilter.ma_ch) {
    const f = (bgqlSuVuCache||[]).find(s=>s.ma_ch===bgqlSuVuFilter.ma_ch);
    return f ? (f.ten_ch_snapshot||f.ma_ch) : bgqlSuVuFilter.ma_ch;
  }
  if (bgqlSuVuFilter.khu_vuc && bgqlSuVuFilter.khu_vuc!=='all') return 'Khu vực: ' + bgqlSuVuFilter.khu_vuc;
  return '';
}
// [v13.74] Autocomplete CH/KV — dropdown gợi ý (như chấm công)
window.bgqlSvSearchInput = function(kw){
  clearTimeout(bgqlSvSearchTimer);
  const dd = document.getElementById('bgql-sv-search-dd');
  if (!dd) return;
  if (!kw || kw.length < 1) { dd.style.display='none'; return; }
  bgqlSvSearchTimer = setTimeout(() => {
    const all = bgqlSuVuCache || [];
    const low = kw.toLowerCase();
    const kvs = [...new Set(all.map(s=>s.khu_vuc).filter(k=>k && k.toLowerCase().includes(low)))].slice(0,3);
    const chMap = new Map();
    all.forEach(s => { if (s.ma_ch && !chMap.has(s.ma_ch)) {
      const ten = s.ten_ch_snapshot||s.ma_ch;
      if (ten.toLowerCase().includes(low) || s.ma_ch.toLowerCase().includes(low)) chMap.set(s.ma_ch, ten);
    }});
    const chs = [...chMap.entries()].slice(0,6);
    let html = '';
    if (kvs.length) html += '<div class="bgql-stats-dd-l">Khu vực</div>' + kvs.map(k=>`<div class="bgql-stats-dd-it" onclick="bgqlSvPickKV('${escHtml(k)}')">${escHtml(k)}</div>`).join('');
    if (chs.length) html += '<div class="bgql-stats-dd-l">Cửa hàng</div>' + chs.map(([m,t])=>`<div class="bgql-stats-dd-it" onclick="bgqlSvPickCH('${escHtml(m)}','${escHtml(t)}')"><b>${escHtml(t)}</b> <small>${escHtml(m)}</small></div>`).join('');
    if (!html) html = '<div class="bgql-stats-dd-empty">Không tìm thấy</div>';
    dd.innerHTML = html; dd.style.display = '';
  }, 180);
};
window.bgqlSvPickKV = function(kv){
  bgqlSuVuFilter.khu_vuc = kv; bgqlSuVuFilter.ma_ch = null;
  const dd = document.getElementById('bgql-sv-search-dd'); if (dd) dd.style.display='none';
  bgqlRenderSuVuFilters(); bgqlRenderSuVuList();
};
window.bgqlSvPickCH = function(ma, ten){
  bgqlSuVuFilter.ma_ch = ma; bgqlSuVuFilter.khu_vuc = 'all';
  const dd = document.getElementById('bgql-sv-search-dd'); if (dd) dd.style.display='none';
  bgqlRenderSuVuFilters(); bgqlRenderSuVuList();
};
window.bgqlSvSearchClear = function(){
  bgqlSuVuFilter.ma_ch = null; bgqlSuVuFilter.khu_vuc = 'all';
  bgqlRenderSuVuFilters(); bgqlRenderSuVuList();
};
// [v13.74] Lọc thời gian sự vụ (client, theo created_at)
window.bgqlSetSvTime = function(v){
  bgqlSvTimeRange = v || 'all';
  if (v === 'custom' && (!bgqlSvCustomFrom || !bgqlSvCustomTo)) { bgqlRenderSuVuFilters(); return; }
  bgqlRenderSuVuFilters(); bgqlRenderSuVuList();
};
window.bgqlSetSvCustomFrom = function(v){ bgqlSvCustomFrom = v; if (bgqlSvCustomTo) bgqlRenderSuVuList(); };
window.bgqlSetSvCustomTo = function(v){ bgqlSvCustomTo = v; if (bgqlSvCustomFrom) bgqlRenderSuVuList(); };
window.bgqlSetSort = function(v){ bgqlSuVuSort = v || 'muc_do'; bgqlRenderSuVuList(); };

// [v13.31] Datepicker custom cho Tiền chi
window.bgqlSetTcCustomFrom = function(v){ 
  bgqlSuVuFilter.customFrom = v; 
  if (bgqlSuVuFilter.customTo) bgqlLoadTienChi();
};
window.bgqlSetTcCustomTo = function(v){ 
  bgqlSuVuFilter.customTo = v; 
  if (bgqlSuVuFilter.customFrom) bgqlLoadTienChi();
};

window.bgqlSwitchInnerTab = function(t){
  bgqlInnerTab = t;
  document.getElementById('bgql-itab-suvu').classList.toggle('active', t==='suvu');
  document.getElementById('bgql-itab-tienchi').classList.toggle('active', t==='tienchi');
  document.getElementById('bgql-inner-suvu').style.display = t==='suvu' ? '' : 'none';
  document.getElementById('bgql-inner-tienchi').style.display = t==='tienchi' ? '' : 'none';
  bgqlRenderSuVuFilters();
  if (t === 'suvu') bgqlRenderSuVuList();
  else {
    if (bgqlTienChiCache === null) bgqlLoadTienChi();
    else bgqlRenderTienChiList();
  }
};

// Legacy compat (cho code khác có thể gọi)
window.bgqlSetFilter = function(k, v){
  if (k === 'reset') bgqlSuVuFilter = { trang_thai:'all', muc_do:'all', khu_vuc:'all', ma_ch:null, nhom:[], muc_con:[], range:'7d' };
  else if (k === 'trang_thai') bgqlSuVuFilter.trang_thai = bgqlSuVuFilter.trang_thai === v ? 'all' : v;
  else if (k === 'muc_do') bgqlSuVuFilter.muc_do = bgqlSuVuFilter.muc_do === v ? 'all' : v;
  else if (k === 'khu_vuc') bgqlSuVuFilter.khu_vuc = v || 'all';
  else if (k === 'ma_ch') bgqlSuVuFilter.ma_ch = v || null;
  bgqlRenderSuVuFilters();
  bgqlRenderSuVuList();
};


function bgqlGetFilteredSuVu(opts){
  opts = opts || {};
  // [v17.21] Ẩn sự vụ ĐÃ HỦY ở mọi tài khoản — không hiển thị nữa
  let arr = (bgqlSuVuCache || []).filter(s => s.trang_thai !== 'HUY');
  // [v13.78] Lọc theo 5 trạng thái rõ ràng
  const _tt = opts.skipStatus ? 'all' : bgqlSuVuFilter.trang_thai;
  if (_tt === 'moi_tao') arr = arr.filter(s => s.trang_thai === 'MOI_TAO');
  else if (_tt === 'tre') arr = arr.filter(bgqlLaTre);
  else if (_tt === 'sap_het_han') arr = arr.filter(bgqlSapHetHan);
  else if (_tt === 'dang_xu_ly') arr = arr.filter(s => ['DA_TIEP_NHAN','DANG_XU_LY','DA_PHAN_HOI','DA_XU_LY_XONG'].includes(s.trang_thai));
  else if (_tt === 'hoan_tat') arr = arr.filter(s => s.trang_thai === 'HOAN_TAT');
  else if (_tt === 'huy') arr = arr.filter(s => s.trang_thai === 'HUY');
  else if (_tt === 'open') arr = arr.filter(s => !['HOAN_TAT','HUY'].includes(s.trang_thai));
  else if (_tt === 'closed') arr = arr.filter(s => ['HOAN_TAT','HUY'].includes(s.trang_thai));
  // 'all' → không lọc trạng thái
  if (!opts.skipMucDo && bgqlSuVuFilter.muc_do !== 'all') arr = arr.filter(s => s.muc_do === bgqlSuVuFilter.muc_do);
  if (bgqlSuVuFilter.khu_vuc !== 'all') arr = arr.filter(s => s.khu_vuc === bgqlSuVuFilter.khu_vuc);
  if (bgqlSuVuFilter.ma_ch) arr = arr.filter(s => s.ma_ch === bgqlSuVuFilter.ma_ch);
  // [v13.74] Lọc thời gian theo created_at
  if (bgqlSvTimeRange !== 'all') {
    const now = new Date();
    let from = null, to = null;
    if (bgqlSvTimeRange === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (bgqlSvTimeRange === '7d') from = new Date(now.getTime() - 7*86400000);
    else if (bgqlSvTimeRange === '30d') from = new Date(now.getTime() - 30*86400000);
    else if (bgqlSvTimeRange === 'custom') {
      if (bgqlSvCustomFrom) from = new Date(bgqlSvCustomFrom + 'T00:00:00');
      if (bgqlSvCustomTo) to = new Date(bgqlSvCustomTo + 'T23:59:59');
    }
    if (from) arr = arr.filter(s => new Date(s.created_at) >= from);
    if (to) arr = arr.filter(s => new Date(s.created_at) <= to);
  }
  arr = arr.filter(bgqlSvMatchNhom);
  return arr;
}
function bgqlRenderSuVuList(){
  const list = document.getElementById('bgql-suvu-list');
  let arr = bgqlGetFilteredSuVu();

  // Sort theo lựa chọn: muc_do (mặc định) | cua_hang | thoi_gian
  arr = arr.slice().sort((a,b) => {
    if (bgqlSuVuSort === 'cua_hang') {
      const c = (a.ten_ch_snapshot||a.ma_ch||'').localeCompare(b.ten_ch_snapshot||b.ma_ch||'', 'vi');
      if (c !== 0) return c;
      return new Date(b.created_at) - new Date(a.created_at);
    }
    if (bgqlSuVuSort === 'thoi_gian') {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    const mdOrder = { KHAN_CAP:0, QUAN_TRONG:1, CAN_THIET:2 };
    const da = mdOrder[a.muc_do] || 9, db = mdOrder[b.muc_do] || 9;
    if (da !== db) return da - db;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  if (arr.length === 0){
    list.innerHTML = '<div class="ns-empty">Không có sự vụ phù hợp.</div>';
    return;
  }
  list.innerHTML = arr.map(bgqlSuVuCardHtml).join('');
  bgqlStartSvTimer();
}

// [v16.74] Đồng hồ đếm ngược deadline — chạy realtime cho mọi sự vụ đang mở
function _bgqlFmtConLai(ms){
  const tot = Math.floor(Math.abs(ms)/1000);
  const d = Math.floor(tot/86400);
  const h = Math.floor((tot%86400)/3600);
  const m = Math.floor((tot%3600)/60);
  const sec = tot%60;
  const p2 = n => String(n).padStart(2,'0');
  return (d>0 ? d+' ngày ' : '') + p2(h)+'g '+p2(m)+'p '+p2(sec)+'s';
}
function bgqlTickSvCountdowns(){
  const now = Date.now();
  const els = document.querySelectorAll('.bgql-dl-count');
  if (!els.length){ bgqlStopSvTimer(); return; }
  els.forEach(el=>{
    const dl = el.getAttribute('data-deadline'); if (!dl) return;
    const diff = new Date(dl).getTime() - now;
    const box = el.closest('.bgql-deadline');
    if (diff <= 0){
      el.textContent = ' · QUÁ HẠN ' + _bgqlFmtConLai(diff);
      if (box){ box.classList.add('past'); }
    } else {
      el.textContent = ' · còn ' + _bgqlFmtConLai(diff);
      if (box){ box.classList.toggle('soon', diff < 2*3600*1000); }
    }
  });
}
let _bgqlSvTimer = null;
function bgqlStartSvTimer(){ bgqlStopSvTimer(); bgqlTickSvCountdowns(); _bgqlSvTimer = setInterval(bgqlTickSvCountdowns, 1000); }
function bgqlStopSvTimer(){ if (_bgqlSvTimer){ clearInterval(_bgqlSvTimer); _bgqlSvTimer = null; } }

// [v13.73] Badge "tuổi" sự vụ — mở bao lâu / xử lý mất bao lâu
function bgqlSuVuAge(s){
  const created = new Date(s.created_at);
  if (s.trang_thai === 'HUY') return `<span class="bgql-age cancel">Đã hủy</span>`;
  if (s.trang_thai === 'HOAN_TAT') {
    const end = s.thoi_gian_dong ? new Date(s.thoi_gian_dong) : new Date();
    const days = Math.max(0, Math.round((end - created)/86400000));
    return `<span class="bgql-age done">Xử lý ${days===0?'trong ngày':days+' ngày'}</span>`;
  }
  const days = Math.floor((Date.now() - created)/86400000);
  const overdue = s.deadline_xu_ly && new Date(s.deadline_xu_ly) < new Date();
  const cls = (overdue || days>4) ? 'hot' : (days>=2 ? 'warm' : 'cool');
  return `<span class="bgql-age ${cls}">Mở ${days===0?'hôm nay':days+' ngày'}${overdue?' · quá hạn':''}</span>`;
}
// [v17.2] Đường tiến độ 4 mốc CÓ TÊN NGƯỜI (giống bảng cơ động)
function bgqlSuVuProgress(s){
  if (s.trang_thai === 'HUY') return '';
  const tt = s.trang_thai;
  const hoanTat = tt === 'HOAN_TAT';
  // Sự vụ tự động điều phối vào pool khu vực NGAY khi tạo → "Giao việc" luôn xong.
  // "Xử lý" chỉ xanh khi đã có người nhận / QL phản hồi; chưa thì hiện "Chờ nhận".
  const daXuLy = !!s.nguoi_xu_ly_ten || !!s.thoi_gian_phan_hoi || ['DA_TIEP_NHAN','DANG_XU_LY','DA_PHAN_HOI','DA_XU_LY_XONG','HOAN_TAT'].includes(tt);
  const xlName = s.nguoi_xu_ly_ten || (daXuLy ? (s.nguoi_phu_trach_ten || '—') : 'Chờ nhận');
  const htName = hoanTat ? (s.nguoi_dong_ten || s.nguoi_xu_ly_ten || '—') : '—';
  const steps = [
    { lbl:'Người tạo', name: s.nguoi_tao_ten || '—',                reached:true },
    { lbl:'Giao việc', name: s.nguoi_phu_trach_ten || 'Ban quản lý', reached:true },
    { lbl:'Xử lý',     name: xlName,                                 reached:daXuLy, active:daXuLy && !hoanTat },
    { lbl:'Hoàn tất',  name: htName,                                 reached:hoanTat }
  ];
  return `<div style="display:flex;margin-top:11px;border-top:1px solid #EEF2F6;padding-top:11px">
    ${steps.map((st,i)=>{
      const last = i===steps.length-1;
      const dotColor = st.reached ? (st.active ? '#D97706' : '#1D9E75') : '#CBD5E1';
      const leftLine = i===0 ? 'transparent' : (steps[i].reached ? '#1D9E75' : '#E2E8F0');
      const rightLine = last ? 'transparent' : (steps[i+1].reached ? '#1D9E75' : '#E2E8F0');
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0">
        <div style="display:flex;align-items:center;width:100%">
          <div style="flex:1;height:2px;background:${leftLine}"></div>
          <div style="width:10px;height:10px;border-radius:50%;background:${dotColor};flex:none"></div>
          <div style="flex:1;height:2px;background:${rightLine}"></div>
        </div>
        <div style="font-size:11px;font-weight:600;color:${st.reached?'#0F2E45':'#94A3B8'};margin-top:5px">${st.lbl}</div>
        <div style="font-size:10.5px;color:#475569;line-height:1.3;margin-top:3px;word-break:break-word">${escHtml(st.name)}</div>
      </div>`;
    }).join('')}
  </div>`;
}
function bgqlSuVuCardHtml(s){
  const mdLbl = { KHAN_CAP:'Khẩn cấp', QUAN_TRONG:'Quan trọng', CAN_THIET:'Cần thiết' }[s.muc_do]||s.muc_do;
  // [v13.34] Bỏ icon ⚠️ 🔴 📋 — chỉ dùng màu nền + chữ
  // Tag trạng thái: CHỈ hiển thị các status "kết thúc/cần action", bỏ DA_PHAN_HOI/DA_TIEP_NHAN/DANG_XU_LY
  const stLbl = { MOI_TAO:'Mới tạo', HOAN_TAT:'Hoàn tất', HUY:'Đã hủy' }[s.trang_thai] || '';
  const isOpen = !['HOAN_TAT','HUY'].includes(s.trang_thai);
  const accent = s.muc_do==='KHAN_CAP'?'#DC2626':s.muc_do==='QUAN_TRONG'?'#D97706':'#1B4965';
  
  // [v13.35] Workflow mới — bỏ Tiếp nhận + Bắt đầu xử lý
  // MOI_TAO        → "Phản hồi & xử lý" + "Hủy"
  // DANG_XU_LY     → "Cập nhật phản hồi" + "Đóng (hoàn tất)"
  // (DA_TIEP_NHAN, DA_PHAN_HOI: legacy data, đối xử như DANG_XU_LY)
  let actions = '';
  const isProcessing = ['DA_TIEP_NHAN','DANG_XU_LY','DA_PHAN_HOI','DA_XU_LY_XONG'].includes(s.trang_thai);
  if (s.trang_thai === 'MOI_TAO') {
    actions = `<button class="bgql-act bgql-act-secondary" onclick="event.stopPropagation();bgqlOpenPhanHoi('${s.id}')">Phản hồi & xử lý</button>
               <button class="bgql-act bgql-act-ghost" onclick="event.stopPropagation();bgqlHuy('${s.id}')">Hủy</button>`;
  } else if (isProcessing) {
    actions = `<button class="bgql-act bgql-act-secondary" onclick="event.stopPropagation();bgqlOpenPhanHoi('${s.id}')">Cập nhật phản hồi</button>
               <button class="bgql-act bgql-act-ghost" onclick="event.stopPropagation();bgqlOpenPhanHoi('${s.id}','xl')">Đổi người</button>
               <button class="bgql-act bgql-act-ghost" onclick="event.stopPropagation();bgqlOpenPhanHoi('${s.id}','deadline')">Gia hạn</button>
               <button class="bgql-act bgql-act-success" onclick="event.stopPropagation();bgqlHoanTat('${s.id}')">Đóng (hoàn tất)</button>`;
  }

  let deadline = '';
  if (s.deadline_xu_ly) {
    const dt = new Date(s.deadline_xu_ly);
    const now = new Date();
    const past = dt < now && isOpen;
    const showCount = isOpen && !['DA_XU_LY_XONG'].includes(s.trang_thai);
    deadline = `<div class="bgql-deadline${past?' past':''}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Hạn: ${pad(dt.getDate())}/${pad(dt.getMonth()+1)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}
      ${showCount ? `<span class="bgql-dl-count" data-deadline="${escHtml(s.deadline_xu_ly)}">—</span>`
                  : (past?'<span style="color:#DC2626;font-weight:800;margin-left:4px">QUÁ HẠN</span>':'')}
    </div>`;
  }

  // [v13.36] Checkbox multi-select cho ADMIN
  const isAdmin = (typeof SESSION !== 'undefined' && SESSION && SESSION.vaiTro === 'ADMIN');
  const checkbox = isAdmin && bgqlMultiSelectMode ? 
    `<input type="checkbox" class="bgql-card-cbx" 
      ${bgqlSelectedIds.has(s.id)?'checked':''}
      onclick="event.stopPropagation(); bgqlToggleSelect('${s.id}')">` : '';

  return `<div class="bgql-card ${bgqlSelectedIds.has(s.id)?'bgql-card-selected':''}" style="border-left:4px solid ${accent}" onclick="if(!event.target.closest('.bgql-act,.bgql-card-actions,.bgql-card-cbx,a,button,input,textarea,select')){ if(bgqlMultiSelectMode){bgqlToggleSelect('${s.id}')} else {bgqlOpenSuVuDetail('${s.id}')} }">
    ${checkbox}
    <div class="bgql-card-head">
      <span class="bgql-md-tag bgql-md-${s.muc_do||'CAN_THIET'}">${mdLbl}</span>
      ${bgqlLaTre(s)?`<span class="bgql-tre-tag">Trễ</span>`:''}
      ${stLbl?`<span class="bgql-st-tag ${isOpen?'open':'closed'}">${stLbl}</span>`:''}
      ${bgqlSuVuAge(s)}
    </div>
    <div class="bgql-card-title">${escHtml(s.tieu_de)}</div>
    <div class="bgql-card-meta"><b>${escHtml(s.ten_ch_snapshot||s.ma_ch||'?')}</b> · ${bgqlFmtTimeShort(s.created_at)}${s.ma_sv?` · <span style="color:#94A3B8">#${escHtml(s.ma_sv)}</span>`:''}</div>
    ${s.mo_ta?`<div class="bgql-card-desc"><span>Chi tiết:</span> ${escHtml((s.mo_ta||'').replace(/\s+/g,' ').trim().slice(0,160))}${(s.mo_ta||'').trim().length>160?'…':''}</div>`:''}
    ${bgqlSuVuProgress(s)}
    ${s.phan_hoi_xu_ly?`<div class="bgql-reply">
      <div class="bgql-reply-l">Phản hồi · ${escHtml(s.nguoi_phu_trach_ten||'QL')}</div>
      <div class="bgql-reply-txt">${escHtml(s.phan_hoi_xu_ly).slice(0,300)}</div>
      ${deadline}
    </div>`:deadline}
    ${actions?`<div class="bgql-actions">${actions}</div>`:''}
  </div>`;
}

function bgqlFmtTimeShort(s){
  if (!s) return '';
  const d = new Date(s);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return pad(d.getHours())+':'+pad(d.getMinutes());
  return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes());
}

// ═════════════════════════════════════════════════════════════════════════
//  ACTIONS — Tiếp nhận, Bắt đầu, Hoàn tất, Hủy
// ═════════════════════════════════════════════════════════════════════════
window.bgqlTiepNhan = async function(id){
  if (!confirm('Tiếp nhận sự vụ này?')) return;
  try {
    const { data, error } = await supa.rpc('fn_su_vu_tiep_nhan', {
      p_id: id, p_ma_nv: SESSION.ma, p_ten_nv: SESSION.ten||SESSION.hoTen, p_vai_tro: SESSION.vaiTro
    });
    if (error || (data && data.ok === false)) throw new Error((data&&data.error)||error.message);
    showToast('✓ Đã tiếp nhận', 'ok');
    bgqlLoadSuVu();
  } catch(e){ showToast('⚠ '+e.message, 'warn'); }
};
window.bgqlBatDau = async function(id){
  try {
    const { data, error } = await supa.rpc('fn_su_vu_bat_dau_xu_ly', {
      p_id: id, p_ma_nv: SESSION.ma, p_ten_nv: SESSION.ten||SESSION.hoTen, p_vai_tro: SESSION.vaiTro
    });
    if (error || (data && data.ok === false)) throw new Error((data&&data.error)||error.message);
    showToast('✓ Bắt đầu xử lý', 'ok');
    bgqlLoadSuVu();
  } catch(e){ showToast('⚠ '+e.message, 'warn'); }
};
window.bgqlHoanTat = async function(id){
  const note = prompt('Ghi chú đóng sự vụ (tùy chọn):', '');
  if (note === null) return;
  try {
    const { data, error } = await supa.rpc('fn_su_vu_dong', {
      p_id: id, p_ma_nv: SESSION.ma, p_ten_nv: SESSION.ten||SESSION.hoTen,
      p_vai_tro_dong: 'QUAN_LY', p_ghi_chu: note || null   // [v16.6] khớp constraint su_vu
    });
    if (error || (data && data.ok === false)) throw new Error((data&&data.error)||error.message);
    showToast('✓ Đã đóng sự vụ', 'ok');
    bgqlLoadSuVu();
  } catch(e){ showToast('⚠ '+e.message, 'warn'); }
};
window.bgqlHuy = async function(id){
  const reason = prompt('Lý do hủy:', '');
  if (!reason || !reason.trim()) return;
  try {
    const { data, error } = await supa.rpc('fn_su_vu_huy', {
      p_id: id, p_ma_nv: SESSION.ma, p_ten_nv: SESSION.ten||SESSION.hoTen,
      p_vai_tro: SESSION.vaiTro, p_ly_do: reason.trim()
    });
    if (error || (data && data.ok === false)) throw new Error((data&&data.error)||error.message);
    showToast('✓ Đã hủy', 'ok');
    bgqlLoadSuVu();
  } catch(e){ showToast('⚠ '+e.message, 'warn'); }
};

// ═════════════════════════════════════════════════════════════════════════
//  MODAL PHẢN HỒI — deadline BẮT BUỘC
// ═════════════════════════════════════════════════════════════════════════
window.bgqlOpenPhanHoi = function(id, focusField){
  const sv = (bgqlSuVuCache || []).find(s => s.id === id);
  if (!sv) return;
  // Default deadline: 24h kể từ giờ, làm tròn 30 phút
  const now = new Date();
  const def = new Date(now.getTime() + 24*60*60*1000);
  def.setMinutes(Math.ceil(def.getMinutes()/30)*30, 0, 0);
  const defStr = def.getFullYear()+'-'+pad(def.getMonth()+1)+'-'+pad(def.getDate())+'T'+pad(def.getHours())+':'+pad(def.getMinutes());

  // [v13.35] Người xử lý đã chọn trước đó (nếu có)
  const existingXL = sv.nguoi_xu_ly_ten || '';
  const existingXLData = sv.nguoi_xu_ly_ma ? JSON.stringify({
    ma: sv.nguoi_xu_ly_ma, ten: sv.nguoi_xu_ly_ten,
    loai: sv.nguoi_xu_ly_loai, ch_or_role: sv.nguoi_xu_ly_ch||''
  }) : '';

  const m = document.createElement('div');
  m.className = 'bgql-modal-bg';
  m.innerHTML = `
    <div class="bgql-modal">
      <div class="bgql-modal-head">
        <div class="bgql-modal-ttl">Phản hồi & xử lý sự vụ</div>
        <button class="bgql-modal-x" onclick="this.closest('.bgql-modal-bg').remove()">✕</button>
      </div>
      <div class="bgql-modal-body">
        <div class="bgql-modal-sv">
          <div style="font-weight:700;color:#0F172A;margin-bottom:4px">${escHtml(sv.tieu_de)}</div>
          <div style="font-size:12px;color:#64748B">${escHtml(sv.ten_ch_snapshot||sv.ma_ch||'')} · ${escHtml(sv.nguoi_tao_ten||'')}${sv.ma_sv?` · <b style="color:#0F2E45">${escHtml(sv.ma_sv)}</b>`:''}</div>
        </div>

        <label class="bgql-modal-label">Nội dung phản hồi <span style="color:#DC2626">*</span></label>
        <textarea id="bgql-ph-noidung" class="bgql-modal-input" rows="4"
          placeholder="Hướng xử lý / lệnh điều phối / tài liệu kèm theo...">${escHtml(sv.phan_hoi_xu_ly||'')}</textarea>

        <label class="bgql-modal-label">Người trực tiếp xử lý</label>
        <div class="bgql-xl-wrap">
          <input type="text" id="bgql-ph-xl-search" class="bgql-modal-input bgql-xl-search"
            placeholder="Gõ mã hoặc tên (NV+QL)..." autocomplete="off"
            value="${escHtml(existingXL)}"
            oninput="bgqlSearchNguoiXuLy(this.value)" onfocus="bgqlSearchNguoiXuLy(this.value)">
          <input type="hidden" id="bgql-ph-xl-data" value='${existingXLData}'>
          <div class="bgql-xl-dropdown" id="bgql-xl-dropdown" style="display:none"></div>
          ${existingXL ? `<div class="bgql-xl-selected" id="bgql-xl-selected">
            <span><b>${escHtml(existingXL)}</b>${sv.nguoi_xu_ly_ch?` · ${escHtml(sv.nguoi_xu_ly_ch)}`:''} <small>(${sv.nguoi_xu_ly_loai||'NV'})</small></span>
            <button onclick="bgqlClearNguoiXuLy()" class="bgql-xl-clear">✕</button>
          </div>` : ''}
        </div>
        <div style="font-size:11px;color:#64748B;margin-top:4px;margin-bottom:14px">
          Người xử lý có thể là nhân viên cửa hàng hoặc quản lý đội cơ động.
        </div>

        <label class="bgql-modal-label">Deadline xử lý <span style="color:#DC2626">*</span></label>
        <input type="datetime-local" id="bgql-ph-deadline" class="bgql-modal-input bgql-modal-dl"
          value="${defStr}" step="900">
        <div style="font-size:11px;color:#64748B;margin-top:-4px;margin-bottom:14px">
          Toàn bộ NV của CH + tài khoản CH sẽ nhận thông báo kèm deadline này.
        </div>

        <div class="bgql-modal-act">
          <button class="bgql-act bgql-act-ghost" onclick="this.closest('.bgql-modal-bg').remove()">Hủy</button>
          <button class="bgql-act bgql-act-secondary" id="bgql-ph-submit" onclick="bgqlSubmitPhanHoi('${id}')">Gửi phản hồi</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  setTimeout(()=>{
    var _f = focusField==='xl' ? 'bgql-ph-xl-search' : focusField==='deadline' ? 'bgql-ph-deadline' : 'bgql-ph-noidung';
    var _el = document.getElementById(_f);
    if(_el){ try{ _el.focus(); }catch(_e){} if(_el.scrollIntoView) _el.scrollIntoView({block:'center'}); }
  }, 50);
};

// [v13.35] Autocomplete tìm người xử lý (NV + QL)
let bgqlXLSearchTimer = null;
window.bgqlSearchNguoiXuLy = function(keyword){
  clearTimeout(bgqlXLSearchTimer);
  const dd = document.getElementById('bgql-xl-dropdown');
  if (!dd) return;
  if (!keyword || keyword.length < 1) {
    dd.style.display = 'none';
    return;
  }
  bgqlXLSearchTimer = setTimeout(async () => {
    try {
      const { data, error } = await supa.rpc('fn_search_nguoi_xu_ly', { p_keyword: keyword, p_limit: 8 });
      if (error) throw error;
      const arr = Array.isArray(data) ? data : [];
      if (arr.length === 0) {
        dd.innerHTML = '<div class="bgql-xl-empty">Không tìm thấy</div>';
        dd.style.display = '';
        return;
      }
      dd.innerHTML = arr.map(it => `
        <div class="bgql-xl-item" onclick='bgqlSelectNguoiXuLy(${JSON.stringify(it).replace(/'/g,"&apos;")})'>
          <div class="bgql-xl-it-name">${escHtml(it.ten||'')} <span class="bgql-xl-it-tag">${it.loai==='QL'?'QL':'NV'}</span></div>
          <div class="bgql-xl-it-sub">${escHtml(it.ma||'')} · ${escHtml(it.ch_or_role||'')}</div>
        </div>
      `).join('');
      dd.style.display = '';
    } catch(e){
      dd.innerHTML = `<div class="bgql-xl-empty">Lỗi: ${escHtml(e.message||'')}</div>`;
      dd.style.display = '';
    }
  }, 250);
};

window.bgqlSelectNguoiXuLy = function(it){
  document.getElementById('bgql-ph-xl-search').value = it.ten;
  document.getElementById('bgql-ph-xl-data').value = JSON.stringify(it);
  document.getElementById('bgql-xl-dropdown').style.display = 'none';
  // Show selected box
  const wrap = document.querySelector('.bgql-xl-wrap');
  let sel = document.getElementById('bgql-xl-selected');
  if (!sel) {
    sel = document.createElement('div');
    sel.id = 'bgql-xl-selected';
    sel.className = 'bgql-xl-selected';
    wrap.appendChild(sel);
  }
  sel.innerHTML = `<span><b>${escHtml(it.ten)}</b>${it.ch_or_role?` · ${escHtml(it.ch_or_role)}`:''} <small>(${it.loai})</small></span>
    <button onclick="bgqlClearNguoiXuLy()" class="bgql-xl-clear">✕</button>`;
};

window.bgqlClearNguoiXuLy = function(){
  document.getElementById('bgql-ph-xl-search').value = '';
  document.getElementById('bgql-ph-xl-data').value = '';
  const sel = document.getElementById('bgql-xl-selected');
  if (sel) sel.remove();
};

window.bgqlSubmitPhanHoi = async function(id){
  const noidung = document.getElementById('bgql-ph-noidung').value.trim();
  const dlStr = document.getElementById('bgql-ph-deadline').value;
  if (!noidung) { showToast('Nội dung phản hồi không được trống', 'warn'); return; }
  if (!dlStr) { showToast('Deadline xử lý là bắt buộc', 'warn'); return; }
  const dl = new Date(dlStr);
  if (isNaN(dl.getTime()) || dl < new Date()) { showToast('Deadline phải sau thời điểm hiện tại', 'warn'); return; }

  // [v13.35] Người xử lý (optional)
  let xl = null;
  try { 
    const xlRaw = document.getElementById('bgql-ph-xl-data').value;
    if (xlRaw) xl = JSON.parse(xlRaw);
  } catch(e){}

  const btn = document.getElementById('bgql-ph-submit');
  btn.disabled = true; btn.textContent = 'Đang gửi...';
  try {
    const { data, error } = await supa.rpc('fn_su_vu_phan_hoi', {
      p_id: id,
      p_ma_nv: SESSION.ma, p_ten_nv: SESSION.ten||SESSION.hoTen||'', p_vai_tro: SESSION.vaiTro||'',
      p_noi_dung: noidung,
      p_deadline_xu_ly: dl.toISOString(),
      p_anh_urls: null,
      p_nguoi_xu_ly_ma: xl ? xl.ma : null,
      p_nguoi_xu_ly_ten: xl ? xl.ten : null,
      p_nguoi_xu_ly_loai: xl ? xl.loai : null,
      p_nguoi_xu_ly_ch: xl ? (xl.ch_or_role || '') : null
    });
    if (error || (data && data.ok === false)) throw new Error((data&&data.error)||error.message);
    showToast('✓ Đã gửi phản hồi · CH+NV sẽ nhận thông báo', 'ok');
    document.querySelector('.bgql-modal-bg').remove();
    bgqlLoadSuVu();
  } catch(e){
    btn.disabled = false; btn.textContent = 'Gửi phản hồi';
    showToast('⚠ '+e.message, 'warn');
  }
};

// ═════════════════════════════════════════════════════════════════════════
//  TAB 2: TIMELINE QL (cross-CH)
// ═════════════════════════════════════════════════════════════════════════
async function bgqlLoadTimeline(){
  const list = document.getElementById('bgql-timeline-list');
  list.innerHTML = bgqlRenderTimelineHeader() + '<div class="ns-empty">⏳ Đang tải...</div>';
  try {
    const { from, to } = bgqlTimelineGetRange();
    const { data, error } = await supa.rpc('fn_ban_giao_timeline_ql', {
      p_tu_ngay: from, p_den_ngay: to,
      p_ma_ch: null,
      p_khu_vuc: null,
      p_limit: 100000
    });
    if (error) throw error;
    bgqlTimelineCache = Array.isArray(data) ? data : [];
    // [v13.38] Merge trạng thái xác nhận (batch, không đụng RPC cũ)
    try {
      const ids = bgqlTimelineCache.map(b => b.id).filter(Boolean);
      if (ids.length > 0) {
        const { data: xns } = await supa.rpc('fn_bg_xac_nhan_status', { p_ids: ids });
        const xnMap = {};
        (xns||[]).forEach(x => { xnMap[x.id] = x; });
        bgqlTimelineCache.forEach(b => {
          const x = xnMap[b.id];
          if (x) { b._xn = x.trang_thai === 'DA_XAC_NHAN'; b._xn_ten = x.nguoi_xac_nhan_ten; }
        });
      }
    } catch(e){ /* non-blocking */ }
    bgqlRenderTimeline();
  } catch(e){
    list.innerHTML = bgqlRenderTimelineHeader() + 
      `<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`;
  }
}

// [v13.32] Refactor Timeline QL — 2 mode Đơn/Ảnh giống NV
let bgqlTLMode = 'don';      // 'don' | 'anh'
let bgqlTLRange = '7d';      // 'today' | '7d' | '30d' | 'custom'
let bgqlTLCustomFrom = null;
let bgqlTLCustomTo = null;
let bgqlTLCond = 'all';      // 'all' | 'binh_thuong' | 'co_su_vu' | 'KHAN_CAP'

function bgqlTimelineGetRange(){
  const today = new Date();
  const to = today.toISOString().slice(0,10);
  let from;
  if (bgqlTLRange === 'today') from = to;
  else if (bgqlTLRange === '7d') { const d = new Date(today); d.setDate(d.getDate()-7); from = d.toISOString().slice(0,10); }
  else if (bgqlTLRange === '30d') { const d = new Date(today); d.setDate(d.getDate()-30); from = d.toISOString().slice(0,10); }
  else if (bgqlTLRange === 'custom') {
    return { from: bgqlTLCustomFrom || to, to: bgqlTLCustomTo || to };
  }
  else from = to;
  return { from, to };
}

function bgqlRenderTimelineHeader(){
  const all = bgqlTimelineCache || [];
  const khuVucs = [...new Set(all.map(b => b.khu_vuc).filter(k=>k))].sort();
  const chList = [...new Map(all.map(b => [b.ma_ch, b.ten_ch_snapshot||b.ma_ch])).entries()];
  const tongDon = all.length;
  const tongAnh = all.reduce((s, b) => s + ((b.anh_urls && b.anh_urls.length) || 0), 0);
  
  return `
    <div class="bg-tl-mode-tabs">
      <button class="bg-tl-mode ${bgqlTLMode==='don'?'active':''}" onclick="bgqlSetTLMode('don')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Đơn <span class="bg-tl-mode-c">${tongDon}</span>
      </button>
      <button class="bg-tl-mode ${bgqlTLMode==='anh'?'active':''}" onclick="bgqlSetTLMode('anh')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Ảnh <span class="bg-tl-mode-c">${tongAnh}</span>
      </button>
    </div>
    <div class="bg-tl-filters-row">
      <select class="bg-tl-dropdown" onchange="bgqlSetTLRange(this.value)">
        <option value="today"${bgqlTLRange==='today'?' selected':''}>Hôm nay</option>
        <option value="7d"${bgqlTLRange==='7d'?' selected':''}>7 ngày qua</option>
        <option value="30d"${bgqlTLRange==='30d'?' selected':''}>30 ngày qua</option>
        <option value="custom"${bgqlTLRange==='custom'?' selected':''}>Tự chọn khoảng…</option>
      </select>
      <select class="bg-tl-dropdown" onchange="bgqlSetTLCond(this.value)">
        <option value="all"${bgqlTLCond==='all'?' selected':''}>Tình trạng: Tất cả</option>
        <option value="binh_thuong"${bgqlTLCond==='binh_thuong'?' selected':''}>Bình thường</option>
        <option value="co_su_vu"${bgqlTLCond==='co_su_vu'?' selected':''}>Có sự vụ</option>
        <option value="KHAN_CAP"${bgqlTLCond==='KHAN_CAP'?' selected':''}>Khẩn cấp</option>
      </select>
      <select class="bg-tl-dropdown" onchange="bgqlSetTLSort(this.value)">
        <option value="moi"${bgqlTLSort==='moi'?' selected':''}>Mới nhất</option>
        <option value="cu"${bgqlTLSort==='cu'?' selected':''}>Cũ nhất</option>
        <option value="suvu"${bgqlTLSort==='suvu'?' selected':''}>Nhiều sự vụ</option>
      </select>
    </div>
    ${bgqlTLRange === 'custom' ? `<div class="bg-tl-filters-row">
      <input type="date" class="bg-tl-dropdown" value="${bgqlTLCustomFrom||''}" onchange="bgqlSetTLCustomFrom(this.value)">
      <input type="date" class="bg-tl-dropdown" value="${bgqlTLCustomTo||''}" onchange="bgqlSetTLCustomTo(this.value)">
    </div>` : ''}
    ${khuVucs.length>1 || chList.length>5 ? `<div class="bg-tl-filters-row">
      ${khuVucs.length>1 ? `<select class="bg-tl-dropdown" onchange="bgqlSetTLKV(this.value)">
        <option value="">Mọi khu vực</option>
        ${khuVucs.map(k=>`<option value="${escHtml(k)}"${bgqlTimelineFilter.khu_vuc===k?' selected':''}>${escHtml(k)}</option>`).join('')}
      </select>` : ''}
      ${chList.length>5 ? `<select class="bg-tl-dropdown" onchange="bgqlSetTLCh(this.value)">
        <option value="">Mọi cửa hàng</option>
        ${chList.map(([k,v])=>`<option value="${escHtml(k)}"${bgqlTimelineFilter.ma_ch===k?' selected':''}>${escHtml(v)}</option>`).join('')}
      </select>` : ''}
    </div>` : ''}
  `;
}

window.bgqlSetTLMode = function(m){ bgqlTLMode = m; bgqlRenderTimeline(); };
window.bgqlSetTLCond = function(c){ bgqlTLCond = c; bgqlRenderTimeline(); };
window.bgqlSetTLSort = function(s){ bgqlTLSort = s || 'moi'; bgqlRenderTimeline(); };
window.bgqlSetTLRange = function(r){ 
  bgqlTLRange = r; 
  if (r !== 'custom') bgqlLoadTimeline();
  else bgqlRenderTimeline();
};
window.bgqlSetTLCustomFrom = function(v){ bgqlTLCustomFrom = v; if (bgqlTLCustomTo) bgqlLoadTimeline(); };
window.bgqlSetTLCustomTo = function(v){ bgqlTLCustomTo = v; if (bgqlTLCustomFrom) bgqlLoadTimeline(); };
window.bgqlSetTLKV = function(v){ bgqlTimelineFilter.khu_vuc = v || 'all'; bgqlRenderTimeline(); };
window.bgqlSetTLCh = function(v){ bgqlTimelineFilter.ma_ch = v || null; bgqlRenderTimeline(); };

function bgqlRenderTimeline(){
  const list = document.getElementById('bgql-timeline-list');
  if (!list) return;
  let arr = (bgqlTimelineCache || []).slice();

  // [v13.70] Lọc khu vực + cửa hàng phía client → dropdown luôn đầy đủ, không bị mất
  if (bgqlTimelineFilter.khu_vuc && bgqlTimelineFilter.khu_vuc !== 'all') arr = arr.filter(b => b.khu_vuc === bgqlTimelineFilter.khu_vuc);
  if (bgqlTimelineFilter.ma_ch) arr = arr.filter(b => b.ma_ch === bgqlTimelineFilter.ma_ch);

  // Apply cond filter
  if (bgqlTLCond === 'binh_thuong') arr = arr.filter(b => (b.so_su_vu||0) === 0);
  else if (bgqlTLCond === 'co_su_vu') arr = arr.filter(b => (b.so_su_vu||0) > 0);
  else if (bgqlTLCond === 'KHAN_CAP') arr = arr.filter(b => (b.so_su_vu_khan||0) > 0);
  
  const header = bgqlRenderTimelineHeader();
  let bodyHtml;
  if (arr.length === 0) {
    bodyHtml = '<div class="ns-empty">Không có biên bản phù hợp.</div>';
  } else if (bgqlTLMode === 'anh') {
    bodyHtml = bgqlRenderTLAnh(arr.filter(b => b.anh_urls && b.anh_urls.length));
  } else {
    bodyHtml = bgqlRenderTLDon(arr);
  }
  list.innerHTML = header + bodyHtml;
}

function bgqlRenderTLDon(arr){
  if (arr.length === 0) return '<div class="ns-empty">Không có biên bản.</div>';
  // Group by ngày
  const byDay = {};
  arr.forEach(b => {
    if (!byDay[b.ngay_ban_giao]) byDay[b.ngay_ban_giao] = [];
    byDay[b.ngay_ban_giao].push(b);
  });
  const days = Object.keys(byDay).sort((a,b)=>b.localeCompare(a));
  return days.map(d => `
    <div class="bg-tl-daysep">${bgqlFmtDayVN(d)} · ${byDay[d].length} biên bản</div>
    ${byDay[d].map(bgqlTLCardHtml).join('')}
  `).join('');
}

function bgqlTLCardHtml(b){
  const time = b.gio_ban_giao ? String(b.gio_ban_giao).slice(0,5) : '';
  const tien = bgFmtVN(b.tien_tong||0);
  const soAnh = b.so_anh || 0;
  const soSV = b.so_su_vu || 0;
  const soKhan = b.so_su_vu_khan || 0;
  const soKD = b.so_item_khong_dat || 0;
  const accent = soKhan > 0 ? '#DC2626' : soSV > 0 ? '#F97316' : '#10B981';
  
  let thumbsHtml = '';
  if (b.anh_urls && b.anh_urls.length > 0){
    const show = b.anh_urls.slice(0, 3);
    thumbsHtml = `<div class="bg-tl-thumbs">
      ${show.map(url => `<div class="bg-tl-thumb" onclick="event.stopPropagation(); bgViewImage('${escHtml(url)}')"><img src="${escHtml(url)}" loading="lazy"></div>`).join('')}
      ${b.anh_urls.length > 3 ? `<div class="bg-tl-thumb bg-tl-thumb-more">+${b.anh_urls.length-3}</div>` : ''}
    </div>`;
  }

  return `<div class="bg-tl-card" onclick="bgOpenBanGiaoDetail('${b.id}')" style="border-left:4px solid ${accent}">
    <div class="bg-tl-head">
      <div class="bg-tl-time">${time}</div>
      <div class="bg-tl-by">${escHtml(b.ten_ch_snapshot||b.ma_ch)} · ${escHtml(b.nguoi_ban_giao_ten||'?')}</div>
      ${b._xn?'<div class="bg-tl-tag xn-ok">Đã xác nhận</div>':'<div class="bg-tl-tag xn-cho">Chưa xác nhận</div>'}
      ${soKhan>0?`<div class="bg-tl-tag khan">${soKhan} khẩn cấp</div>`:''}
    </div>
    <div class="bg-tl-metrics">
      <div class="bg-tl-metric"><div class="bg-tl-metric-v">${tien}<span style="font-size:11px;font-weight:600;opacity:.7"> đ</span></div><div class="bg-tl-metric-l">Tổng tiền</div></div>
      <div class="bg-tl-metric"><div class="bg-tl-metric-v" style="${soKD>0?'color:#DC2626':''}">${soKD}</div><div class="bg-tl-metric-l">Không đạt</div></div>
      <div class="bg-tl-metric"><div class="bg-tl-metric-v" style="${soSV>0?'color:#F97316':''}">${soSV}</div><div class="bg-tl-metric-l">Sự vụ</div></div>
      <div class="bg-tl-metric"><div class="bg-tl-metric-v">${soAnh}</div><div class="bg-tl-metric-l">Ảnh</div></div>
    </div>
    ${thumbsHtml}
  </div>`;
}

function bgqlRenderTLAnh(arr){
  const items = [];
  arr.forEach(b => {
    if (!b.anh_urls) return;
    b.anh_urls.forEach(url => items.push({
      url, ban_giao_id: b.id, ngay: b.ngay_ban_giao,
      time: b.gio_ban_giao, by: b.nguoi_ban_giao_ten,
      ch: b.ten_ch_snapshot || b.ma_ch,
      khan: (b.so_su_vu_khan||0) > 0
    }));
  });
  if (items.length === 0) return '<div class="ns-empty">Không có ảnh phù hợp.</div>';
  const byDay = {};
  items.forEach(it => {
    if (!byDay[it.ngay]) byDay[it.ngay] = [];
    byDay[it.ngay].push(it);
  });
  const days = Object.keys(byDay).sort((a,b)=>b.localeCompare(a));
  return days.map(d => `
    <div class="bg-tl-daysep">${bgqlFmtDayVN(d)} · ${byDay[d].length} ảnh</div>
    <div class="bg-tl-anh-grid">
      ${byDay[d].map(it => `
        <div class="bg-tl-anh-cell${it.khan?' khan':''}" onclick="bgViewImage('${escHtml(it.url)}')">
          <img src="${escHtml(it.url)}" loading="lazy">
          <div class="bg-tl-anh-meta">${(it.time||'').slice(0,5)} · ${escHtml((it.ch||'').slice(0,18))}</div>
        </div>
      `).join('')}
    </div>
  `).join('');
}


// ═════════════════════════════════════════════════════════════════════════
//  [v13.30] TAB THỐNG KÊ — Interactive dashboard
//   - Bộ lọc đầy đủ: range ngày + khu vực + cửa hàng
//   - 3 cards compact 60% chiều cao, click → filter
//   - List CH với badge sự vụ
//   - Click CH → drawer chi tiết sự vụ
// ═════════════════════════════════════════════════════════════════════════
let bgqlStatsData = null;        // jsonb từ fn_bg_thong_ke_ch
let bgqlStatsKhuVuc = null;      // filter khu vực
let bgqlStatsMaCh = null;        // filter ma_ch
let bgqlStatsCardFilter = 'all'; // 'all' | 'da_gui' | 'chua_gui' | 'co_sv'
let bgqlStatsSort = 'suvu'; // [v13.75] suvu|khan|ten|khu_vuc
let bgqlStatsOpenedCh = null;    // ma_ch đang xem chi tiết sự vụ

// [v17.23] Ẩn sự vụ HỦY khỏi Thống kê cho KHỚP tab Sự vụ (hủy đã ẩn ở mọi nơi).
// su_vu_ds chứa đủ list → trừ hủy khỏi số đếm + lọc list + tính lại "có sự vụ".
function bgqlStatsStripHuy(data){
  if (!data || !Array.isArray(data.ds_ch)) return data;
  let coSV = 0;
  data.ds_ch.forEach(c => {
    if (Array.isArray(c.su_vu_ds) && c.su_vu_ds.length){
      const huy = c.su_vu_ds.filter(sv => sv.trang_thai === 'HUY');
      if (huy.length){
        const huyKhan = huy.filter(sv => sv.muc_do === 'KHAN_CAP').length;
        c.so_su_vu = Math.max(0, (c.so_su_vu||0) - huy.length);
        c.so_su_vu_khan = Math.max(0, (c.so_su_vu_khan||0) - huyKhan);
        c.su_vu_ds = c.su_vu_ds.filter(sv => sv.trang_thai !== 'HUY');
      }
    }
    if ((c.so_su_vu||0) > 0) coSV++;
  });
  if (data.tom_tat) data.tom_tat.co_su_vu = coSV;
  return data;
}

async function bgqlLoadStats(){
  const cont = document.getElementById('bgql-stats-content');
  if (!cont) return;
  cont.innerHTML = bgqlRenderStatsTopBar() + '<div class="ns-empty">⏳ Đang tính...</div>';
  try {
    const { from, to } = bgqlRangeToDates(bgqlStatsRange);
    const { data, error } = await supa.rpc('fn_bg_thong_ke_ch', {
      p_tu_ngay: from, p_den_ngay: to,
      p_khu_vuc: bgqlStatsKhuVuc, p_ma_ch: bgqlStatsMaCh
    });
    if (error) throw error;
    bgqlStatsData = bgqlStatsStripHuy(data || {});
    bgqlRenderStats();
  } catch(e){
    cont.innerHTML = bgqlRenderStatsTopBar() + 
      `<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`;
  }
}

function bgqlRangeToDates(r){
  const today = new Date();
  const to = today.toISOString().slice(0,10);
  let from;
  if (r === 'all') return { from: '2000-01-01', to };   // [v17.39] Mọi lúc
  if (r === 'today') from = to;
  else if (r === 'day') {
    // [v13.35] Chọn 1 ngày cố định
    const d = bgqlStatsDay || to;
    return { from: d, to: d };
  }
  else if (r === 'custom') {
    // [v13.35] Khoảng ngày tự chọn
    return { from: bgqlStatsCustomFrom || to, to: bgqlStatsCustomTo || to };
  }
  else if (r === 'week') { const d = new Date(today); d.setDate(d.getDate()-7); from = d.toISOString().slice(0,10); }
  else { const d = new Date(today); d.setDate(d.getDate()-30); from = d.toISOString().slice(0,10); }
  return { from, to };
}

function bgqlRenderStatsTopBar(){
  // Lấy khu_vuc + ma_ch distinct từ data hiện tại (nếu có)
  const ds = (bgqlStatsData && bgqlStatsData.ds_ch) || [];
  const khuVucs = [...new Set(ds.map(c => c.khu_vuc).filter(k=>k))].sort();
  // [v13.35] Gộp KV + CH thành 1 ô search autocomplete
  const searchVal = bgqlStatsSearchLabel || '';
  return `
    <div class="bgql-flt-row">
      <select class="bg-tl-dropdown" onchange="bgqlSetStatsRange(this.value)">
        <option value="all"${bgqlStatsRange==='all'?' selected':''}>Mọi lúc</option>
        <option value="today"${bgqlStatsRange==='today'?' selected':''}>Hôm nay</option>
        <option value="day"${bgqlStatsRange==='day'?' selected':''}>Chọn ngày</option>
        <option value="week"${bgqlStatsRange==='week'?' selected':''}>7 ngày qua</option>
        <option value="month"${bgqlStatsRange==='month'?' selected':''}>30 ngày qua</option>
        <option value="custom"${bgqlStatsRange==='custom'?' selected':''}>Khoảng ngày</option>
      </select>
      <div class="bgql-stats-search">
        <input type="text" class="bg-tl-dropdown bgql-stats-search-input" 
          placeholder="Tìm khu vực / cửa hàng..." 
          value="${escHtml(searchVal)}"
          oninput="bgqlStatsSearchInput(this.value)"
          onfocus="bgqlStatsSearchInput(this.value)">
        <div class="bgql-stats-search-dd" id="bgql-stats-search-dd" style="display:none"></div>
        ${(bgqlStatsKhuVuc || bgqlStatsMaCh) ? `<button class="bgql-stats-search-clear" onclick="bgqlStatsSearchClear()">✕</button>` : ''}
      </div>
    </div>
    <div class="bgql-flt-row">
      <button class="bgql-act bgql-act-ghost bgql-tool-btn" onclick="bgqlOpenHeatmap()">CH hay có vấn đề</button>
      <button class="bgql-act bgql-act-ghost bgql-tool-btn" onclick="bgqlExportThongKe()">Xuất Excel</button>
      ${(typeof SESSION!=='undefined' && SESSION && SESSION.vaiTro==='ADMIN') ? `<button class="bgql-act bgql-act-ghost bgql-tool-btn" onclick="bgqlOpenDigestConfig()">Cấu hình AI sáng</button>` : ''}
    </div>
    ${bgqlStatsRange === 'day' ? `<div class="bgql-flt-row">
      <input type="date" class="bg-tl-dropdown" value="${bgqlStatsDay||''}" onchange="bgqlSetStatsDay(this.value)">
    </div>` : ''}
    ${bgqlStatsRange === 'custom' ? `<div class="bgql-flt-row">
      <input type="date" class="bg-tl-dropdown" value="${bgqlStatsCustomFrom||''}" onchange="bgqlSetStatsCustomFrom(this.value)">
      <input type="date" class="bg-tl-dropdown" value="${bgqlStatsCustomTo||''}" onchange="bgqlSetStatsCustomTo(this.value)">
    </div>` : ''}
  `;
}

// [v13.35] State cho filter ngày mới + search gộp
let bgqlStatsDay = null;
let bgqlStatsCustomFrom = null;
let bgqlStatsCustomTo = null;
let bgqlStatsSearchLabel = '';

window.bgqlSetStatsRange = function(r){ 
  bgqlStatsRange = r; 
  if (r === 'day' && !bgqlStatsDay) { bgqlRenderStats(); return; }
  if (r === 'custom' && (!bgqlStatsCustomFrom || !bgqlStatsCustomTo)) { bgqlRenderStats(); return; }
  bgqlLoadStats(); 
};
window.bgqlSetStatsDay = function(v){ bgqlStatsDay = v; if (v) bgqlLoadStats(); };
window.bgqlSetStatsCustomFrom = function(v){ bgqlStatsCustomFrom = v; if (bgqlStatsCustomTo) bgqlLoadStats(); };
window.bgqlSetStatsCustomTo = function(v){ bgqlStatsCustomTo = v; if (bgqlStatsCustomFrom) bgqlLoadStats(); };
window.bgqlSetStatsKV = function(v){ bgqlStatsKhuVuc = v || null; bgqlLoadStats(); };
window.bgqlSetStatsCh = function(v){ bgqlStatsMaCh = v || null; bgqlLoadStats(); };

// Autocomplete tìm KV + CH gộp
let bgqlStatsSearchTimer = null;
window.bgqlStatsSearchInput = function(kw){
  bgqlStatsSearchLabel = kw;
  clearTimeout(bgqlStatsSearchTimer);
  const dd = document.getElementById('bgql-stats-search-dd');
  if (!dd) return;
  if (!kw || kw.length < 1) { dd.style.display = 'none'; return; }
  bgqlStatsSearchTimer = setTimeout(() => {
    const ds = (bgqlStatsData && bgqlStatsData.ds_ch) || [];
    const kvs = [...new Set(ds.map(c => c.khu_vuc).filter(k => k && k.toLowerCase().includes(kw.toLowerCase())))].slice(0,5);
    const chs = ds.filter(c => 
      (c.ten_ch||'').toLowerCase().includes(kw.toLowerCase()) ||
      (c.ma_ch||'').toLowerCase().includes(kw.toLowerCase())
    ).slice(0, 8);
    let html = '';
    if (kvs.length > 0) {
      html += '<div class="bgql-stats-dd-l">Khu vực</div>';
      html += kvs.map(k => `<div class="bgql-stats-dd-it" onclick="bgqlStatsPickKV('${escHtml(k)}')">${escHtml(k)}</div>`).join('');
    }
    if (chs.length > 0) {
      html += '<div class="bgql-stats-dd-l">Cửa hàng</div>';
      html += chs.map(c => `<div class="bgql-stats-dd-it" onclick="bgqlStatsPickCH('${escHtml(c.ma_ch)}','${escHtml(c.ten_ch||c.ma_ch)}')">
        <b>${escHtml(c.ten_ch||c.ma_ch)}</b> <small>${escHtml(c.ma_ch)}</small></div>`).join('');
    }
    if (!html) html = '<div class="bgql-stats-dd-empty">Không tìm thấy</div>';
    dd.innerHTML = html;
    dd.style.display = '';
  }, 200);
};
window.bgqlStatsPickKV = function(kv){
  bgqlStatsKhuVuc = kv; bgqlStatsMaCh = null;
  bgqlStatsSearchLabel = 'Khu vực: ' + kv;
  document.getElementById('bgql-stats-search-dd').style.display = 'none';
  bgqlLoadStats();
};
window.bgqlStatsPickCH = function(ma, ten){
  bgqlStatsMaCh = ma; bgqlStatsKhuVuc = null;
  bgqlStatsSearchLabel = ten;
  document.getElementById('bgql-stats-search-dd').style.display = 'none';
  bgqlLoadStats();
};
window.bgqlStatsSearchClear = function(){
  bgqlStatsKhuVuc = null; bgqlStatsMaCh = null;
  bgqlStatsSearchLabel = '';
  bgqlLoadStats();
};
window.bgqlSetStatsCard = function(c){ 
  bgqlStatsCardFilter = bgqlStatsCardFilter === c ? 'all' : c;
  bgqlStatsOpenedCh = null;
  bgqlRenderStats();
};
window.bgqlOpenChDetail = function(ma_ch){
  bgqlStatsOpenedCh = bgqlStatsOpenedCh === ma_ch ? null : ma_ch;
  bgqlRenderStats();
};
window.bgqlSetStatsSort = function(s){ bgqlStatsSort = s || 'suvu'; bgqlRenderStats(); };

function bgqlRenderStats(){
  const cont = document.getElementById('bgql-stats-content');
  if (!cont || !bgqlStatsData) return;
  const tt = bgqlStatsData.tom_tat || {};
  const ds = bgqlStatsData.ds_ch || [];
  
  // Filter ds theo card đang chọn
  let dsFiltered = ds;
  if (bgqlStatsCardFilter === 'da_gui') dsFiltered = ds.filter(c => c.so_bg > 0);
  else if (bgqlStatsCardFilter === 'chua_gui') dsFiltered = ds.filter(c => c.so_bg === 0);
  else if (bgqlStatsCardFilter === 'co_sv') dsFiltered = ds.filter(c => c.so_su_vu > 0);

  // [v13.75] Sắp xếp danh sách cửa hàng
  const statsSortFn = {
    suvu: (a,b)=>(b.so_su_vu||0)-(a.so_su_vu||0),
    khan: (a,b)=>(b.so_su_vu_khan||0)-(a.so_su_vu_khan||0),
    ten: (a,b)=>(a.ten_ch||a.ma_ch||'').localeCompare(b.ten_ch||b.ma_ch||'','vi'),
    khu_vuc: (a,b)=>(a.khu_vuc||'').localeCompare(b.khu_vuc||'','vi'),
  }[bgqlStatsSort];
  if (statsSortFn) dsFiltered = dsFiltered.slice().sort(statsSortFn);

  cont.innerHTML = bgqlRenderStatsTopBar() + `
    <div class="bgql-stats-compact">
      <div class="bgql-stat-c ${bgqlStatsCardFilter==='da_gui'?'active':''} stat-ok" onclick="bgqlSetStatsCard('da_gui')">
        <div class="bgql-stat-c-v">${tt.da_gui||0}<span class="bgql-stat-c-vs">/${tt.tong_ch||0}</span></div>
        <div class="bgql-stat-c-l">Đã gửi</div>
      </div>
      <div class="bgql-stat-c ${bgqlStatsCardFilter==='chua_gui'?'active':''} stat-warn" onclick="bgqlSetStatsCard('chua_gui')">
        <div class="bgql-stat-c-v">${tt.chua_gui||0}</div>
        <div class="bgql-stat-c-l">Chưa gửi</div>
      </div>
      <div class="bgql-stat-c ${bgqlStatsCardFilter==='co_sv'?'active':''} stat-bad" onclick="bgqlSetStatsCard('co_sv')">
        <div class="bgql-stat-c-v">${tt.co_su_vu||0}</div>
        <div class="bgql-stat-c-l">Có sự vụ</div>
      </div>
    </div>
    <div class="bgql-flt-row" style="margin-top:10px">
      <select class="bg-tl-dropdown" onchange="bgqlSetStatsSort(this.value)">
        <option value="suvu"${bgqlStatsSort==='suvu'?' selected':''}>Sắp: Nhiều sự vụ</option>
        <option value="khan"${bgqlStatsSort==='khan'?' selected':''}>Sắp: Nhiều khẩn cấp</option>
        <option value="ten"${bgqlStatsSort==='ten'?' selected':''}>Sắp: Tên cửa hàng</option>
        <option value="khu_vuc"${bgqlStatsSort==='khu_vuc'?' selected':''}>Sắp: Khu vực</option>
      </select>
    </div>
    <div class="bgql-stats-chlist">
      ${dsFiltered.length === 0 
        ? '<div class="ns-empty">Không có cửa hàng phù hợp.</div>'
        : dsFiltered.map(c => bgqlChRowHtml(c, c.ma_ch === bgqlStatsOpenedCh)).join('')
      }
    </div>
  `;
}

function bgqlChRowHtml(c, opened){
  const isChuaGui = c.so_bg === 0;
  const isKhan = c.so_su_vu_khan > 0;
  const hasSV = c.so_su_vu > 0;
  
  let statusBadge;
  if (isChuaGui) {
    statusBadge = '<span class="bgql-ch-badge bgql-ch-badge-warn">Chưa gửi</span>';
  } else if (isKhan) {
    statusBadge = `<span class="bgql-ch-badge bgql-ch-badge-khan">${c.so_su_vu_khan} khẩn · ${c.so_su_vu} sự vụ</span>`;
  } else if (hasSV) {
    statusBadge = `<span class="bgql-ch-badge bgql-ch-badge-sv">${c.so_su_vu} sự vụ</span>`;
  } else {
    statusBadge = '<span class="bgql-ch-badge bgql-ch-badge-ok">Bình thường</span>';
  }
  
  return `
    <div class="bgql-ch-row${opened?' opened':''}" onclick="bgqlOpenChDetail('${c.ma_ch}')">
      <div class="bgql-ch-row-head">
        <div class="bgql-ch-row-info">
          <div class="bgql-ch-row-name">${escHtml(c.ten_ch||c.ma_ch)}</div>
          <div class="bgql-ch-row-meta">${escHtml(c.ma_ch)}${c.khu_vuc?' · '+escHtml(c.khu_vuc):''}</div>
        </div>
        ${statusBadge}
        ${hasSV ? `<svg class="bgql-ch-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>` : ''}
      </div>
      ${opened && hasSV ? `<div class="bgql-ch-row-detail">
        ${(c.su_vu_ds||[]).map(sv => bgqlSvDetailHtml(sv)).join('')}
      </div>` : ''}
    </div>
  `;
}

function bgqlSvDetailHtml(sv){
  const mdMap = { 'KHAN_CAP':'Khẩn cấp', 'QUAN_TRONG':'Quan trọng', 'CAN_THIET':'Cần thiết' };
  const stMap = { 'MOI_TAO':'Mới tạo', 'DA_TIEP_NHAN':'Đã tiếp nhận', 'DANG_XU_LY':'Đang xử lý', 'DA_PHAN_HOI':'Đã phản hồi', 'DA_XU_LY_XONG':'Chờ CH xác nhận', 'HOAN_TAT':'Hoàn tất', 'HUY':'Đã hủy' };
  const mdClass = sv.muc_do === 'KHAN_CAP' ? 'khan' : sv.muc_do === 'QUAN_TRONG' ? 'qt' : 'ct';
  const t = sv.created_at ? new Date(sv.created_at).toLocaleString('vi-VN', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
  return `
    <div class="bgql-sv-mini" onclick="event.stopPropagation(); bgqlOpenSuVuDetail('${sv.id}')" style="cursor:pointer">
      <div class="bgql-sv-mini-head">
        <span class="bgql-sv-mini-md ${mdClass}">${mdMap[sv.muc_do]||sv.muc_do}</span>
        <span class="bgql-sv-mini-st" data-st="${sv.trang_thai||''}">${stMap[sv.trang_thai]||sv.trang_thai}</span>
        <span class="bgql-sv-mini-time">${t}</span>
      </div>
      <div class="bgql-sv-mini-title">${escHtml(sv.tieu_de||'')}</div>
      ${sv.mo_ta ? `<div class="bgql-sv-mini-desc">${escHtml(sv.mo_ta)}</div>` : ''}
      ${sv.phan_hoi_xu_ly ? `<div class="bgql-sv-mini-reply"><b>QL phản hồi:</b> ${escHtml(sv.phan_hoi_xu_ly)}${sv.deadline_xu_ly?` · Deadline: ${new Date(sv.deadline_xu_ly).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:''}</div>` : ''}
    </div>
  `;
}

// Format VND (reuse từ NV view)
function bgFmtVN(n){ return (n||0).toLocaleString('vi-VN'); }

// [v13.33] Format ngày VN (FIX missing → ReferenceError ở Timeline + Tiền chi)
function bgqlFmtDayVN(dateStr){
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.floor((today - d) / 86400000);
  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) return `${diffDays} ngày trước`;
  const days = ['CN','T2','T3','T4','T5','T6','T7'];
  return `${days[d.getDay()]} · ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}


// ═════════════════════════════════════════════════════════════════════════
//  [v13.27] TAB IN ẤN — Gallery + Print biên bản giấy
//  Mỗi cửa hàng = 1 sheet 2 mặt (4 ảnh layout cố định)
//  Hoặc tùy chọn 1/2/4 ảnh per trang
// ═════════════════════════════════════════════════════════════════════════
let bgqlPrintCache = null;        // Map<ma_ch, {ten_ch, bg_list: [{id, ngay, time, by, anh_urls[]}]}>
let bgqlPrintRange = '7d';        // 'today' | '7d' | '30d' | 'custom'
let bgqlPrintCustomFrom = null;
let bgqlPrintCustomTo = null;
let bgqlPrintFilterKV = null;     // [v13.31] khu vực filter
let bgqlPrintFilterCH = null;     // [v13.31] CH filter
let bgqlPrintSelectedCH = new Set();  // CH đã tick chọn
let bgqlPrintLayout = '1';        // [v13.30] '1' default — 1 ảnh/trang, 2 mặt cố định
let bgqlPrintFilterSV = 'all';    // [v13.70] 'all' | 'co' | 'binh_thuong'
let bgqlPrintFilterTT = 'all';    // [v13.70] 'all' | 'MOI_TAO' | 'DANG_XU_LY' | 'HOAN_TAT'

async function bgqlLoadPrint(){
  const cont = document.getElementById('bgql-print-content');
  cont.innerHTML = bgqlRenderPrintHeader() + '<div class="ns-empty">⏳ Đang tải biên bản...</div>';
  
  try {
    // Tính range ngày
    const { from, to } = bgqlPrintGetRange();
    
    // Fetch tất cả biên bản trong range (cross-CH, dùng RPC timeline_ql)
    const { data, error } = await supa.rpc('fn_ban_giao_timeline_ql', {
      p_tu_ngay: from, p_den_ngay: to,
      p_ma_ch: null, p_khu_vuc: null, p_limit: 100000
    });
    if (error) throw error;
    
    // Group theo CH
    const byCH = {};
    (data || []).forEach(bg => {
      if (!byCH[bg.ma_ch]) byCH[bg.ma_ch] = { 
        ma_ch: bg.ma_ch, ten_ch: bg.ten_ch_snapshot, khu_vuc: bg.khu_vuc,
        bg_list: [], total_anh: 0, total_su_vu: 0, _sv_tt: new Set()
      };
      const urls = bg.anh_urls || [];
      byCH[bg.ma_ch].bg_list.push({
        id: bg.id,
        ngay: bg.ngay_ban_giao,
        time: bg.gio_ban_giao,
        by: bg.nguoi_ban_giao_ten,
        anh_urls: urls,
        so_su_vu: bg.so_su_vu||0,
        so_khan: bg.so_su_vu_khan||0
      });
      byCH[bg.ma_ch].total_anh += urls.length;
      byCH[bg.ma_ch].total_su_vu += (bg.so_su_vu||0);
    });
    
    bgqlPrintCache = byCH;
    // [v13.70] Lấy trạng thái sự vụ per CH (phục vụ bộ lọc "Trạng thái xử lý")
    try {
      const { data: svs } = await supa.rpc('fn_su_vu_list', { p_tu_ngay: from, p_den_ngay: to, p_limit: 100000 });
      (svs||[]).forEach(sv => {
        const c = byCH[sv.ma_ch];
        if (c && sv.trang_thai) c._sv_tt.add(sv.trang_thai);
      });
    } catch(e){ /* non-blocking */ }
    bgqlRenderPrintList();
  } catch(e){
    cont.innerHTML = bgqlRenderPrintHeader() + 
      `<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`;
  }
}

function bgqlPrintGetRange(){
  const today = new Date();
  const to = today.toISOString().slice(0,10);
  let from;
  if (bgqlPrintRange === 'today') from = to;
  else if (bgqlPrintRange === '7d') { const d = new Date(today); d.setDate(d.getDate()-7); from = d.toISOString().slice(0,10); }
  else if (bgqlPrintRange === '30d') { const d = new Date(today); d.setDate(d.getDate()-30); from = d.toISOString().slice(0,10); }
  else if (bgqlPrintRange === 'custom') {
    // [v13.31] Custom range
    return { 
      from: bgqlPrintCustomFrom || to, 
      to: bgqlPrintCustomTo || to 
    };
  }
  else { from = to; }
  return { from, to };
}

function bgqlRenderPrintHeader(){
  // Lấy khu_vuc + ma_ch distinct từ cache (nếu đã load)
  const cache = bgqlPrintCache || {};
  const allCh = Object.values(cache);
  const khuVucs = [...new Set(allCh.map(c => c.khu_vuc).filter(k=>k))].sort();
  const chList = allCh.map(c => [c.ma_ch, c.ten_ch||c.ma_ch])
    .sort((a,b) => a[1].localeCompare(b[1], 'vi'));
  
  return `
    <div class="bgql-print-bar">
      <div class="bgql-print-bar-left">
        <select class="bg-tl-dropdown" onchange="bgqlPrintSetRange(this.value)">
          <option value="today"${bgqlPrintRange==='today'?' selected':''}>Hôm nay</option>
          <option value="7d"${bgqlPrintRange==='7d'?' selected':''}>7 ngày qua</option>
          <option value="30d"${bgqlPrintRange==='30d'?' selected':''}>30 ngày qua</option>
          <option value="custom"${bgqlPrintRange==='custom'?' selected':''}>Tự chọn khoảng…</option>
        </select>
        <select class="bg-tl-dropdown" onchange="bgqlPrintSetLayout(this.value)">
          <option value="1"${bgqlPrintLayout==='1'?' selected':''}>1 ảnh / trang (mặc định)</option>
          <option value="2"${bgqlPrintLayout==='2'?' selected':''}>2 ảnh / trang</option>
          <option value="4"${bgqlPrintLayout==='4'?' selected':''}>4 ảnh / trang</option>
        </select>
      </div>
      <div class="bgql-print-bar-left" style="margin-top:8px">
        <select class="bg-tl-dropdown" onchange="bgqlPrintSetSV(this.value)">
          <option value="all"${bgqlPrintFilterSV==='all'?' selected':''}>Sự vụ: Tất cả</option>
          <option value="co"${bgqlPrintFilterSV==='co'?' selected':''}>Có sự vụ</option>
          <option value="binh_thuong"${bgqlPrintFilterSV==='binh_thuong'?' selected':''}>Bình thường</option>
        </select>
        <select class="bg-tl-dropdown" onchange="bgqlPrintSetTT(this.value)">
          <option value="all"${bgqlPrintFilterTT==='all'?' selected':''}>Trạng thái: Tất cả</option>
          <option value="MOI_TAO"${bgqlPrintFilterTT==='MOI_TAO'?' selected':''}>Chưa xử lý</option>
          <option value="DANG_XU_LY"${bgqlPrintFilterTT==='DANG_XU_LY'?' selected':''}>Đang xử lý</option>
          <option value="HOAN_TAT"${bgqlPrintFilterTT==='HOAN_TAT'?' selected':''}>Hoàn tất</option>
        </select>
      </div>
      ${bgqlPrintRange === 'custom' ? `
      <div class="bgql-print-bar-left" style="margin-top:8px">
        <input type="date" class="bg-tl-dropdown" value="${bgqlPrintCustomFrom||''}" onchange="bgqlPrintSetCustomFrom(this.value)" placeholder="Từ ngày">
        <input type="date" class="bg-tl-dropdown" value="${bgqlPrintCustomTo||''}" onchange="bgqlPrintSetCustomTo(this.value)" placeholder="Đến ngày">
      </div>` : ''}
      ${khuVucs.length>1 || chList.length>1 ? `
      <div class="bgql-print-bar-left" style="margin-top:8px">
        ${khuVucs.length>1 ? `<select class="bg-tl-dropdown" onchange="bgqlPrintSetKV(this.value)">
          <option value="">Mọi khu vực</option>
          ${khuVucs.map(k=>`<option value="${escHtml(k)}"${bgqlPrintFilterKV===k?' selected':''}>${escHtml(k)}</option>`).join('')}
        </select>` : ''}
        ${chList.length>1 ? `<select class="bg-tl-dropdown" onchange="bgqlPrintSetCH(this.value)">
          <option value="">Mọi cửa hàng</option>
          ${chList.map(([k,v])=>`<option value="${escHtml(k)}"${bgqlPrintFilterCH===k?' selected':''}>${escHtml(v)}</option>`).join('')}
        </select>` : ''}
      </div>` : ''}
      <div class="bgql-print-bar-right" style="margin-top:8px">
        <button class="bgql-act bgql-act-ghost" onclick="bgqlPrintToggleAll()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Chọn tất cả
        </button>
        <button class="bgql-act bgql-act-primary" id="bgql-print-btn" onclick="bgqlDoPrint()" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          In <span id="bgql-print-count" style="font-weight:800">0</span>
        </button>
      </div>
    </div>
  `;
}

window.bgqlPrintSetCustomFrom = function(v){ bgqlPrintCustomFrom = v; if (bgqlPrintCustomTo) bgqlLoadPrint(); };
window.bgqlPrintSetCustomTo = function(v){ bgqlPrintCustomTo = v; if (bgqlPrintCustomFrom) bgqlLoadPrint(); };
window.bgqlPrintSetKV = function(v){ 
  bgqlPrintFilterKV = v || null; 
  bgqlPrintSelectedCH.clear();
  bgqlRenderPrintList(); 
};
window.bgqlPrintSetCH = function(v){ 
  bgqlPrintFilterCH = v || null; 
  bgqlPrintSelectedCH.clear();
  bgqlRenderPrintList(); 
};
window.bgqlPrintSetSV = function(v){ bgqlPrintFilterSV = v || 'all'; bgqlPrintSelectedCH.clear(); bgqlRenderPrintList(); };
window.bgqlPrintSetTT = function(v){ bgqlPrintFilterTT = v || 'all'; bgqlPrintSelectedCH.clear(); bgqlRenderPrintList(); };

function bgqlRenderPrintList(){
  const cont = document.getElementById('bgql-print-content');
  const cache = bgqlPrintCache || {};
  // [v13.31] Apply filter KV + CH
  let arr = Object.values(cache);
  if (bgqlPrintFilterKV) arr = arr.filter(c => c.khu_vuc === bgqlPrintFilterKV);
  if (bgqlPrintFilterCH) arr = arr.filter(c => c.ma_ch === bgqlPrintFilterCH);
  // [v13.70] Lọc theo sự vụ + trạng thái xử lý
  if (bgqlPrintFilterSV === 'co') arr = arr.filter(c => (c.total_su_vu||0) > 0);
  else if (bgqlPrintFilterSV === 'binh_thuong') arr = arr.filter(c => (c.total_su_vu||0) === 0);
  if (bgqlPrintFilterTT !== 'all') arr = arr.filter(c => c._sv_tt && c._sv_tt.has(bgqlPrintFilterTT));
  
  if (arr.length === 0){
    cont.innerHTML = bgqlRenderPrintHeader() + 
      '<div class="ns-empty">Không có biên bản trong khoảng thời gian này.</div>';
    return;
  }
  
  // Sort by ten_ch
  arr.sort((a,b) => (a.ten_ch||'').localeCompare(b.ten_ch||'', 'vi'));
  
  cont.innerHTML = bgqlRenderPrintHeader() + `
    <div class="bgql-print-list">
      ${arr.map(ch => {
        const checked = bgqlPrintSelectedCH.has(ch.ma_ch);
        const previewImgs = [];
        ch.bg_list.forEach(bg => bg.anh_urls.forEach(u => previewImgs.push(u)));
        const showImgs = previewImgs.slice(0, 4);
        return `
          <div class="bgql-print-card${checked?' selected':''}" onclick="bgqlPrintToggleCH('${ch.ma_ch}')">
            <div class="bgql-print-card-check">
              <div class="bgql-print-checkbox${checked?' checked':''}">
                ${checked ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
              </div>
            </div>
            <div class="bgql-print-card-info">
              <div class="bgql-print-card-name">${escHtml(ch.ten_ch||ch.ma_ch)}</div>
              <div class="bgql-print-card-meta">${escHtml(ch.ma_ch)} · ${ch.bg_list.length} biên bản · ${ch.total_anh} ảnh</div>
            </div>
            <div class="bgql-print-card-thumbs">
              ${showImgs.map((u,i) => `<div class="bgql-print-thumb" onclick="event.stopPropagation(); bgqlPrintOpenGallery('${ch.ma_ch}', ${i})"><img src="${u}" loading="lazy"></div>`).join('')}
              ${previewImgs.length > 4 ? `<div class="bgql-print-thumb bgql-print-thumb-more" onclick="event.stopPropagation(); bgqlPrintOpenGallery('${ch.ma_ch}', 4)">+${previewImgs.length-4}</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  bgqlPrintUpdateBtnState();
}

window.bgqlPrintSetRange = function(r){
  bgqlPrintRange = r;
  bgqlPrintCache = null;
  bgqlPrintSelectedCH.clear();
  bgqlLoadPrint();
};

window.bgqlPrintSetLayout = function(l){
  bgqlPrintLayout = l;
};

window.bgqlPrintToggleCH = function(ma_ch){
  if (bgqlPrintSelectedCH.has(ma_ch)) bgqlPrintSelectedCH.delete(ma_ch);
  else bgqlPrintSelectedCH.add(ma_ch);
  bgqlRenderPrintList();
};

window.bgqlPrintToggleAll = function(){
  const cache = bgqlPrintCache || {};
  const allMaCh = Object.keys(cache);
  if (bgqlPrintSelectedCH.size === allMaCh.length){
    bgqlPrintSelectedCH.clear();
  } else {
    allMaCh.forEach(m => bgqlPrintSelectedCH.add(m));
  }
  bgqlRenderPrintList();
};

function bgqlPrintUpdateBtnState(){
  const btn = document.getElementById('bgql-print-btn');
  const cnt = document.getElementById('bgql-print-count');
  if (!btn || !cnt) return;
  // Đếm tổng ảnh
  let totalAnh = 0;
  const cache = bgqlPrintCache || {};
  bgqlPrintSelectedCH.forEach(m => {
    if (cache[m]) totalAnh += cache[m].total_anh;
  });
  cnt.textContent = totalAnh;
  btn.disabled = totalAnh === 0;
  btn.style.opacity = totalAnh === 0 ? '.5' : '1';
}

// ─── [v13.70] GALLERY ẢNH — xem ảnh CH, vuốt/bấm qua lại mượt như iPhone ──
window.bgqlPrintOpenGallery = function(ma_ch, startIdx){
  const cache = bgqlPrintCache || {};
  const ch = cache[ma_ch];
  if (!ch) return;
  const imgs = [];
  ch.bg_list.forEach(bg => (bg.anh_urls||[]).forEach(u => imgs.push(u)));
  if (imgs.length === 0) return;
  startIdx = Math.max(0, Math.min(startIdx||0, imgs.length-1));

  let ov = document.getElementById('bgql-gal-overlay');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'bgql-gal-overlay';
  ov.className = 'bgql-gal-overlay';
  ov.innerHTML = `
    <div class="bgql-gal-top">
      <div class="bgql-gal-title">${escHtml(ch.ten_ch||ch.ma_ch)}</div>
      <button class="bgql-gal-close" onclick="bgqlPrintCloseGallery()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="bgql-gal-scroll" id="bgql-gal-scroll">
      ${imgs.map(u => `<div class="bgql-gal-slide"><img src="${u}"></div>`).join('')}
    </div>
    <button class="bgql-gal-nav bgql-gal-prev" onclick="bgqlPrintGalNav(-1)" aria-label="Trước">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <button class="bgql-gal-nav bgql-gal-next" onclick="bgqlPrintGalNav(1)" aria-label="Sau">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
    <div class="bgql-gal-counter"><span id="bgql-gal-cur">${startIdx+1}</span> / ${imgs.length}</div>
  `;
  document.body.appendChild(ov);
  const scroll = document.getElementById('bgql-gal-scroll');
  requestAnimationFrame(() => { scroll.scrollLeft = startIdx * scroll.clientWidth; });
  scroll.addEventListener('scroll', () => {
    const idx = Math.round(scroll.scrollLeft / Math.max(1, scroll.clientWidth));
    const cur = document.getElementById('bgql-gal-cur');
    if (cur) cur.textContent = Math.min(idx+1, imgs.length);
  }, { passive: true });
  ov.addEventListener('click', (e) => { if (e.target === ov) bgqlPrintCloseGallery(); });
};
window.bgqlPrintGalNav = function(dir){
  const scroll = document.getElementById('bgql-gal-scroll');
  if (!scroll) return;
  const w = scroll.clientWidth;
  const idx = Math.round(scroll.scrollLeft / Math.max(1, w));
  scroll.scrollTo({ left: (idx + dir) * w, behavior: 'smooth' });
};
window.bgqlPrintCloseGallery = function(){
  const ov = document.getElementById('bgql-gal-overlay');
  if (ov) ov.remove();
};

// ─── DO PRINT — render print HTML letterhead + đợi ảnh load + window.print() ──
window.bgqlDoPrint = async function(){
  // [v13.37] HOÀN TOÀN ĐỔI PHƯƠNG ÁN — IFRAME ẨN CÁCH LY HOÀN TOÀN
  // Lý do: print body chính luôn lộ các page khác. Iframe = sandbox độc lập,
  // browser KHÔNG nhìn thấy app body → không thể tạo trang trắng.
  const cache = bgqlPrintCache || {};
  const layout = parseInt(bgqlPrintLayout, 10) || 1;
  
  const chList = Array.from(bgqlPrintSelectedCH)
    .map(m => cache[m])
    .filter(Boolean)
    .sort((a,b) => (a.ten_ch||'').localeCompare(b.ten_ch||'', 'vi'));
  
  if (chList.length === 0){ showToast('Vui lòng chọn ít nhất 1 cửa hàng', 'warn'); return; }
  
  // Build pages
  const pages = [];
  chList.forEach(ch => {
    const allImgs = [];
    ch.bg_list.forEach(bg => {
      (bg.anh_urls || []).forEach(url => allImgs.push({ url, bg }));
    });
    if (allImgs.length === 0) return;
    for (let i = 0; i < allImgs.length; i += layout) {
      const pageImgs = allImgs.slice(i, i + layout);
      pages.push({ 
        ch, imgs: pageImgs, 
        pageNum: Math.floor(i/layout) + 1, 
        totalPages: Math.ceil(allImgs.length/layout) 
      });
    }
  });
  
  if (pages.length === 0) { showToast('Không có ảnh để in', 'warn'); return; }
  
  const printDateStr = new Date().toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit', year:'numeric'});
  const esc = s => String(s||'').replace(/[<>&"\']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"\'":'&#39;'})[c]);
  
  // CSS inline đầy đủ cho iframe — không phụ thuộc CSS app
  const css = `
@page { size: A4; margin: 12mm 14mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif; }
.print-page { 
  page-break-after: always; page-break-inside: avoid;
  break-after: page; break-inside: avoid;
  width: 100%; height: 100vh;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.print-page:last-child { page-break-after: auto !important; break-after: auto !important; }
.print-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 6mm; margin-bottom: 6mm; border-bottom: 1.5pt solid #0F2E45; flex-shrink: 0; }
.print-header-l { flex: 1; }
.print-ch-name { font-size: 16pt; font-weight: 800; color: #0F2E45; line-height: 1.15; margin-bottom: 2mm; }
.print-ch-sub { font-size: 10pt; font-weight: 600; color: #475569; letter-spacing: .05em; text-transform: uppercase; }
.print-header-r { text-align: right; font-size: 9.5pt; color: #475569; font-weight: 600; line-height: 1.5; }
.print-header-r b { color: #0F2E45; font-weight: 800; }
.print-grid { flex: 1 1 auto; display: grid; gap: 6mm; min-height: 0; overflow: hidden; }
.print-layout-1 .print-grid { grid-template-columns: 1fr; grid-template-rows: 1fr; }
.print-layout-2 .print-grid { grid-template-columns: 1fr; grid-template-rows: repeat(2, 1fr); }
.print-layout-4 .print-grid { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); }
.print-cell { display: flex; flex-direction: column; background: #fff; border: 0.5pt solid #94A3B8; border-radius: 2pt; overflow: hidden; min-height: 0; page-break-inside: avoid; break-inside: avoid; }
.print-cell-img { flex: 1 1 auto; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 3mm; min-height: 0; }
.print-cell-img img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; }
.print-cell-meta { padding: 2.5mm 4mm; font-size: 8.5pt; color: #1E293B; background: #F1F5F9; border-top: 0.5pt solid #CBD5E1; flex-shrink: 0; font-weight: 500; }
.print-cell-meta b { color: #0F2E45; font-weight: 700; }
.print-footer { margin-top: 5mm; padding-top: 3mm; border-top: 0.5pt solid #CBD5E1; display: flex; justify-content: space-between; font-size: 8.5pt; color: #64748B; flex-shrink: 0; }
.print-footer b { color: #0F2E45; }
`;
  
  const bodyHtml = pages.map(p => `
<div class="print-page print-layout-${layout}">
  <div class="print-header">
    <div class="print-header-l">
      <div class="print-ch-name">${esc(p.ch.ten_ch||p.ch.ma_ch)}</div>
      <div class="print-ch-sub">${esc(p.ch.ma_ch)} · Biên bản bàn giao ca</div>
    </div>
    <div class="print-header-r">
      <div>Ngày in: <b>${printDateStr}</b></div>
      <div>Trang <b>${p.pageNum}/${p.totalPages}</b></div>
    </div>
  </div>
  <div class="print-grid">
    ${p.imgs.map(({url, bg}) => `
      <div class="print-cell">
        <div class="print-cell-img"><img src="${esc(url)}" crossorigin="anonymous"></div>
        <div class="print-cell-meta">
          <b>${esc(bg.by||'-')}</b> · Lúc ${(bg.time||'').slice(0,5)} ngày ${bg.ngay}${bg.so_su_vu>0?` · <b style="color:#9A3412">${bg.so_su_vu} sự vụ</b>`:''}
        </div>
      </div>
    `).join('')}
  </div>
  <div class="print-footer">
    <span>Nón Sơn · Hệ thống chấm công &amp; bàn giao</span>
    <span>Cửa hàng: <b>${esc(p.ch.ma_ch)}</b></span>
  </div>
</div>
`).join('');
  
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>In biên bản bàn giao · Nón Sơn</title><style>${css}</style></head><body>${bodyHtml}</body></html>`;
  
  // Xóa iframe cũ nếu có
  const old = document.getElementById('bgql-print-iframe');
  if (old) old.remove();
  
  showToast('⏳ Đang chuẩn bị bản in...', 'info');
  
  // Tạo iframe ẩn — sandbox HOÀN TOÀN tách biệt với app
  const iframe = document.createElement('iframe');
  iframe.id = 'bgql-print-iframe';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(iframe);
  
  // Write HTML vào iframe
  const idoc = iframe.contentDocument || iframe.contentWindow.document;
  idoc.open();
  idoc.write(html);
  idoc.close();
  
  // Đợi ảnh load TRONG IFRAME
  const imgs = idoc.querySelectorAll('img');
  await Promise.all(Array.from(imgs).map(img => {
    if (img.complete && img.naturalHeight > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, {once:true});
      img.addEventListener('error', resolve, {once:true});
      setTimeout(resolve, 5000);  // Safety 5s/ảnh
    });
  }));
  
  // Đợi 1 frame để layout settle
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  
  // Print iframe (KHÔNG print body chính)
  try {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  } catch(e) {
    console.error('Print error:', e);
    showToast('⚠ Lỗi mở dialog in: ' + e.message, 'warn');
  }
  
  // Cleanup sau 3s (đủ cho user thấy dialog + cancel/in xong)
  setTimeout(() => { 
    try { iframe.remove(); } catch(e){}
  }, 3000);
};


// ═════════════════════════════════════════════════════════════════════════
//  [v13.28] TIỀN CHI — inner tab thứ 2 trong tab "Sự vụ" QL
//  RPC fn_bg_tien_chi_list — cross-CH, WHERE tien_chi > 0
// ═════════════════════════════════════════════════════════════════════════
async function bgqlLoadTienChi(){
  const list = document.getElementById('bgql-tienchi-list');
  if (!list) return;
  list.innerHTML = '<div class="ns-empty">⏳ Đang tải tiền chi...</div>';
  try {
    // Derive range từ bgqlSuVuFilter.range
    const today = new Date();
    const toStr = today.toISOString().slice(0,10);
    let fromStr;
    if (bgqlSuVuFilter.range === 'today') fromStr = toStr;
    else if (bgqlSuVuFilter.range === '30d') {
      const d = new Date(today); d.setDate(d.getDate()-30);
      fromStr = d.toISOString().slice(0,10);
    } else if (bgqlSuVuFilter.range === 'custom') {
      // [v13.31] Custom range
      if (!bgqlSuVuFilter.customFrom || !bgqlSuVuFilter.customTo) {
        // Chưa chọn ngày → return empty
        bgqlTienChiCache = [];
        bgqlRenderSuVuFilters();
        bgqlRenderTienChiList();
        return;
      }
      fromStr = bgqlSuVuFilter.customFrom;
    } else {
      const d = new Date(today); d.setDate(d.getDate()-7);
      fromStr = d.toISOString().slice(0,10);
    }
    const denStr = bgqlSuVuFilter.range === 'custom' ? (bgqlSuVuFilter.customTo || toStr) : toStr;
    const { data, error } = await supa.rpc('fn_bg_tien_chi_list', {
      p_tu_ngay: fromStr,
      p_den_ngay: denStr,
      p_ma_ch: bgqlSuVuFilter.ma_ch || null,
      p_khu_vuc: (bgqlSuVuFilter.khu_vuc && bgqlSuVuFilter.khu_vuc !== 'all') ? bgqlSuVuFilter.khu_vuc : null,
      p_limit: 100000
    });
    if (error) throw error;
    bgqlTienChiCache = Array.isArray(data) ? data : [];
    bgqlRenderSuVuFilters();  // Refresh filters với cache mới
    bgqlRenderTienChiList();
  } catch(e){
    list.innerHTML = `<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`;
  }
}

function bgqlRenderTienChiList(){
  const list = document.getElementById('bgql-tienchi-list');
  if (!list) return;
  let arr = bgqlTienChiCache || [];
  // Client-side filter cho khu_vuc + ma_ch (RPC đã filter, đây là double-safe)
  if (bgqlSuVuFilter.khu_vuc && bgqlSuVuFilter.khu_vuc !== 'all') arr = arr.filter(t => t.khu_vuc === bgqlSuVuFilter.khu_vuc);
  if (bgqlSuVuFilter.ma_ch) arr = arr.filter(t => t.ma_ch === bgqlSuVuFilter.ma_ch);

  // Update badge inner tab Tiền chi
  const itabTC = document.getElementById('bgql-itab-tienchi-c');
  if (itabTC) {
    if (arr.length > 0) { itabTC.style.display = ''; itabTC.textContent = arr.length; }
    else itabTC.style.display = 'none';
  }

  if (arr.length === 0){
    list.innerHTML = '<div class="ns-empty">Không có khoản chi trong khoảng thời gian này.</div>';
    return;
  }
  // Tổng tiền chi
  const tongChi = arr.reduce((s, t) => s + (Number(t.tien_chi)||0), 0);

  const groupByDay = {};
  arr.forEach(t => {
    const d = t.ngay_ban_giao;
    if (!groupByDay[d]) groupByDay[d] = [];
    groupByDay[d].push(t);
  });
  const days = Object.keys(groupByDay).sort((a,b)=>b.localeCompare(a));

  list.innerHTML = `
    <div class="bgql-tc-summary">
      <div class="bgql-tc-summary-l">Tổng chi</div>
      <div class="bgql-tc-summary-v">${bgFmtVN(tongChi)}<span style="font-size:13px;font-weight:600;opacity:.7"> đ</span></div>
      <div class="bgql-tc-summary-s">${arr.length} khoản</div>
    </div>
    ${days.map(d => `
      <div class="bg-tl-daysep">${bgqlFmtDayVN(d)} · ${groupByDay[d].length} khoản</div>
      ${groupByDay[d].map(bgqlTienChiCardHtml).join('')}
    `).join('')}
  `;
}

function bgqlTienChiCardHtml(t){
  const time = t.gio_ban_giao ? String(t.gio_ban_giao).slice(0,5) : '';
  const tienChi = bgFmtVN(t.tien_chi || 0);
  const ghiChu = t.tien_chi_ghi_chu || '';
  return `
    <div class="bgql-tienchi-card" onclick="bgOpenBanGiaoDetail('${t.id}')">
      <div class="bgql-tc-head">
        <span class="bgql-tienchi-tag">CHI PHÍ</span>
        <div class="bgql-tc-ch">${escHtml(t.ten_ch_snapshot || t.ma_ch)}</div>
        <div class="bgql-tc-time">${time}</div>
      </div>
      <div class="bgql-tienchi-amount">
        ${tienChi}<span class="bgql-tc-amount-dvi">đ</span>
      </div>
      ${ghiChu ? `<div class="bgql-tc-note">${escHtml(ghiChu)}</div>` : '<div class="bgql-tc-note bgql-tc-note-empty">(không có ghi chú)</div>'}
      <div class="bgql-tc-foot">
        <span>${escHtml(t.nguoi_ban_giao_ten || '')}${t.nguoi_ban_giao_chuc_vu ? ' · ' + escHtml(t.nguoi_ban_giao_chuc_vu) : ''}</span>
        ${t.khu_vuc ? `<span class="bgql-tc-kv">${escHtml(t.khu_vuc)}</span>` : ''}
      </div>
    </div>
  `;
}


// ═════════════════════════════════════════════════════════════════════════
//  [v13.32] MODAL CHI TIẾT SỰ VỤ — universal drill-down
//   - Mở từ: Sự vụ list / Stats CH row sv-mini / Timeline (future)
//   - Hiển thị: header + timeline events + ảnh sự vụ + phản hồi + biên bản gốc
// ═════════════════════════════════════════════════════════════════════════
window.bgqlOpenSuVuDetail = async function(sv_id){
  const modal = document.getElementById('bgql-svd-modal');
  const body = document.getElementById('bgql-svd-body');
  if (!modal || !body) return;
  
  body.innerHTML = '<div class="ns-empty">⏳ Đang tải chi tiết...</div>';
  modal.style.display = '';
  document.body.style.overflow = 'hidden';
  
  try {
    const { data, error } = await supa.rpc('fn_su_vu_detail', { p_id: sv_id });
    if (error) throw error;
    if (!data || !data.ok) throw new Error((data && data.error) || 'Không tải được');
    bgqlRenderSuVuDetail(data);
  } catch(e){
    body.innerHTML = `<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`;
  }
};

window.bgqlCloseSuVuDetail = function(){
  const modal = document.getElementById('bgql-svd-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
};

function bgqlRenderSuVuDetail(d){
  const body = document.getElementById('bgql-svd-body');
  const sv = d.su_vu || {};
  const anhSv = d.anh_su_vu || [];
  const anhPh = d.anh_phan_hoi || [];
  const bg = d.bien_ban;
  const anhBg = d.anh_bien_ban || [];
  
  const mdMap = { 'KHAN_CAP':'Khẩn cấp', 'QUAN_TRONG':'Quan trọng', 'CAN_THIET':'Cần thiết' };
  const stMap = { 'MOI_TAO':'Mới tạo', 'DA_TIEP_NHAN':'Đã tiếp nhận', 'DANG_XU_LY':'Đang xử lý', 'DA_PHAN_HOI':'Đã phản hồi', 'DA_XU_LY_XONG':'Chờ CH xác nhận', 'HOAN_TAT':'Hoàn tất', 'HUY':'Đã hủy' };
  const loaiMap = {
    'TAI_SAN_KHONG_DAT':'Tài sản không đạt',
    'TIEN_LECH':'Tiền lệch',
    'HANG_HOA':'Hàng hóa',
    'KHAC':'Khác'
  };
  const mdClass = sv.muc_do === 'KHAN_CAP' ? 'khan' : sv.muc_do === 'QUAN_TRONG' ? 'qt' : 'ct';
  
  // Timeline events — [v13.35] Workflow mới
  const events = [];
  if (sv.created_at) events.push({ type:'created', time:sv.created_at, label:'Tạo sự vụ', by:sv.nguoi_tao_ten, role:sv.nguoi_tao_chuc_vu });
  if (sv.thoi_gian_phan_hoi) events.push({ 
    type:'reply', time:sv.thoi_gian_phan_hoi, 
    label: sv.nguoi_xu_ly_ten ? `Phản hồi & giao cho ${sv.nguoi_xu_ly_ten}` : 'Phản hồi & bắt đầu xử lý',
    by:sv.nguoi_phu_trach_ten 
  });
  if (sv.thoi_gian_dong) events.push({ type:'closed', time:sv.thoi_gian_dong, label:'Hoàn tất', by:sv.nguoi_dong_ten, role:sv.nguoi_dong_vai_tro });
  
  const fmtT = t => t ? new Date(t).toLocaleString('vi-VN', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
  const fmtD = t => t ? new Date(t).toLocaleDateString('vi-VN') : '';
  
  document.getElementById('bgql-svd-title').textContent = 'Chi tiết sự vụ';
  
  // [v13.33] Nút xóa chỉ hiển thị cho ADMIN
  const isAdmin = SESSION && SESSION.vaiTro === 'ADMIN';
  const deleteBtn = isAdmin ? `
    <button class="bgql-svd-del" onclick="bgqlDeleteSuVu('${sv.id}')" title="Xóa sự vụ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>
  ` : '';
  
  body.innerHTML = `
    <!-- HEADER -->
    <div class="bgql-svd-header">
      <div class="bgql-svd-header-row">
        <div class="bgql-svd-tags">
          <span class="bgql-sv-mini-md ${mdClass}">${mdMap[sv.muc_do]||sv.muc_do}</span>
          <span class="bgql-sv-mini-st" data-st="${sv.trang_thai||''}">${stMap[sv.trang_thai]||sv.trang_thai}</span>
          ${sv.ma_sv?`<span class="bgql-svd-masv">${escHtml(sv.ma_sv)}</span>`:''}
        </div>
        ${deleteBtn}
      </div>
      <div class="bgql-svd-tieude">${escHtml(sv.tieu_de||'(không có tiêu đề)')}</div>
      <div class="bgql-svd-ch">${escHtml(sv.ten_ch_snapshot || sv.ma_ch)} · ${escHtml(sv.ma_ch)}</div>
      ${sv.nguoi_xu_ly_ten ? `<div class="bgql-svd-xl">
        <span class="bgql-svd-xl-l">Người xử lý:</span>
        <b>${escHtml(sv.nguoi_xu_ly_ten)}</b>${sv.nguoi_xu_ly_ch?` · ${escHtml(sv.nguoi_xu_ly_ch)}`:''}
        ${sv.nguoi_xu_ly_loai?`<small>(${sv.nguoi_xu_ly_loai})</small>`:''}
      </div>` : ''}
    </div>

    <!-- TIMELINE EVENTS -->
    ${events.length > 0 ? `<div class="bgql-svd-section">
      <div class="bgql-svd-section-l">Diễn biến</div>
      <div class="bgql-svd-timeline">
        ${events.map((ev, i) => `
          <div class="bgql-svd-event bgql-svd-ev-${ev.type}">
            <div class="bgql-svd-ev-dot"></div>
            ${i < events.length - 1 ? '<div class="bgql-svd-ev-line"></div>' : ''}
            <div class="bgql-svd-ev-body">
              <div class="bgql-svd-ev-label">${ev.label}</div>
              <div class="bgql-svd-ev-time">${fmtT(ev.time)}${ev.by ? ` · ${escHtml(ev.by)}` : ''}${ev.role ? ` (${escHtml(ev.role)})` : ''}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- MÔ TẢ + SỐ LIỆU -->
    ${sv.mo_ta ? `<div class="bgql-svd-section">
      <div class="bgql-svd-section-l">Mô tả</div>
      <div class="bgql-svd-mota">${escHtml(sv.mo_ta)}</div>
    </div>` : ''}
    

    <!-- ẢNH SỰ VỤ -->
    ${anhSv.length > 0 ? `<div class="bgql-svd-section">
      <div class="bgql-svd-section-l">Ảnh đính kèm sự vụ · ${anhSv.length}</div>
      <div class="bgql-svd-gallery">
        ${anhSv.map(url => `<div class="bgql-svd-gal-cell" onclick="bgViewImage('${escHtml(url)}')"><img src="${escHtml(url)}" loading="lazy"></div>`).join('')}
      </div>
    </div>` : ''}

    <!-- PHẢN HỒI QL -->
    ${(sv.phan_hoi_xu_ly || anhPh.length > 0) ? `<div class="bgql-svd-section bgql-svd-reply">
      <div class="bgql-svd-section-l">Phản hồi từ QL</div>
      ${sv.phan_hoi_xu_ly ? `<div class="bgql-svd-reply-text">${escHtml(sv.phan_hoi_xu_ly)}</div>` : ''}
      ${sv.deadline_xu_ly ? `<div class="bgql-svd-reply-dl">Deadline: <b>${fmtT(sv.deadline_xu_ly)}</b></div>` : ''}
      ${sv.nguoi_phu_trach_ten ? `<div class="bgql-svd-reply-by">- ${escHtml(sv.nguoi_phu_trach_ten)}${sv.thoi_gian_phan_hoi ? ` · ${fmtT(sv.thoi_gian_phan_hoi)}` : ''}</div>` : ''}
      ${anhPh.length > 0 ? `<div class="bgql-svd-gallery" style="margin-top:8px">
        ${anhPh.map(url => `<div class="bgql-svd-gal-cell" onclick="bgViewImage('${escHtml(url)}')"><img src="${escHtml(url)}" loading="lazy"></div>`).join('')}
      </div>` : ''}
    </div>` : ''}

    <!-- ĐÓNG SỰ VỤ -->
    ${sv.trang_thai === 'HOAN_TAT' && sv.nguoi_dong_ten ? `<div class="bgql-svd-section bgql-svd-closed">
      <div class="bgql-svd-section-l">Đã đóng</div>
      <div class="bgql-svd-closed-by">${escHtml(sv.nguoi_dong_ten)}${sv.nguoi_dong_vai_tro ? ` (${escHtml(sv.nguoi_dong_vai_tro)})` : ''} · ${fmtT(sv.thoi_gian_dong)}</div>
      ${sv.ghi_chu_dong ? `<div class="bgql-svd-closed-note">${escHtml(sv.ghi_chu_dong)}</div>` : ''}
    </div>` : ''}

    <!-- BIÊN BẢN GỐC -->
    ${bg ? `<div class="bgql-svd-section bgql-svd-bg">
      <div class="bgql-svd-section-l">Biên bản gốc</div>
      <div class="bgql-svd-bg-card" onclick="bgqlCloseSuVuDetail(); bgOpenBanGiaoDetail('${bg.id}')">
        <div class="bgql-svd-bg-info">
          <div class="bgql-svd-bg-time">${(bg.gio_ban_giao||'').slice(0,5)} · ${bg.ngay_ban_giao}</div>
          <div class="bgql-svd-bg-by">Người gửi: <b>${escHtml(bg.nguoi_ban_giao_ten||'?')}</b></div>
          <div class="bgql-svd-bg-tien">Tổng tiền: <b>${bgFmtVN(bg.tien_tong||0)} đ</b></div>
        </div>
        ${anhBg.length > 0 ? `<div class="bgql-svd-bg-thumbs">
          ${anhBg.slice(0,3).map(url => `<div class="bgql-svd-bg-thumb"><img src="${escHtml(url)}" loading="lazy"></div>`).join('')}
          ${anhBg.length > 3 ? `<div class="bgql-svd-bg-thumb-more">+${anhBg.length-3}</div>` : ''}
        </div>` : ''}
        <div class="bgql-svd-bg-arrow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </div>` : ''}
  `;
}

// [v13.33] Xóa sự vụ — chỉ ADMIN
window.bgqlDeleteSuVu = async function(sv_id){
  if (!SESSION || SESSION.vaiTro !== 'ADMIN') {
    showToast('Chỉ ADMIN được xóa sự vụ', 'warn');
    return;
  }
  if (!confirm('Xóa sự vụ này? Hành động KHÔNG thể hoàn tác.')) return;
  try {
    const { data, error } = await supa.rpc('fn_su_vu_delete', {
      p_id: sv_id, p_ma_nv: SESSION.ma
    });
    if (error || (data && data.ok === false)) throw new Error((data && data.error) || error.message);
    showToast('Đã xóa sự vụ', 'ok');
    bgqlCloseSuVuDetail();
    bgqlSuVuCache = null;
    bgqlLoadSuVu();
  } catch(e){ showToast('Lỗi: ' + e.message, 'warn'); }
};


// ═════════════════════════════════════════════════════════════════════════
//  [v13.36] MULTI-SELECT DELETE — ADMIN tick nhiều sự vụ để xóa hàng loạt
// ═════════════════════════════════════════════════════════════════════════
let bgqlMultiSelectMode = false;
let bgqlSelectedIds = new Set();
let bgqlDeleteArmed = false;     // [v13.68] xác nhận xóa 2 bước (thay confirm iOS)
let bgqlDeleteArmTimer = null;

// [v13.37] FIX bugs: full re-render thay vì partial → DOM luôn sync với state
window.bgqlToggleMultiSelect = function(){
  if (!SESSION || !['ADMIN','QLNS','QLBH'].includes(SESSION.vaiTro)) {
    showToast('Chỉ quản lý mới có quyền thao tác hàng loạt', 'warn');
    return;
  }
  bgqlMultiSelectMode = !bgqlMultiSelectMode;
  bgqlSelectedIds = new Set();  // Reset hoàn toàn
  bgqlDeleteArmed = false;
  bgqlRenderSuVuList();
  bgqlRenderSuVuFilters();  // Update button text "Chọn nhiều" ↔ "Đóng chọn"
  bgqlRenderMultiSelectBar();
};

// [v15.2] Thoát chế độ chọn-nhiều + DỌN SẠCH thanh fixed. Gọi khi rời trang để thanh không
// còn lơ lửng (ghost) đè lên trang khác và làm các nút bấm không ăn.
window.bgqlForceExitMultiSelect = function(){
  bgqlMultiSelectMode = false;
  bgqlSelectedIds = new Set();
  bgqlDeleteArmed = false;
  if (bgqlDeleteArmTimer) { clearTimeout(bgqlDeleteArmTimer); bgqlDeleteArmTimer = null; }
  document.querySelectorAll('#bgql-multiselect-bar').forEach(el => el.remove());
  const listEl = document.getElementById('bgql-suvu-list');
  if (listEl) listEl.classList.remove('bgql-ms-on');
};

window.bgqlToggleSelect = function(id){
  if (bgqlSelectedIds.has(id)) bgqlSelectedIds.delete(id);
  else bgqlSelectedIds.add(id);
  bgqlDeleteArmed = false;
  // [v13.37] FULL re-render — partial DOM update không reliable
  bgqlRenderSuVuList();
  bgqlRenderMultiSelectBar();
};

window.bgqlSelectAll = function(){
  // [v13.68] Chỉ chọn các sự vụ ĐANG hiển thị (sau bộ lọc hiện tại)
  const cache = bgqlGetFilteredSuVu();
  const validIds = cache.map(s => s.id);
  const validIdSet = new Set(validIds);
  // Filter selected — chỉ giữ ID hợp lệ
  bgqlSelectedIds = new Set(Array.from(bgqlSelectedIds).filter(id => validIdSet.has(id)));
  
  if (validIds.length === 0) return;  // Không có gì để chọn
  
  if (bgqlSelectedIds.size === validIds.length) {
    // Đang chọn tất cả → bỏ chọn hết
    bgqlSelectedIds = new Set();
  } else {
    // Chưa chọn tất cả → chọn hết
    bgqlSelectedIds = new Set(validIds);
  }
  bgqlRenderSuVuList();
  bgqlRenderMultiSelectBar();
};

function bgqlRenderMultiSelectBar(){
  // [v15.2] Đảm bảo chỉ tồn tại 1 thanh — xóa mọi thanh trùng còn sót
  const _bars = document.querySelectorAll('#bgql-multiselect-bar');
  for (let i = 1; i < _bars.length; i++) _bars[i].remove();
  let bar = document.getElementById('bgql-multiselect-bar');
  const listEl = document.getElementById('bgql-suvu-list');
  if (!bgqlMultiSelectMode) {
    if (bar) bar.remove();
    if (listEl) listEl.classList.remove('bgql-ms-on');
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bgql-multiselect-bar';
    bar.className = 'bgql-multiselect-bar';
    document.body.appendChild(bar);
  }
  if (listEl) listEl.classList.add('bgql-ms-on');
  // [v13.68] Tổng dựa trên danh sách đã lọc (đồng bộ với Chọn tất cả)
  const cache = bgqlGetFilteredSuVu();
  const validIdSet = new Set(cache.map(s => s.id));
  // Đảm bảo selectedIds chỉ chứa ID còn tồn tại
  bgqlSelectedIds = new Set(Array.from(bgqlSelectedIds).filter(id => validIdSet.has(id)));
  const total = cache.length;
  const sel = bgqlSelectedIds.size;
  const allSelected = sel === total && total > 0;
  
  const isAdminReal = (typeof SESSION !== 'undefined' && SESSION && SESSION.vaiTro === 'ADMIN');
  bar.innerHTML = `
    <div class="bgql-ms-l">Đã chọn <b>${sel}</b> / ${total}</div>
    <div class="bgql-ms-r">
      <button class="bgql-act bgql-act-ghost" onclick="bgqlSelectAll()">${allSelected?'Bỏ chọn':'Tất cả'}</button>
      <button class="bgql-act bgql-act-primary" onclick="bgqlBulkPhanHoi()">Phản hồi</button>
      ${isAdminReal ? `<button class="bgql-act bgql-act-danger" onclick="bgqlDeleteBulkConfirm()">${bgqlDeleteArmed ? 'Xóa?' : 'Xóa'}</button>` : ''}
      <button class="bgql-act bgql-act-ghost" onclick="bgqlToggleMultiSelect()">Hủy</button>
    </div>
  `;
}

window.bgqlDeleteBulkConfirm = async function(){
  if (bgqlSelectedIds.size === 0) { showToast('Chưa chọn sự vụ nào', 'warn'); return; }
  // [v13.68] iOS PWA: confirm() thường không hiện → xác nhận 2 bước ngay trên thanh
  if (!bgqlDeleteArmed) {
    bgqlDeleteArmed = true;
    bgqlRenderMultiSelectBar();
    if (bgqlDeleteArmTimer) clearTimeout(bgqlDeleteArmTimer);
    bgqlDeleteArmTimer = setTimeout(function(){ bgqlDeleteArmed = false; bgqlRenderMultiSelectBar(); }, 4000);
    return;
  }
  bgqlDeleteArmed = false;
  if (bgqlDeleteArmTimer) { clearTimeout(bgqlDeleteArmTimer); bgqlDeleteArmTimer = null; }

  try {
    const ids = Array.from(bgqlSelectedIds);
    const { data, error } = await supa.rpc('fn_su_vu_delete_bulk', {
      p_ids: ids, p_ma_nv: SESSION.ma
    });
    if (error || (data && data.ok === false)) throw new Error((data && data.error) || (error && error.message) || 'Không xóa được');
    if (data.so_loi && data.so_loi > 0) {
      showToast(`Đã xóa ${data.so_xoa} · ${data.so_loi} không xóa được (còn dữ liệu liên quan)`, 'warn');
      if (data.loi) console.warn('[su_vu_delete] lý do:', data.loi);
    } else {
      showToast(`✓ Đã xóa ${data.so_xoa} sự vụ`, 'ok');
    }
    
    // [v13.91] GIỮ chế độ chọn nhiều để xóa tiếp — chỉ reset danh sách đã chọn
    bgqlSelectedIds = new Set();
    bgqlSuVuCache = null;
    await bgqlLoadSuVu();          // reload + render list (checkbox vẫn hiện vì mode còn bật)
    bgqlRenderSuVuFilters();
    bgqlRenderMultiSelectBar();    // cập nhật bar (0 đã chọn), không gỡ bar
  } catch(e){ 
    showToast('Lỗi: ' + e.message, 'warn');
  }
};

// [v13.91] PHẢN HỒI HÀNG LOẠT — 1 nội dung/người xử lý/deadline áp cho nhiều sự vụ
window.bgqlBulkPhanHoi = function(){
  if (bgqlSelectedIds.size === 0) { showToast('Chưa chọn sự vụ nào', 'warn'); return; }
  const n = bgqlSelectedIds.size;
  const def = new Date(Date.now() + 86400000);
  const pad = x => String(x).padStart(2,'0');
  const defStr = `${def.getFullYear()}-${pad(def.getMonth()+1)}-${pad(def.getDate())}T${pad(def.getHours())}:${pad(def.getMinutes())}`;
  const m = document.createElement('div');
  m.className = 'bgql-modal-bg';
  m.innerHTML = `
    <div class="bgql-modal">
      <div class="bgql-modal-head">
        <div class="bgql-modal-ttl">Phản hồi ${n} sự vụ cùng lúc</div>
        <button class="bgql-modal-x" onclick="this.closest('.bgql-modal-bg').remove()">✕</button>
      </div>
      <div class="bgql-modal-body">
        <div style="font-size:12px;color:#64748B;margin-bottom:14px;background:#F4FBF8;border:1px solid #DCF3E8;border-radius:10px;padding:10px 12px">Nội dung, người xử lý và deadline dưới đây sẽ áp dụng cho cả <b>${n}</b> sự vụ đã chọn.</div>
        <label class="bgql-modal-label">Nội dung phản hồi <span style="color:#DC2626">*</span></label>
        <textarea id="bgql-ph-noidung" class="bgql-modal-input" rows="4" placeholder="Hướng xử lý chung cho các sự vụ này..."></textarea>
        <label class="bgql-modal-label">Người trực tiếp xử lý</label>
        <div class="bgql-xl-wrap">
          <input type="text" id="bgql-ph-xl-search" class="bgql-modal-input bgql-xl-search" placeholder="Gõ mã hoặc tên (NV+QL)..." autocomplete="off" oninput="bgqlSearchNguoiXuLy(this.value)" onfocus="bgqlSearchNguoiXuLy(this.value)">
          <input type="hidden" id="bgql-ph-xl-data" value="">
          <div class="bgql-xl-dropdown" id="bgql-xl-dropdown" style="display:none"></div>
        </div>
        <div style="font-size:11px;color:#64748B;margin-top:4px;margin-bottom:14px">Cùng một người xử lý sẽ được gán cho tất cả sự vụ đã chọn.</div>
        <label class="bgql-modal-label">Deadline xử lý <span style="color:#DC2626">*</span></label>
        <input type="datetime-local" id="bgql-ph-deadline" class="bgql-modal-input bgql-modal-dl" value="${defStr}" step="900">
        <button id="bgql-ph-submit" class="bgql-modal-submit" onclick="bgqlSubmitPhanHoiBulk()" style="margin-top:16px">Gửi phản hồi cho ${n} sự vụ</button>
      </div>
    </div>`;
  document.body.appendChild(m);
};

window.bgqlSubmitPhanHoiBulk = async function(){
  const noidung = document.getElementById('bgql-ph-noidung').value.trim();
  const dlStr = document.getElementById('bgql-ph-deadline').value;
  if (!noidung) { showToast('Nội dung phản hồi không được trống', 'warn'); return; }
  if (!dlStr) { showToast('Deadline xử lý là bắt buộc', 'warn'); return; }
  const dl = new Date(dlStr);
  if (isNaN(dl.getTime()) || dl < new Date()) { showToast('Deadline phải sau thời điểm hiện tại', 'warn'); return; }
  let xl = null;
  try { const r = document.getElementById('bgql-ph-xl-data').value; if (r) xl = JSON.parse(r); } catch(e){}
  const ids = Array.from(bgqlSelectedIds);
  const btn = document.getElementById('bgql-ph-submit');
  btn.disabled = true; btn.textContent = 'Đang gửi...';
  let ok = 0, fail = 0;
  for (const id of ids) {
    try {
      const { data, error } = await supa.rpc('fn_su_vu_phan_hoi', {
        p_id: id, p_ma_nv: SESSION.ma, p_ten_nv: SESSION.ten||SESSION.hoTen||'', p_vai_tro: SESSION.vaiTro||'',
        p_noi_dung: noidung, p_deadline_xu_ly: dl.toISOString(), p_anh_urls: null,
        p_nguoi_xu_ly_ma: xl?xl.ma:null, p_nguoi_xu_ly_ten: xl?xl.ten:null,
        p_nguoi_xu_ly_loai: xl?xl.loai:null, p_nguoi_xu_ly_ch: xl?(xl.ch_or_role||''):null
      });
      if (error || (data && data.ok === false)) fail++; else ok++;
    } catch(e){ fail++; }
  }
  showToast(`✓ Đã phản hồi ${ok} sự vụ${fail?(' · '+fail+' lỗi'):''}`, fail?'warn':'ok');
  const bg = document.querySelector('.bgql-modal-bg'); if (bg) bg.remove();
  bgqlSelectedIds = new Set();
  bgqlSuVuCache = null;
  await bgqlLoadSuVu();
  bgqlRenderSuVuFilters();
  bgqlRenderMultiSelectBar();
};


// ═════════════════════════════════════════════════════════════════════════
//  [v13.38] HEATMAP — CH hay có vấn đề (30 ngày)
// ═════════════════════════════════════════════════════════════════════════
window.bgqlOpenHeatmap = async function(){
  const modal = document.getElementById('bgql-svd-modal');
  const body = document.getElementById('bgql-svd-body');
  if (!modal || !body) return;
  document.getElementById('bgql-svd-title').textContent = 'CH hay có vấn đề · 30 ngày';
  body.innerHTML = '<div class="ns-empty">⏳ Đang phân tích...</div>';
  modal.style.display = '';
  document.body.style.overflow = 'hidden';
  try {
    const { data, error } = await supa.rpc('fn_bg_heatmap_ch', {});
    if (error) throw error;
    const arr = Array.isArray(data) ? data : [];
    if (arr.length === 0) { body.innerHTML = '<div class="ns-empty">Chưa có dữ liệu sự vụ 30 ngày qua.</div>'; return; }
    body.innerHTML = arr.map((c, i) => `
      <div class="bgql-hm-row" onclick="bgqlOpenThietBi('${escHtml(c.ma_ch)}','${escHtml(c.ten_ch||c.ma_ch)}')">
        <div class="bgql-hm-rank ${i<3?'top':''}">${i+1}</div>
        <div class="bgql-hm-main">
          <div class="bgql-hm-ten">${escHtml(c.ten_ch||c.ma_ch)}</div>
          <div class="bgql-hm-sub">${escHtml(c.ma_ch)}${c.khu_vuc?' · '+escHtml(c.khu_vuc):''}</div>
          ${(c.lap_lai && c.lap_lai.length>0)?`<div class="bgql-hm-rep">${c.lap_lai.map(l=>`<span>${escHtml(l.ten)} ×${l.so_lan}</span>`).join('')}</div>`:''}
        </div>
        <div class="bgql-hm-nums">
          <div class="bgql-hm-num"><b>${c.tong_su_vu}</b><small>sự vụ</small></div>
          ${c.so_khan>0?`<div class="bgql-hm-num khan"><b>${c.so_khan}</b><small>khẩn</small></div>`:''}
        </div>
      </div>
    `).join('');
  } catch(e){
    body.innerHTML = `<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`;
  }
};

// ═════════════════════════════════════════════════════════════════════════
//  [v13.38] LỊCH SỬ THIẾT BỊ — hạng mục hư lặp lại của 1 CH (6 tháng)
// ═════════════════════════════════════════════════════════════════════════
window.bgqlOpenThietBi = async function(ma_ch, ten_ch){
  const modal = document.getElementById('bgql-svd-modal');
  const body = document.getElementById('bgql-svd-body');
  if (!modal || !body) return;
  document.getElementById('bgql-svd-title').textContent = 'Lịch sử thiết bị · ' + (ten_ch||ma_ch);
  body.innerHTML = '<div class="ns-empty">⏳ Đang tải...</div>';
  modal.style.display = '';
  document.body.style.overflow = 'hidden';
  try {
    const { data, error } = await supa.rpc('fn_thiet_bi_history', { p_ma_ch: ma_ch });
    if (error) throw error;
    const arr = Array.isArray(data) ? data : [];
    if (arr.length === 0) { body.innerHTML = '<div class="ns-empty">CH này không có hạng mục hư hỏng trong 6 tháng.</div>'; return; }
    body.innerHTML = `<div style="font-size:12px;color:#64748B;margin-bottom:12px">Thống kê tài sản hư hỏng 6 tháng gần nhất. Hạng mục từ 3 lần trở lên nên cân nhắc thay mới.</div>` +
      arr.map(t => `
      <div class="bgql-tb-row${t.canh_bao_thay_moi?' canh-bao':''}">
        <div class="bgql-tb-head">
          <div class="bgql-tb-ten">${escHtml(t.hang_muc)}</div>
          <div class="bgql-tb-count${t.canh_bao_thay_moi?' do':''}">${t.so_lan} lần</div>
        </div>
        ${t.canh_bao_thay_moi?'<div class="bgql-tb-warn">Hư lặp lại nhiều - đề xuất thay mới thay vì sửa</div>':''}
        <div class="bgql-tb-list">
          ${(t.chi_tiet||[]).slice(0,5).map(c=>`<div class="bgql-tb-item">${c.ngay} · ${escHtml(c.mo_ta||'')} <span class="bgql-tb-st">${c.trang_thai==='HOAN_TAT'?'Đã xử lý':'Đang mở'}</span></div>`).join('')}
        </div>
      </div>
    `).join('');
  } catch(e){
    body.innerHTML = `<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`;
  }
};

// ═════════════════════════════════════════════════════════════════════════
//  [v13.38] EXPORT CSV (Excel mở được) — sự vụ + thống kê
// ═════════════════════════════════════════════════════════════════════════
function bgqlExportCsv(filename, headers, rows){
  const esc = v => {
    const s = String(v == null ? '' : v);
    return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  // BOM UTF-8 để Excel hiển thị đúng tiếng Việt
  const csv = '\uFEFF' + [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

// [v13.74] Xuất Excel thật (.xlsx) qua SheetJS
function _bgqlLoadSheetJS(){
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
async function bgqlExportXlsx(filename, sheetName, headers, rows){
  try {
    const XLSX = await _bgqlLoadSheetJS();
    const aoa = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = headers.map((_, ci) => {
      let max = 8;
      aoa.forEach(r => { const v = r[ci]!=null?String(r[ci]):''; if (v.length>max) max=v.length; });
      return { wch: Math.min(max+2, 45) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
    XLSX.writeFile(wb, filename);
  } catch(e){ showToast('Lỗi xuất Excel: ' + e.message, 'warn'); }
}
window.bgqlExportSuVu = function(){
  const arr = bgqlGetFilteredSuVu();
  if (arr.length === 0) { showToast('Không có dữ liệu để xuất', 'warn'); return; }
  const fmtT = t => t ? new Date(t).toLocaleString('vi-VN') : '';
  bgqlExportXlsx(
    'su_vu_' + new Date().toISOString().slice(0,10) + '.xlsx',
    'Sự vụ',
    ['Mã sự vụ','Cửa hàng','Mã CH','Tiêu đề','Mô tả','Mức độ','Trạng thái','Người tạo','Người phụ trách','Người xử lý','Phản hồi','Deadline','Tạo lúc'],
    arr.map(s => [
      s.ma_sv||'', s.ten_ch_snapshot||'', s.ma_ch||'', s.tieu_de||'', s.mo_ta||'',
      s.muc_do||'', s.trang_thai||'', s.nguoi_tao_ten||'', s.nguoi_phu_trach_ten||'',
      s.nguoi_xu_ly_ten||'', s.phan_hoi_xu_ly||'', fmtT(s.deadline_xu_ly), fmtT(s.created_at)
    ])
  );
  showToast('✓ Đã xuất ' + arr.length + ' sự vụ', 'ok');
};

window.bgqlExportThongKe = function(){
  const ds = (bgqlStatsData && bgqlStatsData.ds_ch) || [];
  if (ds.length === 0) { showToast('Không có dữ liệu để xuất', 'warn'); return; }
  bgqlExportXlsx(
    'thong_ke_bg_' + new Date().toISOString().slice(0,10) + '.xlsx',
    'Thống kê',
    ['Mã CH','Tên CH','Khu vực','Đã gửi BB','Số sự vụ','Số khẩn cấp'],
    ds.map(c => [c.ma_ch||'', c.ten_ch||'', c.khu_vuc||'', c.da_gui?'Có':'Chưa', c.so_su_vu||0, c.so_su_vu_khan||0])
  );
  showToast('✓ Đã xuất ' + ds.length + ' cửa hàng', 'ok');
};

// ═════════════════════════════════════════════════════════════════════════
//  [v13.38] WEB PUSH SUBSCRIBE — QL bật thông báo đẩy
//  VAPID public key đọc từ app_settings key 'push.vapid_public'
// ═════════════════════════════════════════════════════════════════════════
function bgqlUrlB64ToUint8(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

window.bgqlEnablePush = async function(btn){
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('Thiết bị không hỗ trợ thông báo đẩy. iPhone: cần cài app vào màn hình chính (iOS 16.4+)', 'warn');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Đang bật...'; }
    
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      showToast('Bạn đã từ chối quyền thông báo', 'warn');
      if (btn) { btn.disabled = false; btn.textContent = 'Bật thông báo đẩy'; }
      return;
    }
    
    // Lấy VAPID public key từ app_settings
    const { data: vapidRow, error: ve } = await supa.from('app_settings')
      .select('value').eq('key', 'push.vapid_public').single();
    if (ve || !vapidRow || !vapidRow.value) {
      showToast('Hệ thống chưa cấu hình VAPID key (admin cần setup Edge Function)', 'warn');
      if (btn) { btn.disabled = false; btn.textContent = 'Bật thông báo đẩy'; }
      return;
    }
    const vapidKey = typeof vapidRow.value === 'string' ? vapidRow.value.replace(/"/g,'') : vapidRow.value;
    
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bgqlUrlB64ToUint8(vapidKey)
    });
    
    const raw = sub.toJSON();
    const { data, error } = await supa.rpc('fn_push_subscribe', {
      p_ma_nv: SESSION.ma,
      p_endpoint: raw.endpoint,
      p_p256dh: raw.keys.p256dh,
      p_auth: raw.keys.auth,
      p_ua: navigator.userAgent.slice(0, 200)
    });
    if (error || (data && data.ok === false)) throw new Error((data&&data.error)||error.message);
    
    showToast('✓ Đã bật thông báo đẩy trên thiết bị này', 'ok');
    if (btn) { btn.textContent = '✓ Đã bật thông báo'; }
  } catch(e){
    showToast('⚠ ' + e.message, 'warn');
    if (btn) { btn.disabled = false; btn.textContent = 'Bật thông báo đẩy'; }
  }
};


// ═════════════════════════════════════════════════════════════════════════
//  [v13.39] CẤU HÌNH AI TỔNG HỢP SÁNG — quản lý người nhận (ADMIN)
// ═════════════════════════════════════════════════════════════════════════
let bgqlDigestOptions = null;

window.bgqlOpenDigestConfig = async function(){
  const modal = document.getElementById('bgql-svd-modal');
  const body = document.getElementById('bgql-svd-body');
  if (!modal || !body) return;
  document.getElementById('bgql-svd-title').textContent = 'Cấu hình AI Tổng hợp sáng';
  body.innerHTML = '<div class="ns-empty">⏳ Đang tải...</div>';
  modal.style.display = '';
  document.body.style.overflow = 'hidden';
  await bgqlRenderDigestConfig();
};

async function bgqlRenderDigestConfig(){
  const body = document.getElementById('bgql-svd-body');
  if (!body) return;
  try {
    const [listRes, optRes, enRes] = await Promise.all([
      supa.rpc('fn_digest_recipients_list'),
      supa.rpc('fn_digest_options'),
      supa.from('app_settings').select('value').eq('key','digest.enabled').single().then(r=>r).catch(()=>({data:null}))
    ]);
    const list = Array.isArray(listRes.data) ? listRes.data : [];
    bgqlDigestOptions = optRes.data || { roles: [], bo_phan: [] };
    const enabled = enRes.data && (enRes.data.value === true || enRes.data.value === 'true');

    const loaiLabel = { NGUOI:'Người', ROLE:'Vai trò', BO_PHAN:'Bộ phận' };

    body.innerHTML = `
      <div class="bgql-dg-info">
        AI đọc toàn bộ biên bản và sự vụ 24h qua, gửi bản phân tích chi tiết lúc 7h sáng mỗi ngày. Số tiền chỉ hiển thị khi có lệch tiền.
      </div>

      <div class="bgql-dg-toggle">
        <span>Trạng thái: <b class="${enabled?'on':'off'}">${enabled?'Đang bật':'Đã tắt'}</b></span>
        <button class="bgql-act ${enabled?'bgql-act-ghost':'bgql-act-primary'}" onclick="bgqlDigestToggle(${!enabled})">${enabled?'Tắt digest':'Bật digest'}</button>
      </div>

      <div class="bgql-dg-sec-ttl">Người nhận hiện tại (${list.length})</div>
      <div class="bgql-dg-list">
        ${list.length===0 ? '<div class="ns-empty">Chưa có người nhận nào.</div>' :
          list.map(r => `
            <div class="bgql-dg-row">
              <div class="bgql-dg-row-l">
                <span class="bgql-dg-badge ${r.loai}">${loaiLabel[r.loai]||r.loai}</span>
                <span class="bgql-dg-name">${escHtml(r.ten_hien_thi||r.gia_tri)}</span>
                ${!r.active?'<span class="bgql-dg-off">đã tắt</span>':''}
              </div>
              <button class="bgql-dg-del" onclick="bgqlDigestRemove('${r.id}')" title="Xóa">✕</button>
            </div>
          `).join('')}
      </div>

      <div class="bgql-dg-sec-ttl">Thêm người nhận</div>
      <div class="bgql-dg-add">
        <select class="bg-tl-dropdown" id="bgql-dg-loai" onchange="bgqlDigestLoaiChange()">
          <option value="NGUOI">Người cụ thể</option>
          <option value="ROLE">Theo vai trò</option>
          <option value="BO_PHAN">Theo bộ phận</option>
        </select>
        <div id="bgql-dg-value-wrap">
          <input type="text" class="bg-tl-dropdown" id="bgql-dg-search" placeholder="Tìm theo tên hoặc mã..." oninput="bgqlDigestSearchPerson(this.value)" autocomplete="off">
          <div id="bgql-dg-search-results" class="bgql-dg-results"></div>
        </div>
      </div>
    `;
  } catch(e){
    body.innerHTML = `<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`;
  }
}

window.bgqlDigestLoaiChange = function(){
  const loai = document.getElementById('bgql-dg-loai').value;
  const wrap = document.getElementById('bgql-dg-value-wrap');
  if (!wrap) return;
  if (loai === 'NGUOI') {
    wrap.innerHTML = `<input type="text" class="bg-tl-dropdown" id="bgql-dg-search" placeholder="Tìm theo tên hoặc mã..." oninput="bgqlDigestSearchPerson(this.value)" autocomplete="off">
      <div id="bgql-dg-search-results" class="bgql-dg-results"></div>`;
  } else {
    const opts = loai === 'ROLE' ? (bgqlDigestOptions.roles||[]) : (bgqlDigestOptions.bo_phan||[]);
    wrap.innerHTML = `<select class="bg-tl-dropdown" id="bgql-dg-select">
        ${opts.length===0?'<option value="">(không có)</option>':opts.map(o=>`<option value="${escHtml(o)}">${escHtml(o)}</option>`).join('')}
      </select>
      <button class="bgql-act bgql-act-primary" style="margin-top:8px;width:100%" onclick="bgqlDigestAddRoleOrDept()">Thêm</button>`;
  }
};

let bgqlDigestSearchTimer = null;
window.bgqlDigestSearchPerson = function(kw){
  clearTimeout(bgqlDigestSearchTimer);
  const box = document.getElementById('bgql-dg-search-results');
  if (!box) return;
  if (!kw || kw.length < 1) { box.innerHTML = ''; return; }
  bgqlDigestSearchTimer = setTimeout(async () => {
    try {
      const { data } = await supa.rpc('fn_search_nguoi_xu_ly', { p_keyword: kw, p_limit: 8 });
      const arr = Array.isArray(data) ? data : [];
      box.innerHTML = arr.length===0 ? '<div class="bgql-dg-noresult">Không tìm thấy</div>' :
        arr.map(p => `<div class="bgql-dg-result-item" onclick="bgqlDigestAddPerson('${escHtml(p.ma)}','${escHtml((p.ten||'').replace(/'/g,''))}')">
          <b>${escHtml(p.ten)}</b> <span>${escHtml(p.ma)}${p.ch_or_role?' · '+escHtml(p.ch_or_role):''}</span>
        </div>`).join('');
    } catch(e){ box.innerHTML = ''; }
  }, 250);
};

window.bgqlDigestAddPerson = async function(ma, ten){
  await bgqlDigestDoAdd('NGUOI', ma, ten);
};
window.bgqlDigestAddRoleOrDept = async function(){
  const loai = document.getElementById('bgql-dg-loai').value;
  const sel = document.getElementById('bgql-dg-select');
  if (!sel || !sel.value) { showToast('Chưa chọn giá trị', 'warn'); return; }
  await bgqlDigestDoAdd(loai, sel.value, sel.value);
};

async function bgqlDigestDoAdd(loai, giaTri, ten){
  try {
    const { data, error } = await supa.rpc('fn_digest_recipient_add', {
      p_ma_nv: SESSION.ma, p_loai: loai, p_gia_tri: giaTri, p_ten: ten
    });
    if (error || (data && data.ok === false)) throw new Error((data&&data.error)||error.message);
    showToast('✓ Đã thêm người nhận', 'ok');
    bgqlRenderDigestConfig();
  } catch(e){ showToast('⚠ ' + e.message, 'warn'); }
}

window.bgqlDigestRemove = async function(id){
  if (!confirm('Xóa người nhận này khỏi danh sách digest?')) return;
  try {
    const { data, error } = await supa.rpc('fn_digest_recipient_remove', { p_ma_nv: SESSION.ma, p_id: id });
    if (error || (data && data.ok === false)) throw new Error((data&&data.error)||error.message);
    showToast('✓ Đã xóa', 'ok');
    bgqlRenderDigestConfig();
  } catch(e){ showToast('⚠ ' + e.message, 'warn'); }
};

window.bgqlDigestToggle = async function(turnOn){
  try {
    const { error } = await supa.from('app_settings')
      .update({ value: turnOn, updated_at: new Date().toISOString() })
      .eq('key', 'digest.enabled');
    if (error) throw error;
    showToast(turnOn?'✓ Đã bật digest':'Đã tắt digest', 'ok');
    bgqlRenderDigestConfig();
  } catch(e){ showToast('⚠ ' + e.message, 'warn'); }
};


// ═════════════════════════════════════════════════════════════════════════
//  [v13.40] AI BÁO CÁO ON-DEMAND — Sprint A
// ═════════════════════════════════════════════════════════════════════════
let bgqlAibcSelectedRange = '7d';  // today | 7d | 30d | custom
let bgqlAibcCustomFrom = null;
let bgqlAibcCustomTo = null;
let bgqlAibcCache = null;
let bgqlAibcGenerating = false;

window.bgqlLoadAiBaoCao = async function(){
  bgqlRenderAibcUI();
  if (!bgqlAibcCache) await bgqlAibcLoadHistory();
};

function bgqlRenderAibcUI(){
  const cont = document.getElementById('bgql-aibc-content');
  if (!cont) return;
  const isAdmin = (typeof SESSION !== 'undefined' && SESSION && SESSION.vaiTro === 'ADMIN');
  if (!isAdmin) {
    cont.innerHTML = '<div class="ns-empty">Tính năng dành cho ADMIN.</div>';
    return;
  }
  const isCustom = bgqlAibcSelectedRange === 'custom';
  cont.innerHTML = `
    <div class="aibc-range-grid">
      <button class="aibc-range ${bgqlAibcSelectedRange==='today'?'active':''}" onclick="bgqlAibcSetRange('today')">Hôm nay</button>
      <button class="aibc-range ${bgqlAibcSelectedRange==='7d'?'active':''}" onclick="bgqlAibcSetRange('7d')">7 ngày</button>
      <button class="aibc-range ${bgqlAibcSelectedRange==='30d'?'active':''}" onclick="bgqlAibcSetRange('30d')">30 ngày</button>
      <button class="aibc-range ${isCustom?'active':''}" onclick="bgqlAibcSetRange('custom')">Tùy chọn</button>
    </div>

    ${isCustom ? `<div class="aibc-custom-row">
      <input type="date" class="bg-tl-dropdown" id="aibc-from" value="${bgqlAibcCustomFrom||''}" onchange="bgqlAibcCustomFrom=this.value">
      <span class="aibc-custom-sep">đến</span>
      <input type="date" class="bg-tl-dropdown" id="aibc-to" value="${bgqlAibcCustomTo||''}" onchange="bgqlAibcCustomTo=this.value">
    </div>` : ''}

    <button class="aibc-gen-btn ${bgqlAibcGenerating?'busy':''}" onclick="bgqlAibcGenerate()" ${bgqlAibcGenerating?'disabled':''}>
      ${bgqlAibcGenerating ? 'AI đang phân tích...' : 'Tạo báo cáo AI ngay'}
    </button>
    <div class="aibc-hint">Mất khoảng 20-40 giây. AI dùng Claude Sonnet để phân tích chi tiết.</div>

    <div class="aibc-sec-ttl">Lịch sử báo cáo</div>
    <div id="aibc-history-list"><div class="ns-empty">⏳ Đang tải...</div></div>
  `;
}

window.bgqlAibcSetRange = function(r){
  bgqlAibcSelectedRange = r;
  bgqlRenderAibcUI();
  bgqlAibcRenderHistory();  // render lại list để không mất
};

async function bgqlAibcLoadHistory(){
  try {
    const { data, error } = await supa.rpc('fn_report_list', { p_ma_nv: SESSION.ma, p_limit: 100000 });
    if (error) throw error;
    bgqlAibcCache = Array.isArray(data) ? data : [];
    bgqlAibcRenderHistory();
  } catch(e){
    const box = document.getElementById('aibc-history-list');
    if (box) box.innerHTML = `<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`;
  }
}

function bgqlAibcRenderHistory(){
  const box = document.getElementById('aibc-history-list');
  if (!box) return;
  const arr = bgqlAibcCache || [];
  if (arr.length === 0) {
    box.innerHTML = '<div class="ns-empty">Chưa có báo cáo nào. Bấm "Tạo báo cáo AI ngay" để bắt đầu.</div>';
    return;
  }
  box.innerHTML = arr.map(r => {
    const t = new Date(r.created_at);
    const tStr = pad(t.getHours())+':'+pad(t.getMinutes())+' '+pad(t.getDate())+'/'+pad(t.getMonth()+1)+'/'+t.getFullYear();
    return `<div class="aibc-his-row" onclick="bgqlAibcOpenReport('${r.id}')">
      <div class="aibc-his-ttl">${escHtml(r.tieu_de)}</div>
      <div class="aibc-his-meta">${tStr} · ${escHtml(r.nguoi_tao_ten||r.nguoi_tao_ma)}</div>
      <div class="aibc-his-preview">${escHtml(r.preview||'')}...</div>
    </div>`;
  }).join('');
}

window.bgqlAibcGenerate = async function(){
  if (bgqlAibcGenerating) return;
  
  // Validate custom range
  if (bgqlAibcSelectedRange === 'custom') {
    if (!bgqlAibcCustomFrom || !bgqlAibcCustomTo) {
      showToast('Vui lòng chọn cả ngày bắt đầu và kết thúc', 'warn');
      return;
    }
    if (new Date(bgqlAibcCustomFrom) > new Date(bgqlAibcCustomTo)) {
      showToast('Ngày bắt đầu phải trước ngày kết thúc', 'warn');
      return;
    }
  }
  
  bgqlAibcGenerating = true;
  bgqlRenderAibcUI();
  bgqlAibcRenderHistory();
  
  try {
    const payload = {
      ma_nv: SESSION.ma,
      ten_nv: SESSION.ten || SESSION.hoTen || '',
      range_loai: bgqlAibcSelectedRange
    };
    if (bgqlAibcSelectedRange === 'custom') {
      payload.range_from = new Date(bgqlAibcCustomFrom + 'T00:00:00').toISOString();
      payload.range_to = new Date(bgqlAibcCustomTo + 'T23:59:59').toISOString();
    }
    
    const { data: result, error: invokeErr } = await supa.functions.invoke('ai-report', {
      body: payload
    });
    if (invokeErr) throw new Error(invokeErr.message || 'Lỗi kết nối AI');
    if (!result || !result.ok) throw new Error((result && result.error) || 'Lỗi tạo báo cáo');
    
    showToast('✓ Đã tạo báo cáo AI', 'ok');
    bgqlAibcGenerating = false;
    
    // Reload history + mở luôn báo cáo mới
    await bgqlAibcLoadHistory();
    bgqlRenderAibcUI();
    bgqlAibcRenderHistory();
    bgqlAibcShowReport({
      id: result.id,
      tieu_de: result.tieu_de,
      noi_dung: result.noi_dung,
      created_at: new Date().toISOString(),
      nguoi_tao_ten: SESSION.ten || SESSION.hoTen
    });
  } catch(e){
    showToast('⚠ ' + e.message, 'warn');
    bgqlAibcGenerating = false;
    bgqlRenderAibcUI();
    bgqlAibcRenderHistory();
  }
};

window.bgqlAibcOpenReport = async function(id){
  try {
    const { data, error } = await supa.rpc('fn_report_get', { p_id: id, p_ma_nv: SESSION.ma });
    if (error || (data && data.ok === false)) throw new Error((data&&data.error)||error.message);
    bgqlAibcShowReport(data.report);
  } catch(e){ showToast('⚠ ' + e.message, 'warn'); }
};

function bgqlAibcShowReport(r){
  let modal = document.getElementById('aibc-report-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'aibc-report-modal';
  modal.className = 'ai-digest-modal-bg';
  const isAdmin = SESSION && SESSION.vaiTro === 'ADMIN';
  const t = new Date(r.created_at);
  const tStr = pad(t.getHours())+':'+pad(t.getMinutes())+' '+pad(t.getDate())+'/'+pad(t.getMonth()+1)+'/'+t.getFullYear();
  const safeBody = escHtml(r.noi_dung).replace(/\n/g, '<br>');
  modal.innerHTML = `
    <div class="ai-digest-modal">
      <div class="ai-digest-head">
        <div class="ai-digest-ttl">${escHtml(r.tieu_de)}</div>
        <button class="ai-digest-x" onclick="document.getElementById('aibc-report-modal').remove()">✕</button>
      </div>
      <div class="ai-digest-body">${safeBody}</div>
      <div class="ai-digest-foot">
        <span>Tạo lúc ${tStr} · ${escHtml(r.nguoi_tao_ten||'?')}</span>
        ${isAdmin && r.id ? `<button class="aibc-del-btn" onclick="bgqlAibcDeleteReport('${r.id}')">Xóa báo cáo</button>` : ''}
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

window.bgqlAibcDeleteReport = async function(id){
  if (!confirm('Xóa báo cáo này? Không thể hoàn tác.')) return;
  try {
    const { data, error } = await supa.rpc('fn_report_delete', { p_id: id, p_ma_nv: SESSION.ma });
    if (error || (data && data.ok === false)) throw new Error((data&&data.error)||error.message);
    showToast('✓ Đã xóa', 'ok');
    const m = document.getElementById('aibc-report-modal');
    if (m) m.remove();
    await bgqlAibcLoadHistory();
  } catch(e){ showToast('⚠ ' + e.message, 'warn'); }
};

/* ════════════════════════════════════════════════════════════════════════
 *  [v13.67] BỘ LỌC HẠNG MỤC — 5 nhóm lớn của bàn giao (gọn, xổ/thu)
 *  Map: tien=TIEN_LECH · hang=HANG_CHENH/HANG_HOA · kv1/2/4=TAI_SAN_KHONG_DAT
 *  với so_lieu.khu_vuc = 1/2/4.
 * ════════════════════════════════════════════════════════════════════════ */
window.bgqlToggleNhomPanel = function(){
  const p = document.getElementById('bgql-nhom-panel');
  const t = document.getElementById('bgql-nhom-toggle');
  if (!p) return;
  const show = (p.style.display === 'none' || !p.style.display);
  p.style.display = show ? 'flex' : 'none';
  if (t) t.classList.toggle('open', show);
};
// [v13.71] Cây hạng mục 2 cấp: 5 nhóm lớn → các mục con (món tài sản / loại tiền / nhóm hàng)
function bgqlBuildHmTree(){
  const ts = bgqlDanhMucTS || [];
  const mk = (arr) => arr.map(x => ({ ma:'ts:'+x.stt, ten:x.ten }));
  return [
    { key:'tien', ten:'Tiền mặt', children:[
      {ma:'tien:tien_mat_ket', ten:'Tiền két'},
      {ma:'tien:tien_ban_hang', ten:'Tiền bán hàng'},
      {ma:'tien:tien_chi', ten:'Tiền chi'},
    ]},
    { key:'kv1', ten:'Mặt tiền - hạ tầng', children: mk(ts.filter(x=>x.khu_vuc===1)) },
    { key:'kv2', ten:'Quầy thu ngân & IT', children: mk(ts.filter(x=>x.khu_vuc===2)) },
    { key:'kv4', ten:'Kho, sinh hoạt, công cụ', children: mk(ts.filter(x=>x.khu_vuc===4)) },
    { key:'hang', ten:'Hàng hóa & tồn kho', children:[
      {ma:'hang:Nhóm Nón Vải', ten:'Nón Vải'},
      {ma:'hang:Nhóm Nón Bảo Hiểm', ten:'Nón Bảo Hiểm'},
      {ma:'hang:Nhóm Phụ Kiện (Lưới, kính...)', ten:'Phụ Kiện'},
    ]},
  ];
}
function bgqlRenderHmTree(){
  const tree = bgqlBuildHmTree();
  const sel = bgqlSuVuFilter.muc_con || [];
  return tree.map(g => {
    const childMas = g.children.map(c=>c.ma);
    const cnt = childMas.filter(m=>sel.includes(m)).length;
    const allChecked = cnt>0 && cnt===childMas.length;
    const someChecked = cnt>0 && !allChecked;
    const expanded = !!bgqlHmExpanded[g.key];
    const partial = someChecked ? ` <span class="bgql-hm-partial">${cnt}/${childMas.length}</span>` : '';
    const children = g.children.map(c =>
      `<label class="bgql-hm-con"><input type="checkbox" ${sel.includes(c.ma)?'checked':''} onchange="bgqlToggleHmCon('${c.ma.replace(/'/g,"\\'")}')"><span>${c.ten}</span></label>`
    ).join('');
    return `<div class="bgql-hm-group">
      <div class="bgql-hm-cha">
        <label class="bgql-hm-cha-lbl"><input type="checkbox" ${allChecked?'checked':''} onchange="bgqlToggleHmCha('${g.key}')"><span class="bgql-hm-cha-ten">${g.ten}${partial}</span></label>
        <button type="button" class="bgql-hm-exp${expanded?' open':''}" onclick="bgqlToggleHmExpand('${g.key}')" aria-label="Mở">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="bgql-hm-children" style="display:${expanded?'block':'none'}">${children}</div>
    </div>`;
  }).join('');
}
function bgqlRefreshHmPanel(){
  const p = document.getElementById('bgql-nhom-panel');
  if (p) p.innerHTML = bgqlRenderHmTree() + '<button class="bgql-nhom-done" onclick="bgqlToggleNhomPanel()">Xong</button>';
  const b = document.getElementById('bgql-nhom-badge');
  const n = (bgqlSuVuFilter.muc_con||[]).length;
  if (b) { if (n) { b.style.display=''; b.textContent = n; } else b.style.display='none'; }
}
window.bgqlToggleHmExpand = function(key){
  bgqlHmExpanded[key] = !bgqlHmExpanded[key];
  bgqlRefreshHmPanel();
};
window.bgqlToggleHmCha = function(key){
  const g = bgqlBuildHmTree().find(x=>x.key===key);
  if (!g) return;
  const childMas = g.children.map(c=>c.ma);
  const sel = bgqlSuVuFilter.muc_con || [];
  const allChecked = childMas.length>0 && childMas.every(m=>sel.includes(m));
  bgqlSuVuFilter.muc_con = allChecked ? sel.filter(m=>!childMas.includes(m)) : Array.from(new Set(sel.concat(childMas)));
  bgqlHmExpanded[key] = true;
  bgqlRefreshHmPanel();
  bgqlRenderSuVuList();
};
window.bgqlToggleHmCon = function(ma){
  const sel = bgqlSuVuFilter.muc_con || [];
  const i = sel.indexOf(ma);
  if (i>=0) sel.splice(i,1); else sel.push(ma);
  bgqlSuVuFilter.muc_con = sel;
  bgqlRefreshHmPanel();
  bgqlRenderSuVuList();
};
function bgqlSvParseSoLieu(s){
  if (!s || !s.so_lieu) return null;
  if (typeof s.so_lieu === 'object') return s.so_lieu;
  try { return JSON.parse(s.so_lieu); } catch(e){ return null; }
}
function bgqlSvMatchNhom(s){
  const sel = bgqlSuVuFilter.muc_con || [];
  if (!sel.length) return true;
  const loai = s.loai || '';
  const sl = bgqlSvParseSoLieu(s) || {};
  let ma = null;
  if (loai === 'TIEN_LECH') ma = 'tien:' + (sl.loai || '');
  else if (loai === 'TAI_SAN_KHONG_DAT') ma = 'ts:' + (sl.stt != null ? sl.stt : '');
  else if (loai === 'HANG_CHENH' || loai === 'HANG_HOA') ma = 'hang:' + (sl.nhom || '');
  return ma != null && sel.includes(ma);
}
