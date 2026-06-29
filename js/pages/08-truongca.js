// ════════════════════════════════════════════════════════════════════
// [v17.31] TRƯỞNG CA — thẻ chức danh + hero ca thật + hiển thị XUYÊN SUỐT theo ca
//  • NV: tự nhận diện CA ĐANG MỞ (fn_truong_ca_cho_nv) → thẻ TC + hero hiện theo ca,
//        KHÔNG cần chọn cửa hàng. Chưa vào ca thì xem trước theo cửa hàng đang chọn.
//  • Tài khoản cửa hàng: dùng cửa hàng của mình (SESSION.cuaHangMa) → thẻ TC trên trang bán hàng.
//  • Chính người là TC → có nút Chuyển + chip BẠN.
// ════════════════════════════════════════════════════════════════════
let _tcState = { tc:null, dangCa:[], maCh:'', tenCh:'', trongCa:false, gioVao:null, tcGiay:0, nvGiay:0, moLoai:null, moTu:null };
let _tcPollTimer = null;
let _tcTickTimer = null;
const TC_FLAG_SVG='<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>';

function tcToday(){ return new Date().toISOString().substring(0,10); }
function tcLaToi(){ return !!(_tcState.tc && SESSION && _tcState.tc.ma_nv===SESSION.ma); }
function tcStoreTen(){ if(_tcState.tenCh) return _tcState.tenCh; const el=document.getElementById('input-ch-display'); return el?(el.value||''):''; }

function _tcSet(maCh, data, trongCa, tenCh){
  _tcState.maCh = maCh||'';
  _tcState.tc = (data&&data.tc)?data.tc:null;
  _tcState.dangCa = (data&&Array.isArray(data.dang_ca))?data.dang_ca:[];
  _tcState.trongCa = !!trongCa;
  _tcState.tenCh = tenCh||'';
  _tcState.gioVao = (data&&data.gio_vao)||null;
  _tcState.tcGiay = (data&&Number(data.tc_giay))||0;
  _tcState.nvGiay = (data&&Number(data.nv_giay))||0;
  _tcState.moLoai = (data&&data.mo_loai)||null;
  _tcState.moTu = (data&&data.mo_tu)||null;
}

async function tcRefreshBanner(){
  tcStartPoll();
  if(!SESSION){ _tcSet('', null, false); tcRenderBanner(); tcRenderToggleState(); tcUpdateHero(); return; }
  try{
    if(SESSION.vaiTro==='CUA_HANG'){
      const maCh=SESSION.cuaHangMa||'';
      if(maCh){ const {data}=await supa.rpc('fn_truong_ca_trang_thai',{p_ma_ch:maCh,p_ngay:tcToday()}); _tcSet(maCh, data, false, SESSION.cuaHangTen||''); }
      else { _tcSet('', null, false); }
    } else {
      // NV: ưu tiên CA ĐANG MỞ (hiển thị xuyên suốt, không cần chọn cửa hàng)
      const { data:r } = await supa.rpc('fn_truong_ca_cho_nv',{p_ma_nv:SESSION.ma,p_ngay:tcToday()});
      if(r && r.trong_ca){ _tcSet(r.ma_ch, r, true, r.ten_ch); }
      else {
        // Chưa vào ca → xem trước theo cửa hàng đang chọn (nếu có)
        const el=document.getElementById('sel-cuahang'); const maCh=el?(el.value||''):'';
        if(maCh){ const {data}=await supa.rpc('fn_truong_ca_trang_thai',{p_ma_ch:maCh,p_ngay:tcToday()}); _tcSet(maCh, data, false); }
        else { _tcSet('', null, false); }
      }
    }
  }catch(e){ /* giữ trạng thái cũ */ }
  tcRenderBanner(); tcRenderToggleState(); tcUpdateHero();
}

// ── Hero "CA HÔM NAY" — đồng hồ Tổng / Trưởng ca / Nhân viên (HH:MM:SS, live) ──
function _fmtHMS(sec){ sec=Math.max(0,Math.floor(sec)); const p=n=>String(n).padStart(2,'0'); return p(Math.floor(sec/3600))+':'+p(Math.floor((sec%3600)/60))+':'+p(sec%60); }

