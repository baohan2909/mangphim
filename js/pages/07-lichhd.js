// ════════════════════════════════════════════════════════════════════
// [v17.25] LỊCH HOẠT ĐỘNG CỬA HÀNG — nhập GIỜ mở/đóng từng ngày
//  - Cửa hàng: đặt nhanh cả tuần + chỉnh giờ bắt đầu/kết thúc từng ngày + lịch sử
//  - Admin/BQL: lưới toàn hệ thống (CH × 7 ngày, hiển thị khung giờ) + bộ lọc
//  Mỗi ngày: {ngay, thu, gio_bd:'HH:MM', gio_kt:'HH:MM'}  (lich jsonb — không đổi bảng)
// ════════════════════════════════════════════════════════════════════

// ── Helpers tuần ISO + giờ ────────────────────────────────────────
function lhdMondayOf(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function lhdAddDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function lhdFmtDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function lhd7Days(monday){ const nm=['T2','T3','T4','T5','T6','T7','CN']; const out=[]; for(let i=0;i<7;i++){ const d=lhdAddDays(monday,i); out.push({ngay:lhdFmtDate(d),thu:i+2,dow:nm[i],ngayNum:d.getDate(),thang:d.getMonth()+1}); } return out; }
function lhdISOWeek(monday){
  const d=new Date(Date.UTC(monday.getFullYear(),monday.getMonth(),monday.getDate()));
  d.setUTCDate(d.getUTCDate()+3);
  let ft=new Date(Date.UTC(d.getUTCFullYear(),0,4));
  ft.setUTCDate(ft.getUTCDate()-((ft.getUTCDay()+6)%7)+3);
  const w=1+Math.round((d-ft)/(7*86400000));
  return d.getUTCFullYear()+'-W'+String(w).padStart(2,'0');
}
function lhdRangeLabel(days){ const a=days[0],b=days[6]; const p=n=>String(n).padStart(2,'0'); return `${p(a.ngayNum)}/${p(a.thang)} – ${p(b.ngayNum)}/${p(b.thang)}`; }
function lhdTuanLabel(tuan){ if(!tuan) return ''; const m=String(tuan).match(/W(\d+)/); return 'Tuần '+(m?parseInt(m[1]):tuan); }
function lhdFmtDT(t){ if(!t) return ''; const d=new Date(t); const p=n=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function lhdRelLabel(monday){ const cur=lhdMondayOf(new Date()); const diff=Math.round((monday-cur)/(7*86400000)); return diff===0?'Tuần này':diff===1?'Tuần kế tiếp':lhdTuanLabel(lhdISOWeek(monday)); }
function lhdHrShort(t){ if(!t) return ''; const a=String(t).split(':'); const h=parseInt(a[0]||'0'); const m=a[1]||'00'; return (m&&m!=='00')?(h+':'+m):String(h); }
function lhdDurMin(bd,kt){ if(!bd||!kt) return 0; const a=bd.split(':').map(Number),b=kt.split(':').map(Number); let d=(b[0]*60+b[1])-(a[0]*60+a[1]); if(d<0)d+=1440; return d; }

// ════════════════════════════════════════════════════════════════
//  CỬA HÀNG
// ════════════════════════════════════════════════════════════════
let lhdSelMonday=null, lhdTuan='', lhdEdit={}, lhdData=null, lhdSub='dangky', lhdQuickBd='08:00', lhdQuickKt='22:00';
const LHD_TIME_INP='width:100%;min-width:0;box-sizing:border-box;border:1.5px solid #C7EBD9;border-radius:11px;padding:11px 8px;font-size:16px;font-weight:800;color:#06382f;background:#F2FBF7;accent-color:#0F6E56;text-align:center';

function moLichHD(){ goToPage('lichhd-ch'); lhdSub='dangky'; lhdSelMonday=lhdAddDays(lhdMondayOf(new Date()),7); taiLichHD(); }

function lhdDoiTuan(delta){
  const cur=lhdMondayOf(new Date()); const next=lhdAddDays(cur,7);
  let m=lhdAddDays(lhdSelMonday, delta*7);
  if(m<cur) m=cur; if(m>next) m=next;
  lhdSelMonday=m; taiLichHD();
}

function lhdRenderSubtabs(){
  const el=document.getElementById('lhd-subtabs'); if(!el) return;
  const b=(a)=>`flex:1;padding:11px;border:none;border-bottom:2.5px solid ${a?'#0F6E56':'transparent'};background:none;font-size:13.5px;font-weight:800;color:${a?'#06382f':'#9AA7B2'};cursor:pointer;letter-spacing:.01em`;
  el.innerHTML=`<button onclick="lhdSetSub('dangky')" style="${b(lhdSub==='dangky')}">Đăng ký lịch</button>
    <button onclick="lhdSetSub('lichsu')" style="${b(lhdSub==='lichsu')}">Lịch sử</button>`;
}
window.lhdSetSub=function(s){ lhdSub=s; taiLichHD(); };

async function taiLichHD(){
  lhdRenderSubtabs();
  const cont=document.getElementById('lhd-content'); if(!cont) return;
  if(lhdSub==='lichsu') return taiLichHDLichSu();
  const maCH=SESSION&&SESSION.cuaHangMa;
  if(!maCH){ cont.innerHTML='<div class="ns-empty">Tài khoản này không gắn với cửa hàng nào.</div>'; return; }
  cont.innerHTML='<div class="ns-empty">⏳ Đang tải...</div>';
  lhdTuan=lhdISOWeek(lhdSelMonday);
  try{
    const {data,error}=await supa.rpc('fn_get_lich_hd_ch',{p_ma_ch:maCH,p_tuan:lhdTuan});
    if(error) throw error;
    lhdData=data||{};
    const days=lhd7Days(lhdSelMonday);
    const saved=Array.isArray(lhdData.lich)?lhdData.lich:null;
    lhdEdit={};
    days.forEach(dd=>{ const f=saved?saved.find(x=>x.ngay===dd.ngay):null;
      lhdEdit[dd.ngay]=f?{gio_bd:(f.gio_bd||''),gio_kt:(f.gio_kt||'')}:{gio_bd:'08:00',gio_kt:'22:00'}; });
    renderLichHD();
  }catch(e){ cont.innerHTML=`<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`; }
}

function setLHDTime(ngay,field,val){ if(!lhdEdit[ngay])lhdEdit[ngay]={}; lhdEdit[ngay][field]=val; lhdUpdateSummary(); }

function lhdApplyAll(){
  if(!lhdQuickBd||!lhdQuickKt){ showToast('Chọn giờ bắt đầu và kết thúc.','warn'); return; }
  lhd7Days(lhdSelMonday).forEach(dd=>{ lhdEdit[dd.ngay]={gio_bd:lhdQuickBd,gio_kt:lhdQuickKt}; });
  renderLichHD(); showToast('✓ Đã áp dụng cho cả tuần','ok');
}

function lhdUpdateSummary(){
  const el=document.getElementById('lhd-total'); if(!el) return;
  const days=lhd7Days(lhdSelMonday); let mins=0,filled=0;
  days.forEach(dd=>{ const e=lhdEdit[dd.ngay]||{}; const m=lhdDurMin(e.gio_bd,e.gio_kt); if(m>0){mins+=m;filled++;} });
  el.textContent=`${filled}/7 ngày có giờ · ${(mins/60).toFixed(mins%60?1:0)} giờ/tuần`;
}

function renderLichHD(){
  const cont=document.getElementById('lhd-content'); if(!cont) return;
  const days=lhd7Days(lhdSelMonday);
  const submitted=lhdData&&lhdData.submitted_at;
  const cur=lhdMondayOf(new Date()); const next=lhdAddDays(cur,7);
  const canPrev=lhdSelMonday>cur, canNext=lhdSelMonday<next;
  const navBtn=(en,dir)=>`<button onclick="lhdDoiTuan(${dir})" ${en?'':'disabled'} style="flex:none;width:38px;height:38px;border-radius:12px;border:1px solid ${en?'#D7E3DD':'#EEF2F5'};background:${en?'#fff':'#F6F8F9'};color:${en?'#0F6E56':'#CBD5E1'};font-size:18px;cursor:${en?'pointer':'default'}">${dir<0?'‹':'›'}</button>`;
  cont.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      ${navBtn(canPrev,-1)}
      <div style="flex:1;text-align:center;background:#F2FBF7;border:1px solid #C7EBD9;border-radius:14px;padding:9px 10px">
        <div style="font-size:11px;color:#0F6E56;font-weight:800;letter-spacing:.05em">${lhdRelLabel(lhdSelMonday).toUpperCase()}</div>
        <div style="font-size:16px;font-weight:800;color:#06382f;margin-top:1px">${lhdRangeLabel(days)}</div>
      </div>
      ${navBtn(canNext,1)}
    </div>

    <div style="background:linear-gradient(135deg,#1D9E75,#0F6E56);border-radius:16px;padding:14px;margin-bottom:14px;box-shadow:0 6px 18px rgba(6,56,47,.22)">
      <div style="font-size:11px;font-weight:800;color:rgba(255,255,255,.82);letter-spacing:.06em;margin-bottom:9px">ĐẶT NHANH CHO CẢ TUẦN</div>
      <div style="display:flex;align-items:center;gap:8px">
        <input type="time" value="${lhdQuickBd}" onchange="lhdQuickBd=this.value" style="flex:1;min-width:0;box-sizing:border-box;border:none;border-radius:11px;padding:11px 6px;font-size:16px;font-weight:800;color:#06382f;background:#fff;text-align:center;accent-color:#0F6E56">
        <span style="color:rgba(255,255,255,.6);font-size:16px">→</span>
        <input type="time" value="${lhdQuickKt}" onchange="lhdQuickKt=this.value" style="flex:1;min-width:0;box-sizing:border-box;border:none;border-radius:11px;padding:11px 6px;font-size:16px;font-weight:800;color:#06382f;background:#fff;text-align:center;accent-color:#0F6E56">
        <button onclick="lhdApplyAll()" style="flex:none;border:none;border-radius:11px;padding:11px 14px;font-size:13.5px;font-weight:800;color:#0F6E56;background:#fff;cursor:pointer;white-space:nowrap">Áp dụng</button>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:9px">${days.map(dd=>lhdDayRow(dd)).join('')}</div>

    <div style="margin-top:14px;text-align:center">
      <div id="lhd-total" style="font-size:13px;color:#475569;font-weight:600"></div>
      ${submitted?`<div style="font-size:11.5px;color:#0F6E56;margin-top:3px">Đã gửi ${lhdFmtDT(lhdData.submitted_at)}</div>`:''}
    </div>
    <button id="lhd-submit" onclick="guiLichHD()" style="width:100%;margin-top:12px;padding:15px;border:none;border-radius:14px;background:linear-gradient(135deg,#1D9E75,#0F6E56);color:#fff;font-size:15px;font-weight:800;letter-spacing:.02em;cursor:pointer;box-shadow:0 5px 16px rgba(6,56,47,.28)">
      ${submitted?'Cập nhật lịch tuần':'Gửi lịch tuần'}
    </button>
    <div style="margin-top:10px;font-size:11.5px;color:#9AA7B2;text-align:center;line-height:1.55">Hoàn tất đăng ký tuần kế tiếp trước Chủ Nhật · có thể chỉnh lại trong tuần khi cần</div>`;
  lhdUpdateSummary();
}

function lhdDayRow(dd){
  const e=lhdEdit[dd.ngay]||{}; const bd=e.gio_bd||'', kt=e.gio_kt||''; const p=n=>String(n).padStart(2,'0');
  return `<div style="display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #E6EBF0;border-radius:16px;padding:11px;box-shadow:0 1px 2px rgba(6,56,47,.05)">
    <div style="flex:none;width:50px;height:54px;border-radius:13px;background:linear-gradient(135deg,#1D9E75,#0F6E56);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div style="font-size:15px;font-weight:800;line-height:1">${dd.dow}</div>
      <div style="font-size:10px;opacity:.85;margin-top:3px">${p(dd.ngayNum)}/${p(dd.thang)}</div>
    </div>
    <div style="flex:1;min-width:0;display:flex;align-items:flex-end;gap:7px">
      <div style="flex:1;min-width:0">
        <div style="font-size:9.5px;color:#9AA7B2;font-weight:700;margin:0 0 4px 2px;letter-spacing:.04em">BẮT ĐẦU</div>
        <input type="time" value="${bd}" onchange="setLHDTime('${dd.ngay}','gio_bd',this.value)" style="${LHD_TIME_INP}">
      </div>
      <div style="flex:none;color:#CBD5E1;font-size:15px;padding-bottom:11px">→</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:9.5px;color:#9AA7B2;font-weight:700;margin:0 0 4px 2px;letter-spacing:.04em">KẾT THÚC</div>
        <input type="time" value="${kt}" onchange="setLHDTime('${dd.ngay}','gio_kt',this.value)" style="${LHD_TIME_INP}">
      </div>
    </div>
  </div>`;
}

async function guiLichHD(){
  const btn=document.getElementById('lhd-submit');
  const maCH=SESSION&&SESSION.cuaHangMa;
  if(!maCH){ showToast('Tài khoản không gắn cửa hàng.','err'); return; }
  const days=lhd7Days(lhdSelMonday);
  const lich=days.map(dd=>{ const e=lhdEdit[dd.ngay]||{}; return {ngay:dd.ngay,thu:dd.thu,gio_bd:(e.gio_bd||null),gio_kt:(e.gio_kt||null)}; });
  if(btn){ btn.disabled=true; btn.textContent='Đang gửi...'; }
  try{
    const {data,error}=await supa.rpc('fn_gui_lich_hd_ch',{
      p_ma_ch:maCH, p_ten_ch:(SESSION.cuaHangTen||''), p_khu_vuc:(window.SESSION_KV||null),
      p_tuan:lhdTuan, p_lich:lich, p_nguoi_gui_ma:SESSION.ma, p_nguoi_gui_ten:SESSION.ten
    });
    if(error||!data||!data.success){ showToast((data&&data.error)||(error&&error.message)||'Lỗi gửi lịch.','err'); if(btn){btn.disabled=false;btn.textContent='Gửi lịch tuần';} return; }
    showToast('✓ Đã gửi lịch hoạt động','ok');
    taiLichHD();
  }catch(e){ showToast('Lỗi kết nối.','err'); if(btn){btn.disabled=false;btn.textContent='Gửi lịch tuần';} }
}

async function taiLichHDLichSu(){
  const cont=document.getElementById('lhd-content'); if(!cont) return;
  const maCH=SESSION&&SESSION.cuaHangMa;
  if(!maCH){ cont.innerHTML='<div class="ns-empty">Tài khoản không gắn cửa hàng.</div>'; return; }
  cont.innerHTML='<div class="ns-empty">⏳ Đang tải...</div>';
  try{
    const {data,error}=await supa.rpc('fn_lich_hd_ch_lichsu',{p_ma_ch:maCH,p_limit:30});
    if(error) throw error;
    const arr=Array.isArray(data)?data:[];
    if(!arr.length){ cont.innerHTML='<div class="ns-empty">Chưa có lịch sử đăng ký.</div>'; return; }
    cont.innerHTML=arr.map(w=>lhdHistoryCard(w)).join('');
  }catch(e){ cont.innerHTML=`<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`; }
}

function lhdHistoryCard(w){
  const lich=Array.isArray(w.lich)?w.lich:[]; const nm=['T2','T3','T4','T5','T6','T7','CN'];
  return `<div style="background:#fff;border:1px solid #E6EBF0;border-radius:16px;padding:13px 14px;margin-bottom:10px;box-shadow:0 1px 2px rgba(6,56,47,.04)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
      <div style="font-size:14px;font-weight:800;color:#06382f">${lhdTuanLabel(w.tuan)} <span style="font-size:11px;color:#9AA7B2;font-weight:500">(${escHtml(w.tuan||'')})</span></div>
      <div style="font-size:11px;color:#9AA7B2">${w.submitted_at?lhdFmtDT(w.submitted_at):''}</div>
    </div>
    <div style="display:flex;gap:5px">${nm.map((n,i)=>{ const d=lich.find(x=>x.thu===i+2)||lich[i]; const bd=d&&d.gio_bd,kt=d&&d.gio_kt; const has=bd&&kt;
      return `<div style="flex:1;text-align:center"><div style="font-size:10px;color:#9AA7B2;margin-bottom:4px;font-weight:600">${n}</div><div style="padding:7px 1px;border-radius:8px;font-size:10.5px;font-weight:800;background:${has?'#ECFDF5':'#F4F6F8'};color:${has?'#047857':'#C0C9D0'}">${has?lhdHrShort(bd)+'<span style="color:#A7F3D0">-</span>'+lhdHrShort(kt):'–'}</div></div>`; }).join('')}</div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════
//  ADMIN / BQL — lưới toàn hệ thống
// ════════════════════════════════════════════════════════════════
let lhdqlMonday=null, lhdqlTuan='', lhdqlKV='', lhdqlQ='', lhdqlData=[];

function moLichHDQL(){ goToPage('lichhd-ql'); lhdqlMonday=lhdAddDays(lhdMondayOf(new Date()),7); lhdqlKV=''; lhdqlQ=''; taiLichHDQL(); }
function lhdqlDoiTuan(delta){ lhdqlMonday=lhdAddDays(lhdqlMonday,delta*7); taiLichHDQL(); }
window.lhdqlSetKV=function(v){ lhdqlKV=v; renderLichHDQL(); };

async function taiLichHDQL(){
  const cont=document.getElementById('lhdql-content'); if(!cont) return;
  lhdqlTuan=lhdISOWeek(lhdqlMonday);
  cont.innerHTML=lhdqlFilterBar()+'<div class="ns-empty">⏳ Đang tải...</div>';
  try{
    const {data,error}=await supa.rpc('fn_lich_hd_ch_all',{p_tuan:lhdqlTuan,p_khu_vuc:null});
    if(error) throw error;
    lhdqlData=Array.isArray(data)?data:[];
    renderLichHDQL();
  }catch(e){ cont.innerHTML=lhdqlFilterBar()+`<div class="ns-empty" style="color:#DC2626">Lỗi: ${escHtml(e.message)}</div>`; }
}

function lhdqlFilterBar(){
  const days=lhd7Days(lhdqlMonday);
  const kvs=[...new Set(lhdqlData.map(r=>r.khu_vuc).filter(Boolean))].sort();
  const sel='border:1px solid #D7E3DD;border-radius:11px;padding:9px 11px;font-size:12.5px;background:#fff;color:#334155';
  const navB=d=>`<button onclick="lhdqlDoiTuan(${d})" style="border:1px solid #D7E3DD;background:#fff;border-radius:11px;width:36px;height:36px;cursor:pointer;font-size:17px;color:#0F6E56;flex:none">${d<0?'‹':'›'}</button>`;
  return `<div style="display:flex;flex-direction:column;gap:9px;margin-bottom:4px">
    <div style="display:flex;align-items:center;gap:8px">
      ${navB(-1)}
      <div style="flex:1;text-align:center;font-size:14px;font-weight:800;color:#06382f">${lhdRelLabel(lhdqlMonday)} · ${lhdRangeLabel(days)}</div>
      ${navB(1)}
    </div>
    <div style="display:flex;gap:8px">
      <select onchange="lhdqlSetKV(this.value)" style="${sel};flex:none;max-width:46%">
        <option value="">Tất cả khu vực</option>
        ${kvs.map(k=>`<option value="${escHtml(k)}"${lhdqlKV===k?' selected':''}>${escHtml(k)}</option>`).join('')}
      </select>
      <input value="${escHtml(lhdqlQ)}" oninput="lhdqlQ=this.value" onkeyup="if(event.key==='Enter')renderLichHDQL()" onchange="renderLichHDQL()" placeholder="Tìm cửa hàng..." style="${sel};flex:1">
    </div>
  </div>`;
}

function renderLichHDQL(){
  const cont=document.getElementById('lhdql-content'); if(!cont) return;
  const days=lhd7Days(lhdqlMonday); const nm=['T2','T3','T4','T5','T6','T7','CN']; const p=n=>String(n).padStart(2,'0');
  let rows=lhdqlData;
  if(lhdqlKV) rows=rows.filter(r=>r.khu_vuc===lhdqlKV);
  if(lhdqlQ.trim()){ const q=lhdqlQ.trim().toLowerCase(); rows=rows.filter(r=>((r.ten_ch||'')+' '+(r.ma_ch||'')).toLowerCase().includes(q)); }
  const daGui=rows.filter(r=>r.submitted_at).length, chuaGui=rows.length-daGui;
  const head=`<div style="display:flex;position:sticky;top:0;background:linear-gradient(135deg,#1D9E75,#0F6E56);color:#fff;font-size:11px;font-weight:800;z-index:1">
    <div style="flex:none;width:128px;padding:9px 10px">Cửa hàng (${rows.length})</div>
    ${days.map((dd,i)=>`<div style="flex:1;min-width:48px;text-align:center;padding:8px 2px;border-left:1px solid rgba(255,255,255,.14)">${nm[i]}<div style="font-size:9px;opacity:.85;font-weight:500">${p(dd.ngayNum)}/${p(dd.thang)}</div></div>`).join('')}
  </div>`;
  const body=rows.length?rows.map(r=>lhdqlRow(r,days)).join(''):'<div class="ns-empty">Không có cửa hàng phù hợp.</div>';
  cont.innerHTML=lhdqlFilterBar()+`
    <div style="display:flex;gap:8px;margin:10px 0;font-size:12px">
      <span style="background:#ECFDF5;color:#047857;padding:5px 12px;border-radius:99px;font-weight:800">Đã gửi: ${daGui}</span>
      <span style="background:#FFF7ED;color:#9A3412;padding:5px 12px;border-radius:99px;font-weight:800">Chưa gửi: ${chuaGui}</span>
    </div>
    <div style="overflow-x:auto;border:1px solid #E6EBF0;border-radius:12px">${head}${body}</div>`;
}

function lhdqlRow(r,days){
  const lich=Array.isArray(r.lich)?r.lich:null; const sent=!!r.submitted_at;
  return `<div style="display:flex;border-top:1px solid #F1F5F9;font-size:11px;background:${sent?'#fff':'#FFFBF5'}">
    <div style="flex:none;width:128px;padding:7px 10px;overflow:hidden">
      <div style="font-weight:800;color:#06382f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.ten_ch||r.ma_ch)}</div>
      <div style="font-size:9px;color:#9AA7B2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.khu_vuc||'')}${sent?'':' · chưa gửi'}</div>
    </div>
    ${days.map((dd,i)=>{
      const d=lich?(lich.find(x=>x.ngay===dd.ngay)||lich.find(x=>x.thu===i+2)||lich[i]):null;
      const bd=d&&d.gio_bd,kt=d&&d.gio_kt; const has=sent&&bd&&kt;
      if(!has) return `<div style="flex:1;min-width:48px;display:flex;align-items:center;justify-content:center;padding:6px 2px;color:#D5DCE2;font-size:13px;border-left:1px solid #F1F5F9">–</div>`;
      return `<div style="flex:1;min-width:48px;padding:5px 3px;border-left:1px solid #F1F5F9"><div style="padding:5px 1px;text-align:center;border-radius:6px;font-weight:800;font-size:10.5px;background:#ECFDF5;color:#047857;line-height:1.25">${lhdHrShort(bd)}<span style="color:#A7F3D0">-</span>${lhdHrShort(kt)}</div></div>`;
    }).join('')}
  </div>`;
}
