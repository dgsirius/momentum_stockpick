'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const fmt=(v,d=2)=>finite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
  const stamp=s=>s?String(s).replace('T',' ').replace(/\+\d\d:\d\d$/,''):'尚未更新';
  const marketName={HK:'港股',US:'美股',KR:'韩股'};
  const filterName={all:'全部标的',new:'最新缺口','new-up':'最新向上','new-down':'最新向下','run-up':'连续向上','run-down':'连续向下'};
  let data={rows:[],counts:{},market_sessions:{}},windowRows=[],windowSize=50,market='ALL',filter='all',page=1,pageSize=24,selected='',chartConfig=null,running=false,completedAt='',pollTimer;
  let pinnedCodes=new Set(),pinsReady=false,pinSaving=false,pinRevision=0;
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  const fresh=r=>!r.stale&&r.bar_date&&r.bar_date===r.expected_session;
  const newest=r=>fresh(r)?(r.new_gaps||[]):[];
  const hasNew=(r,direction)=>newest(r).some(g=>!direction||g.direction===direction);
  const gapInterval=g=>`${fmt(g.remaining_low)} – ${fmt(g.remaining_high)}`;
  function contextRows(){
    const q=$('search').value.trim().toLowerCase();
    return windowRows.filter(r=>(market==='ALL'||r.market===market)&&(!q||(r.code+' '+r.name).toLowerCase().includes(q)));
  }
  function matchesFilter(r){
    if(filter==='new')return hasNew(r);
    if(filter==='new-up')return hasNew(r,'up');
    if(filter==='new-down')return hasNew(r,'down');
    if(filter==='run-up')return r.latest_run.direction==='up';
    if(filter==='run-down')return r.latest_run.direction==='down';
    return true;
  }
  function filtered(){
    return contextRows().filter(matchesFilter).sort((a,b)=>{
      const manual=Number(pinnedCodes.has(b.code))-Number(pinnedCodes.has(a.code));if(manual)return manual;
      return b.latest_run.count-a.latest_run.count||a.code.localeCompare(b.code);
    });
  }
  function renderAlerts(){
    const rows=contextRows().filter(matchesFilter).filter(r=>hasNew(r));
    const events=rows.flatMap(r=>newest(r).map(g=>({row:r,gap:g}))).sort((a,b)=>b.gap.size_pct-a.gap.size_pct);
    const up=events.filter(x=>x.gap.direction==='up').length,down=events.length-up;
    $('urgent').classList.toggle('quiet',!events.length);
    $('alert-title').textContent=events.length?`${rows.length} 只标的出现最新缺口，请重点关注`:'当前筛选下，最近已收盘交易日暂无新缺口';
    $('alert-note').textContent=events.length?`向上 ${up} 个 · 向下 ${down} 个。手动置顶优先，其余按连续缺口数量从多到少排列${events.length>6?'；这里先展示幅度最大的 6 个':''}。点击提醒查看前复权日 K 与缺口区间。`:(data.rows.length?'按各市场自己的最近已收盘日期检查。行情未跟上或本次刷新失败的标的不参与最新提醒。':'点击“刷新日 K 与缺口”开始监控。');
    $('sessions').innerHTML=['HK','US','KR'].map(m=>`<span>${marketName[m]}已收盘 · ${esc(data.market_sessions?.[m]||'待获取')}</span>`).join('');
    $('alerts').innerHTML=events.slice(0,6).map(({row:r,gap:g})=>`<button class="alert-card ${g.direction}" data-open="${esc(r.code)}"><span class="alert-name">${esc(r.name)}<small>${esc(r.code)} · ${g.date} · ${gapInterval(g)}</small></span><span class="alert-badge ${g.direction==='up'?'up-text':'down-text'}">${g.direction==='up'?'↑ 向上':'↓ 向下'} ${fmt(g.size_pct)}%</span></button>`).join('');
    $('show-new').textContent=events.length?`查看这 ${rows.length} 只最新缺口 ↓`:'只看最新缺口 ↓';
    $('show-new').disabled=!events.length;
  }
  function countPill(v,direction){return `<span class="count-pill ${finite(v)&&v>0?direction:''}">${finite(v)?v:'—'}</span>`;}
  function runLabel(row){const run=row.latest_run;return run.count?`${run.direction==='up'?'↑ 向上':'↓ 向下'} × ${run.count}`:row.bar_count?'无未补缺口':'—';}
  function runHtml(row){const run=row.latest_run;return run.count?`<span class="run-pill ${run.direction}">${runLabel(row)}</span><span class="cell-date">最近 ${run.latest_date}</span>`:`<span class="cell-date">${runLabel(row)}</span>`;}
  function pinButton(row){const pinned=pinnedCodes.has(row.code);return `<button class="pin-button${pinned?' is-pinned':''}" data-pin="${esc(row.code)}" aria-label="${pinned?'取消置顶':'置顶'} ${esc(row.name)}" aria-pressed="${pinned}" ${!pinsReady||pinSaving?'disabled':''}>${pinned?'↓ 取消置顶':'↑ 置顶'}</button>`;}
  function updateSummary(){
    const valid=windowRows.filter(fresh);
    const scope=contextRows();
    $('eyebrow-window').textContent=windowSize;$('window-label').textContent=windowSize;
    $('total').textContent=data.rows.length;$('counts').textContent=`港股 ${data.counts?.HK||0} · 美股 ${data.counts?.US||0} · 韩股 ${data.counts?.KR||0}`;
    $('latest-up').textContent=scope.filter(r=>hasNew(r,'up')).length+' 只';$('latest-down').textContent=scope.filter(r=>hasNew(r,'down')).length+' 只';
    $('run-up-count').textContent=scope.filter(r=>r.latest_run.direction==='up').length+' 只';$('run-down-count').textContent=scope.filter(r=>r.latest_run.direction==='down').length+' 只';
    document.querySelectorAll('[data-window]').forEach(b=>{const active=Number(b.dataset.window)===windowSize;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
    $('types').textContent=`股票 ${data.type_counts?.STOCK??data.rows.filter(r=>r.instrument_type!=='ETF').length} · 普通 ETF ${data.type_counts?.ETF??0}`;
    $('health').textContent=`日K日期正常 ${valid.length} / ${data.rows.length}`;$('pool-info').textContent=`自选股池 ${stamp(data.pool_updated_at)} · 股票无市值门槛`;
  }
  function render(){
    $('tooltip').hidden=true;
    windowRows=data.rows.map(r=>window.GapWindowMetrics.windowView(r,windowSize));updateSummary();
    const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(Math.max(1,page),pages);
    if(!rows.some(r=>r.code===selected))selected=rows[0]?.code||'';
    $('result-count').textContent=`${market==='ALL'?'全部市场':marketName[market]} · ${windowSize} 日窗口 · ${filterName[filter]} · ${rows.length} 只标的`;
    $('list-note').textContent='手动置顶优先 · 连续缺口数量从多到少 · 再次点击已选筛选可恢复全部';
    $('stocks').innerHTML=rows.slice((page-1)*pageSize,page*pageSize).map(r=>{
      const alert=newest(r)[0],state=r.stale?'stale':alert?'fresh-'+alert.direction:'';
      return `<tr data-row="${esc(r.code)}" class="${state}${pinnedCodes.has(r.code)?' manual-pinned':''}${r.code===selected?' active-row':''}"><td><button class="stock-name" data-open="${esc(r.code)}">${esc(r.name)}${r.instrument_type==='ETF'?'<span class="etf-tag">ETF</span>':''}<small>${marketName[r.market]} · ${esc(r.code)}${pinnedCodes.has(r.code)?' · 已置顶':''}</small></button>${pinButton(r)}</td><td>${r.bar_count||0} / ${windowSize}${r.bar_count>0&&r.bar_count<windowSize?`<span class="cell-date">历史不足 ${windowSize} 根</span>`:''}</td><td>${fmt(r.close)}<span class="cell-date">${esc(r.bar_date||'—')}</span></td><td>${countPill(r.up_count,'up')}</td><td>${countPill(r.down_count,'down')}</td><td class="run-cell">${runHtml(r)}</td><td>${alert?`<span class="fresh-tag ${alert.direction}">${alert.direction==='up'?'↑ 最新向上缺口':'↓ 最新向下缺口'}</span><span class="cell-date">${alert.date} · ${fmt(alert.size_pct)}%</span>`:r.stale?`<span class="warning-tag">${r.error?'刷新失败 / 缓存':'行情日期待核实'}</span>`:'<span class="cell-date">无新缺口</span>'}</td><td><button class="view-button" data-open="${esc(r.code)}">查看日 K ↗</button></td></tr>`;
    }).join('');
    $('empty').hidden=!!rows.length;$('empty').textContent=data.rows.length?'没有符合条件的标的，请调整筛选。':'尚无缺口数据。点击本页刷新，同步自选标的并获取日 K。';
    $('page-info').textContent=`第 ${page} / ${pages} 页`;$('previous').disabled=page<=1;$('next').disabled=page>=pages;
    document.querySelectorAll('[data-market]').forEach(b=>{const active=b.dataset.market===market;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));b.querySelector('span').textContent=b.dataset.market==='ALL'?data.rows.length:data.counts?.[b.dataset.market]||0;});
    document.querySelectorAll('[data-filter]').forEach(b=>{const active=b.dataset.filter===filter;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
    renderAlerts();renderDetail();
  }
  function plot(row){
    const bars=row.bars||[];if(!bars.length){chartConfig=null;return '<div class="no-gaps">暂无可展示的日 K</div>';}
    const W=1100,H=410,L=63,R=95,T=24,B=40,right=W-R,bottom=H-B;
    const low=Math.min(...bars.map(b=>b.low)),high=Math.max(...bars.map(b=>b.high));
    const span=Math.max(high-low,high*.02,1e-5),min=low-span*.05,max=high+span*.07;
    const step=(right-L)/bars.length,x=i=>L+step*(i+.5),y=v=>bottom-(v-min)/(max-min)*(bottom-T);
    let svg='';
    for(let i=0;i<5;i++){const v=max-(max-min)*i/4,yy=y(v);svg+=`<line x1="${L}" x2="${right}" y1="${yy}" y2="${yy}" stroke="#e8e4dc"/><text x="${L-9}" y="${yy+3}" text-anchor="end">${fmt(v,high>1000?0:1)}</text>`;}
    for(const g of row.gaps||[]){const index=Math.max(0,bars.findIndex(b=>b.date===g.date)),start=x(index)-step/2,top=y(g.remaining_high),height=Math.max(1,y(g.remaining_low)-top),color=g.direction==='up'?'#c36243':'#258574';svg+=`<rect x="${start}" y="${top}" width="${right-start}" height="${height}" fill="${color}" opacity=".13"/><line x1="${start}" x2="${right}" y1="${top}" y2="${top}" stroke="${color}" opacity=".6" stroke-width=".7" stroke-dasharray="3 3"/>`;}
    const width=Math.max(.8,Math.min(7,step*.68));
    for(let i=0;i<bars.length;i++){const b=bars[i],xx=x(i),up=b.close>=b.open,color=up?'#bc5d42':'#288170';svg+=`<line x1="${xx}" x2="${xx}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${color}" stroke-width=".8"/><rect x="${xx-width/2}" y="${y(Math.max(b.open,b.close))}" width="${width}" height="${Math.max(.8,Math.abs(y(b.open)-y(b.close)))}" fill="${color}"/>`;}
    for(let i=0;i<5;i++){const idx=Math.round((bars.length-1)*i/4);svg+=`<text x="${x(idx)}" y="${H-15}" text-anchor="middle">${bars[idx].date}</text>`;}
    const yy=y(bars[bars.length-1].close);svg+=`<line x1="${L}" x2="${right+5}" y1="${yy}" y2="${yy}" stroke="#496970" stroke-dasharray="4 4" opacity=".7"/><text x="${right+9}" y="${yy+4}" font-weight="700">${fmt(row.close)}</text>`;
    chartConfig={bars,L,right,W,step};
    return `<div class="gap-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(row.name)}最近 ${bars.length} 根前复权日K及剩余缺口区间">${svg}<line class="cursor" y1="${T}" y2="${bottom}" stroke="#7b9398" stroke-dasharray="3 3" visibility="hidden"/></svg></div>`;
  }
  function renderDetail(){
    const row=windowRows.find(r=>r.code===selected);$('detail').hidden=!row;if(!row){chartConfig=null;return;}
    $('detail-title').textContent=`${row.name} · ${row.code}`;
    $('detail-meta').textContent=`${row.window_start||'—'} → ${row.bar_date||'—'} · ${row.bar_count||0} 根已收盘日 K · ${row.source||'数据待获取'}`;
    $('chart').innerHTML=plot(row);
    $('detail-note').textContent=[row.note,row.error,row.bar_count>0&&row.bar_count<windowSize?`可得历史不足 ${windowSize} 根，按实际根数统计。`:'',`数据获取 ${stamp(row.fetched_at)}。阴影为尚未回补区间；悬停查看开高低收。`].filter(Boolean).join(' ');
    $('detail-count').textContent=`向上 ${row.up_count??'—'} · 向下 ${row.down_count??'—'} · 最新连续 ${runLabel(row)}`;
    $('gap-rows').innerHTML=(row.gaps||[]).map(g=>`<tr><td><b class="${g.direction==='up'?'up-text':'down-text'}">${g.direction==='up'?'↑ 向上':'↓ 向下'}</b>${fresh(row)&&g.date===row.expected_session?'<span class="latest-mark">最新</span>':''}<span class="gap-time">${g.date}</span></td><td>${fmt(g.original_low)} – ${fmt(g.original_high)}</td><td>${gapInterval(g)}</td><td>${fmt(g.filled_pct,1)}%</td><td>${fmt(g.size_pct)}%</td><td>${g.age_bars} 根</td></tr>`).join('');
    $('no-gaps').hidden=!!row.gaps?.length;$('no-gaps').textContent=row.bar_count?'本次统计窗口内没有尚未完全回补的缺口。':'日 K 尚不可用，暂时无法判断缺口。';$('gap-rows').closest('.gap-table-scroll').hidden=!row.gaps?.length;
  }
  function select(code){selected=code;renderDetail();document.querySelectorAll('[data-row]').forEach(r=>r.classList.toggle('active-row',r.dataset.row===code));$('detail').scrollIntoView({behavior:'smooth',block:'start'});}
  async function load(){
    const response=await fetch('gap_data.json?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error(`缺口数据读取失败 (${response.status})`);
    const next=await response.json();if(!Array.isArray(next.rows))throw new Error('缺口数据格式不正确');data=next;
    $('updated').textContent=data.updated_at?'数据完成 '+stamp(data.updated_at):'尚未刷新';
    $('issues').hidden=!data.issues?.length;$('issue-title').textContent=`数据提示 / 待核实 (${data.issues?.length||0})`;$('issue-list').innerHTML=(data.issues||[]).map(i=>`<div><b>${esc(i.code)} ${esc(i.name)}</b> · ${esc(i.reason)}</div>`).join('');
    $('excluded-etfs').hidden=!data.excluded_etfs?.length;$('excluded-title').textContent=`未纳入的自选基金 (${data.excluded_etfs?.length||0})`;
    $('excluded-list').innerHTML=(data.excluded_etfs||[]).map(r=>`<div><b>${esc(r.code)} ${esc(r.name)}</b> · ${esc(r.reason)}${r.source_url?` · <a href="${esc(r.source_url)}" target="_blank" rel="noreferrer">发行人说明 ↗</a>`:''}</div>`).join('');
    render();
  }
  function showError(message){$('error').hidden=false;$('error').textContent=message;}
  function pinFeedback(message,error=false){$('pin-feedback').textContent=message;$('pin-feedback').classList.toggle('failed',error);}
  function applyPins(payload){if(!Array.isArray(payload.pinned_codes)||payload.pinned_codes.some(c=>typeof c!=='string'))throw new Error('置顶设置格式不正确');const codes=new Set(payload.pinned_codes),changed=!pinsReady||codes.size!==pinnedCodes.size||[...codes].some(c=>!pinnedCodes.has(c));pinnedCodes=codes;pinsReady=true;if(changed)render();}
  async function loadPins(){
    const revision=pinRevision,response=await fetch('/api/watchlist-gap/pins?ts='+Date.now(),{cache:'no-store'}),payload=await response.json();
    if(!response.ok)throw new Error(payload.error||`读取失败 (${response.status})`);
    if(!pinSaving&&revision===pinRevision)applyPins(payload);
  }
  async function togglePin(code){
    if(!pinsReady||pinSaving)return;
    const pinned=!pinnedCodes.has(code),name=data.rows.find(r=>r.code===code)?.name||code;
    pinSaving=true;pinRevision++;render();pinFeedback('正在保存置顶设置…');
    try{const response=await fetch('/api/watchlist-gap/pins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,pinned})}),payload=await response.json();if(!response.ok)throw new Error(payload.error||`保存失败 (${response.status})`);applyPins(payload);page=1;pinFeedback(`${pinned?'已置顶':'已取消置顶'}：${name}`);}
    catch(e){pinFeedback('置顶设置保存失败：'+e.message+'，请重试。',true);}
    finally{pinSaving=false;pinRevision++;render();}
  }
  async function status(){
    if(!local)return;
    try{const response=await fetch('/api/watchlist-gap/status?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error(`刷新服务不可用 (${response.status})`);const s=await response.json();running=s.state==='running';$('refresh').disabled=running;$('job').hidden=!running;
      if(running){$('job-message').textContent=s.message||'正在刷新';$('job-count').textContent=s.total?`${s.done} / ${s.total}`:'';$('job-progress').value=s.total?100*s.done/s.total:0;}
      if(s.state==='failed')showError('刷新失败：'+s.message+'。上次成功数据已保留，可重试。');
      if(s.state==='complete'&&s.updated_at!==completedAt){completedAt=s.updated_at;await load();$('error').hidden=true;}
    }catch(e){showError(e.message);$('refresh').disabled=false;}
    try{await loadPins();}catch(e){pinFeedback('置顶设置读取失败：'+e.message+'。',true);}
    clearTimeout(pollTimer);pollTimer=setTimeout(status,running?2500:15000);
  }
  $('refresh').addEventListener('click',async()=>{$('refresh').disabled=true;$('error').hidden=true;try{const response=await fetch('/api/watchlist-gap/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error(`启动失败 (${response.status})`);await status();}catch(e){showError(e.message);$('refresh').disabled=false;}});
  document.querySelectorAll('[data-market]').forEach(b=>b.addEventListener('click',()=>{market=b.dataset.market;page=1;render();}));
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=filter===b.dataset.filter?'all':b.dataset.filter;page=1;render();}));
  document.querySelectorAll('[data-window]').forEach(b=>b.addEventListener('click',()=>{windowSize=Number(b.dataset.window);page=1;render();}));
  ['search','page-size'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;pageSize=Number($('page-size').value);render();}));
  $('sort-run').addEventListener('click',()=>{page=1;render();});
  $('show-new').addEventListener('click',()=>{if(filter==='all'||filter==='new')filter='new';else if(filter==='run-up')filter='new-up';else if(filter==='run-down')filter='new-down';page=1;render();document.querySelector('.controls').scrollIntoView({behavior:'smooth',block:'start'});});
  $('previous').addEventListener('click',()=>{page--;render();});$('next').addEventListener('click',()=>{page++;render();});
  ['stocks','alerts'].forEach(id=>$(id).addEventListener('click',e=>{const pin=e.target.closest('[data-pin]');if(pin){togglePin(pin.dataset.pin);return;}const b=e.target.closest('[data-open]');if(b)select(b.dataset.open);}));
  $('chart').addEventListener('pointermove',e=>{
    const tip=$('tooltip'),svg=$('chart').querySelector('svg'),cfg=chartConfig;if(!svg||!cfg)return;
    const rect=svg.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*cfg.W;if(px<cfg.L||px>cfg.right){tip.hidden=true;return;}
    const index=Math.max(0,Math.min(cfg.bars.length-1,Math.floor((px-cfg.L)/cfg.step))),bar=cfg.bars[index],cursor=svg.querySelector('.cursor');cursor.setAttribute('x1',px);cursor.setAttribute('x2',px);cursor.setAttribute('visibility','visible');
    tip.innerHTML=`<b>${bar.date}</b> · 前复权<br>开 ${fmt(bar.open)} · 高 ${fmt(bar.high)}<br>低 ${fmt(bar.low)} · 收 ${fmt(bar.close)}`;tip.hidden=false;tip.style.left=Math.max(5,Math.min(e.clientX+12,window.innerWidth-tip.offsetWidth-8))+'px';tip.style.top=Math.max(5,Math.min(e.clientY+12,window.innerHeight-tip.offsetHeight-8))+'px';
  });
  $('chart').addEventListener('pointerleave',()=>{$('tooltip').hidden=true;$('chart').querySelector('.cursor')?.setAttribute('visibility','hidden');});
  if(!local){$('refresh').disabled=true;$('refresh').textContent='请在本机看板刷新';}
  load().then(status).catch(e=>{showError(e.message);status();});
})();