function tcTickTimes(){
  const elT=document.getElementById('cc-hero-tong'); if(!elT) return;
  const open=_tcState.moTu ? Math.max(0,(Date.now()-new Date(_tcState.moTu).getTime())/1000) : 0;
  let tc=_tcState.tcGiay||0, nv=_tcState.nvGiay||0;
  if(_tcState.moLoai==='tc') tc+=open; else if(_tcState.moLoai==='nv') nv+=open;
  elT.textContent=_fmtHMS(tc+nv);
  const et=document.getElementById('cc-hero-tc-t'); if(et) et.textContent=_fmtHMS(tc);
  const en=document.getElementById('cc-hero-nv-t'); if(en) en.textContent=_fmtHMS(nv);
}

function tcStartTick(){
  if(_tcTickTimer) return;
  _tcTickTimer=setInterval(()=>{ if(document.visibilityState==='visible') tcTickTimes(); }, 1000);
}

function tcUpdateHero(){
  const st=document.getElementById('cc-hero-status-txt'); if(!st) return; // không ở trang chấm công
  const loc=document.getElementById('cc-hero-loc-text');
  const ts=document.getElementById('cc-hero-time-start'), te=document.getElementById('cc-hero-time-end');
  const row=document.querySelector('.cc-hero-progress-row');
  const bar=document.querySelector('.cc-hero-progress-bar');
  const pad=n=>String(n).padStart(2,'0');
  if(_tcState.trongCa && _tcState.gioVao){
    const v=new Date(_tcState.gioVao);
    st.textContent='Đang trong ca';
    if(loc) loc.textContent=_tcState.tenCh || _tcState.maCh || '--';
    if(ts) ts.textContent=pad(v.getHours())+':'+pad(v.getMinutes());
    if(te) te.textContent='đang làm';
    if(row && !document.getElementById('cc-hero-tong')){
      row.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;width:100%;font-size:11px">'
        +'<span style="opacity:.82">Tổng <b id="cc-hero-tong" style="font-size:13px;font-weight:800;font-variant-numeric:tabular-nums">00:00:00</b></span>'
        +'<span style="opacity:.82">Trưởng ca <b id="cc-hero-tc-t" style="font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;color:#FFD9A8">00:00:00</b></span>'
        +'<span style="opacity:.82">Nhân viên <b id="cc-hero-nv-t" style="font-size:13px;font-weight:800;font-variant-numeric:tabular-nums">00:00:00</b></span>'
        +'</div>';
    }
    if(bar) bar.style.display='none';
    tcTickTimes(); tcStartTick();
  } else {
    st.textContent='Chưa vào ca';
    const disp=document.getElementById('input-ch-display'); const tenCh=disp?disp.value:'';
    if(loc) loc.textContent=tenCh||'Chưa chọn cửa hàng';
    if(ts) ts.textContent='--:--'; if(te) te.textContent='--:--';
    if(row) row.innerHTML='<span>Đã làm <b>--</b></span><span>Còn <b class="cc-hero-progress-hl">--</b></span>';
    if(bar){ bar.style.display=''; const f=document.getElementById('cc-hero-progress-fill'); if(f) f.style.width='0%'; }
  }
}

// ── Thẻ chức danh Trưởng ca (gradient + 2 bong bóng tròn như header) ──
function tcCardHtml(coNutChuyen){
  const ten = escHtml((_tcState.tc && _tcState.tc.ten) || '');
  const chipBan = coNutChuyen ? '<span style="display:inline-block;font-size:9.5px;font-weight:800;letter-spacing:.04em;color:#fff;background:rgba(255,255,255,.26);padding:2px 7px;border-radius:7px;margin-left:9px;vertical-align:2px">BẠN</span>' : '';
  const nut = coNutChuyen ? '<button onclick="tcOpenTransfer()" style="flex:none;border:none;border-radius:12px;padding:10px 15px;font-size:13px;font-weight:800;color:#C2410C;background:#fff;cursor:pointer;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.16)">Chuyển</button>' : '';
  return `<div style="position:relative;overflow:hidden;background:linear-gradient(135deg,#F97316,#C2410C);border-radius:18px;padding:16px 18px;box-shadow:0 8px 24px rgba(194,65,12,.30)">
    <div style="position:absolute;right:-26px;top:-26px;width:124px;height:124px;border-radius:50%;background:rgba(255,255,255,.13)"></div>
    <div style="position:absolute;right:36px;top:24px;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.10)"></div>
    <div style="position:relative;z-index:1;display:flex;align-items:center;gap:13px">
      <div style="flex:none;width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px">${TC_FLAG_SVG}</svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:800;letter-spacing:.13em;color:rgba(255,255,255,.85);text-transform:uppercase">Trưởng ca · Phụ trách cửa hàng</div>
        <div style="font-size:18px;font-weight:800;color:#fff;margin-top:3px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ten}${chipBan}</div>
      </div>
      ${nut}
    </div>
  </div>`;
}

function tcRenderBanner(){
  const has = !!_tcState.tc;
  const elNV = document.getElementById('tc-banner');
  const elCH = document.getElementById('tc-banner-ch');
  if(elNV){
    if(has){ elNV.style.display='block'; elNV.innerHTML = tcCardHtml(tcLaToi()); }
    else { elNV.style.display='none'; elNV.innerHTML=''; }
  }
  if(elCH){
    const isCH = !!(SESSION && SESSION.vaiTro==='CUA_HANG');
    if(has && isCH){ elCH.style.display='block'; elCH.innerHTML = tcCardHtml(false); }
    else { elCH.style.display='none'; elCH.innerHTML=''; }
  }
}

function tcRenderToggleState(){
  const tg=document.getElementById('tc-toggle'); if(!tg) return;
  if(_tcState.tc){ tg.style.display='none'; const cb=document.getElementById('tc-checkbox'); if(cb) cb.checked=false; }
  else { tg.style.display=''; }
}

function _tcOnRelevantPage(){
  const cc=document.getElementById('page-chamcong'); const bh=document.getElementById('page-banhang');
  return (cc&&cc.classList.contains('active')) || (bh&&bh.classList.contains('active'));
}
function tcStartPoll(){
  if(_tcPollTimer) return;
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && SESSION && _tcOnRelevantPage()) tcRefreshBanner(); });
  _tcPollTimer=setInterval(()=>{
    if(document.visibilityState==='visible' && SESSION && _tcOnRelevantPage()) tcRefreshBanner();
  }, 60000);
}

// Gọi từ doSubmit — kiểm tra TC ĐÚNG thời điểm chấm → chỉ hỏi khi ca CHƯA có Trưởng ca
let _tcSubmitGuard=false;
async function tcCheckDialogBeforeSubmit(proceed){
  if(_tcSubmitGuard) return;
  _tcSubmitGuard=true;
  const cb=document.getElementById('tc-checkbox');
  const go=()=>{ _tcSubmitGuard=false; proceed(); setTimeout(tcRefreshBanner, 3500); };
  const loai=(typeof state!=='undefined' && state) ? state.loai : '';
  // [v17.38] RA CA: nếu mình đang là Trưởng ca → nhắc chuyển cho người khác trước khi ra ca
  if(loai==='Ra ca'){
    try{ await tcRefreshBanner(); }catch(e){}
    if(tcLaToi()){
      const others=(_tcState.dangCa||[]).filter(p=>p.ma_nv!==SESSION.ma);
      if(others.length){ tcAskRaCaTransfer(others, go, ()=>{ _tcSubmitGuard=false; }); return; }
    }
    go(); return;
  }
  if(loai!=='Vào ca'){ go(); return; }
  // [v17.37] VÀO CA: luôn kiểm tra lại Trưởng ca của cửa hàng ĐANG chấm — tránh tạo Trưởng ca thứ 2
  try{ await tcRefreshBanner(); }catch(e){}
  if(_tcState.tc){
    if(!tcLaToi()){
      if(cb) cb.checked=false;  // ép vai trò nhân viên dù nút có gạt
      if(typeof showToast==='function') showToast('Cửa hàng đã có Trưởng ca: '+((_tcState.tc&&_tcState.tc.ten)||'')+'. Bạn vào ca với vai trò nhân viên.','info');
    }
    go(); return;  // đã có TC → không hỏi dialog nữa
  }
  if(cb && cb.checked){ go(); return; }  // chưa có TC + người dùng tự gạt nút → làm Trưởng ca
  tcAskDialog(()=>{ if(cb) cb.checked=true; go(); }, ()=>{ if(cb) cb.checked=false; go(); });
}

function tcCloseModal(){ const m=document.getElementById('tc-modal-root'); if(m) m.remove(); }

function tcAskDialog(onYes, onNo){
  tcCloseModal();
  const root=document.createElement('div'); root.id='tc-modal-root';
  root.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.5);display:flex;align-items:flex-end;justify-content:center';
  root.innerHTML=`<div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:22px 20px 26px">
    <div style="width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,#F97316,#C2410C);display:flex;align-items:center;justify-content:center;margin-bottom:14px">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:25px;height:25px">${TC_FLAG_SVG}</svg>
    </div>
    <div style="font-size:18px;font-weight:800;color:#0F2E45">Bạn có phải Trưởng ca hiện tại không?</div>
    <div style="font-size:13px;color:#64748B;margin-top:6px;line-height:1.5">Ca này chưa có Trưởng ca. Chọn "Là Trưởng ca" nếu bạn chịu trách nhiệm chính trong ca.</div>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button id="tc-ask-no" style="flex:1;padding:14px;border:1.5px solid #E2E8F0;border-radius:13px;background:#fff;color:#64748B;font-size:15px;font-weight:700;cursor:pointer">Không</button>
      <button id="tc-ask-yes" style="flex:1;padding:14px;border:none;border-radius:13px;background:linear-gradient(135deg,#F97316,#C2410C);color:#fff;font-size:15px;font-weight:800;cursor:pointer">Là Trưởng ca</button>
    </div>
  </div>`;
  document.body.appendChild(root);
  document.getElementById('tc-ask-yes').onclick=()=>{ tcCloseModal(); onYes&&onYes(); };
  document.getElementById('tc-ask-no').onclick=()=>{ tcCloseModal(); onNo&&onNo(); };
}

function tcOpenTransfer(){
  tcCloseModal();
  const others=(_tcState.dangCa||[]).filter(p=>p.ma_nv!==SESSION.ma);
  const root=document.createElement('div'); root.id='tc-modal-root';
  root.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.5);display:flex;align-items:flex-end;justify-content:center';
  const list=others.length
    ? others.map(p=>`<button onclick="tcDoTransfer('${escHtml(p.ma_nv)}',this.getAttribute('data-ten'))" data-ten="${escHtml(p.ten||p.ma_nv)}" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:13px 12px;border:1px solid #E6EBF0;border-radius:13px;background:#fff;cursor:pointer;margin-bottom:8px">
        <div style="flex:none;width:36px;height:36px;border-radius:10px;background:#FFF7ED;color:#C2410C;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px">${escHtml((p.ten||'?').trim().charAt(0)||'?')}</div>
        <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700;color:#0F2E45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.ten||p.ma_nv)}</div><div style="font-size:11px;color:#94A3B8">${escHtml(p.ma_nv)} · đang trong ca</div></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="2.4" style="width:18px;height:18px;flex:none"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`).join('')
    : '<div style="text-align:center;color:#94A3B8;font-size:13px;padding:24px 8px;line-height:1.5">Chưa có nhân viên nào khác đang trong ca tại cửa hàng này để nhận Trưởng ca.</div>';
  root.innerHTML=`<div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px 18px 24px;max-height:80vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div style="font-size:18px;font-weight:800;color:#0F2E45">Chuyển Trưởng ca</div>
      <button onclick="tcCloseModal()" style="border:none;background:#F1F5F9;width:32px;height:32px;border-radius:10px;font-size:18px;color:#64748B;cursor:pointer">×</button>
    </div>
    <div style="font-size:12.5px;color:#64748B;margin-bottom:16px;line-height:1.5">Chọn người nhận (phải đang trong ca tại cửa hàng). Người nhận thành Trưởng ca ngay, hệ thống tự chốt giờ.</div>
    ${list}</div>`;
  document.body.appendChild(root);
}

async function tcDoTransfer(denMaNv, denTen){
  tcCloseModal();  // đóng bảng chọn TRƯỚC khi hỏi xác nhận (tránh 2 modal chồng nhau)
  const ok=await appConfirm('Chuyển Trưởng ca cho '+denTen+'?\nBạn sẽ trở lại vai trò nhân viên thường, hệ thống tự chốt giờ.', { title:'Chuyển Trưởng ca', okLabel:'Chuyển' });
  if(!ok) return;
  try{
    const { data, error } = await supa.rpc('fn_chuyen_truong_ca', {
      p_tu_ma_nv:SESSION.ma, p_tu_ten:SESSION.ten,
      p_den_ma_nv:denMaNv, p_den_ten:denTen,
      p_ma_ch:_tcState.maCh, p_ten_ch:tcStoreTen()
    });
    if(error||!data||!data.success){ showToast((data&&data.error)||(error&&error.message)||'Lỗi chuyển Trưởng ca','err'); return; }
    showToast('✓ Đã chuyển Trưởng ca cho '+denTen,'ok');
    tcRefreshBanner();
  }catch(e){ showToast('Lỗi kết nối','err'); }
}

// ════════════════════════════════════════════════════════════════════
// [v17.38] RA CA khi đang là Trưởng ca → nhắc chuyển cho người đang trong ca
// ════════════════════════════════════════════════════════════════════
let _tcRaCtx=null;
function tcAskRaCaTransfer(others, go, cancel){
  _tcRaCtx={go,cancel};
  tcCloseModal();
  const root=document.createElement('div'); root.id='tc-modal-root';
  root.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.5);display:flex;align-items:flex-end;justify-content:center';
  const list=others.map(p=>`<button onclick="tcRaCaPick('${escHtml(p.ma_nv)}',this.getAttribute('data-ten'))" data-ten="${escHtml(p.ten||p.ma_nv)}" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:13px 12px;border:1px solid #E6EBF0;border-radius:13px;background:#fff;cursor:pointer;margin-bottom:8px">
      <div style="flex:none;width:36px;height:36px;border-radius:10px;background:#FFF7ED;color:#C2410C;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px">${escHtml((p.ten||'?').trim().charAt(0)||'?')}</div>
      <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700;color:#0F2E45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.ten||p.ma_nv)}</div><div style="font-size:11px;color:#94A3B8">${escHtml(p.ma_nv)} · đang trong ca</div></div>
      <svg viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="2.4" style="width:18px;height:18px;flex:none"><polyline points="9 18 15 12 9 6"/></svg>
    </button>`).join('');
  root.innerHTML=`<div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px 18px 24px;max-height:80vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div style="font-size:18px;font-weight:800;color:#0F2E45">Bạn đang là Trưởng ca</div>
      <button onclick="tcRaCaCancel()" style="border:none;background:#F1F5F9;width:32px;height:32px;border-radius:10px;font-size:18px;color:#64748B;cursor:pointer">×</button>
    </div>
    <div style="font-size:12.5px;color:#64748B;margin-bottom:16px;line-height:1.5">Chuyển Trưởng ca cho người đang trong ca rồi ra ca, để cửa hàng không bị trống vai trò. Hoặc ra ca luôn.</div>
    ${list}
    <button onclick="tcRaCaSkip()" style="width:100%;padding:13px;border:1.5px solid #E2E8F0;border-radius:13px;background:#fff;color:#475569;font-size:14px;font-weight:700;cursor:pointer;margin-top:4px">Ra ca, không chuyển</button>
  </div>`;
  document.body.appendChild(root);
}
async function tcRaCaPick(denMaNv, denTen){
  const ctx=_tcRaCtx; tcCloseModal();
  try{
    const { data, error } = await supa.rpc('fn_chuyen_truong_ca', {
      p_tu_ma_nv:SESSION.ma, p_tu_ten:SESSION.ten,
      p_den_ma_nv:denMaNv, p_den_ten:denTen,
      p_ma_ch:_tcState.maCh, p_ten_ch:tcStoreTen()
    });
    if(error||!data||!data.success){ showToast((data&&data.error)||(error&&error.message)||'Lỗi chuyển Trưởng ca','err'); if(ctx)ctx.cancel(); return; }
    showToast('✓ Đã chuyển Trưởng ca cho '+denTen+', đang ra ca...','ok');
  }catch(e){ showToast('Lỗi kết nối','err'); if(ctx)ctx.cancel(); return; }
  if(ctx) ctx.go();   // tiếp tục ghi Ra ca cho mình
}
function tcRaCaSkip(){ const ctx=_tcRaCtx; tcCloseModal(); if(ctx) ctx.go(); }
function tcRaCaCancel(){ const ctx=_tcRaCtx; tcCloseModal(); if(ctx) ctx.cancel(); }

// ════════════════════════════════════════════════════════════════════
// [v17.38] GIÁM SÁT TRƯỞNG CA TOÀN CHUỖI (QL/Admin)
// ════════════════════════════════════════════════════════════════════
let _tcGsData=null, _tcGsKhu='all';
function tcOpenGiamSat(){
  let ov=document.getElementById('tcgs-overlay');
  if(!ov){ ov=document.createElement('div'); ov.id='tcgs-overlay'; document.body.appendChild(ov); }
  ov.style.cssText='position:fixed;inset:0;z-index:9000;background:#F1F5F9;display:flex;flex-direction:column';
  ov.innerHTML=`
    <div style="background:linear-gradient(135deg,#F97316,#C2410C);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,.12)">
      <div style="font-weight:800;font-size:16px">Giám sát Trưởng ca</div>
      <div style="display:flex;gap:8px">
        <button onclick="tcGsReload()" style="background:rgba(255,255,255,.18);border:none;color:#fff;height:32px;padding:0 12px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Tải lại</button>
        <button onclick="document.getElementById('tcgs-overlay').remove()" style="background:rgba(255,255,255,.18);border:none;color:#fff;width:32px;height:32px;border-radius:8px;font-size:16px;cursor:pointer">✕</button>
      </div>
    </div>
    <div id="tcgs-body" style="flex:1;overflow-y:auto;padding:14px;-webkit-overflow-scrolling:touch">
      <div style="text-align:center;color:#64748B;padding:30px">Đang tải...</div>
    </div>`;
  _tcGsKhu='all'; tcGsReload();
}
async function tcGsReload(){
  const body=document.getElementById('tcgs-body'); if(!body) return;
  body.innerHTML='<div style="text-align:center;color:#64748B;padding:30px">Đang tải...</div>';
  try{
    const { data, error } = await supa.rpc('fn_truong_ca_toan_chuoi',{p_ngay:tcToday()});
    if(error||!data){ body.innerHTML='<div style="text-align:center;color:#DC2626;padding:30px">Lỗi tải dữ liệu.</div>'; return; }
    _tcGsData=data; tcGsRender();
  }catch(e){ body.innerHTML='<div style="text-align:center;color:#DC2626;padding:30px">Lỗi kết nối.</div>'; }
}
function tcGsSetKhu(v){ _tcGsKhu=v||'all'; tcGsRender(); }
function tcGsRender(){
  const body=document.getElementById('tcgs-body'); if(!body||!_tcGsData) return;
  const all=Array.isArray(_tcGsData.cua_hang)?_tcGsData.cua_hang:[];
  const khus=[...new Set(all.map(s=>s.khu_vuc).filter(k=>k&&k!=='—'))].sort();
  const list=(_tcGsKhu==='all')?all:all.filter(s=>s.khu_vuc===_tcGsKhu);
  const cntCo=list.filter(s=>(s.so_tc||0)>=1).length, cntChua=list.filter(s=>(s.so_tc||0)===0).length, cntLoi=list.filter(s=>(s.so_tc||0)>=2).length;
  const chip=(label,val,color)=>`<div style="flex:1;background:#fff;border-radius:12px;padding:10px 6px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)"><div style="font-size:19px;font-weight:800;color:${color}">${val}</div><div style="font-size:10px;color:#64748B;margin-top:2px">${label}</div></div>`;
  let html=`<div style="display:flex;gap:7px;margin-bottom:12px">
    ${chip('CH đang mở', list.length, '#0F2E45')}
    ${chip('Có TC', cntCo, '#059669')}
    ${chip('Chưa có TC', cntChua, '#D97706')}
    ${chip('Lỗi 2+ TC', cntLoi, '#DC2626')}
  </div>`;
  if(khus.length>1){
    html+=`<select onchange="tcGsSetKhu(this.value)" style="width:100%;padding:11px 12px;border:1px solid #E2E8F0;border-radius:11px;background:#fff;font-size:14px;color:#0F2E45;margin-bottom:12px">
      <option value="all"${_tcGsKhu==='all'?' selected':''}>Mọi khu vực (${all.length} cửa hàng)</option>
      ${khus.map(k=>`<option value="${escHtml(k)}"${_tcGsKhu===k?' selected':''}>${escHtml(k)}</option>`).join('')}
    </select>`;
  }
  if(!list.length){ html+='<div style="text-align:center;color:#94A3B8;padding:30px">Không có cửa hàng nào đang mở ca.</div>'; body.innerHTML=html; return; }
  html+=list.map(s=>{
    const n=s.so_tc||0;
    const badge = n>=2 ? `<span style="background:#FEE2E2;color:#DC2626;font-weight:800;font-size:12px;padding:4px 10px;border-radius:9px;white-space:nowrap">${n} TC ⚠</span>`
      : n===1 ? `<span style="background:#D1FAE5;color:#059669;font-weight:800;font-size:12px;padding:4px 10px;border-radius:9px;white-space:nowrap">1 TC</span>`
      : `<span style="background:#F1F5F9;color:#94A3B8;font-weight:700;font-size:12px;padding:4px 10px;border-radius:9px;white-space:nowrap">Chưa có TC</span>`;
    const tcLines=(Array.isArray(s.ds_tc)&&s.ds_tc.length)
      ? '<div style="margin-top:9px;padding-top:9px;border-top:1px solid #F1F5F9;display:flex;flex-direction:column;gap:5px">'+s.ds_tc.map(t=>`<div style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:#334155"><svg viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="2.2" style="width:14px;height:14px;flex:none">${TC_FLAG_SVG}</svg><b style="font-weight:700">${escHtml(t.ten||'')}</b><span style="color:#94A3B8">· vào ${escHtml(t.gio_vao||'--')}</span></div>`).join('')+'</div>'
      : '';
    const border = n>=2 ? 'border:1.5px solid #FCA5A5' : n===0 ? 'border:1px solid #FDE68A' : 'border:1px solid #E6EBF0';
    return `<div style="background:#fff;border-radius:14px;padding:13px 14px;margin-bottom:9px;${border}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:14.5px;font-weight:700;color:#0F2E45">${escHtml(s.ten_ch||s.ma_ch)}</div>
          <div style="font-size:11.5px;color:#94A3B8;margin-top:2px">${escHtml(s.ma_ch)}${s.khu_vuc&&s.khu_vuc!=='—'?' · '+escHtml(s.khu_vuc):''} · ${s.so_dang_ca||0} người trong ca</div>
        </div>
        ${badge}
      </div>
      ${tcLines}
    </div>`;
  }).join('');
  body.innerHTML=html;
}
