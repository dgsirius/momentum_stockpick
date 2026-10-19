'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const fmt = (v, digits=2) => finite(v) ? v.toLocaleString('zh-CN', {maximumFractionDigits:digits,minimumFractionDigits:digits}) : '—';
  const stamp = s => s ? String(s).replace('T',' ').replace(/\+\d\d:\d\d$/, '') : '尚未获取';
  const marketName = {HK:'港股',US:'美股',KR:'韩股'};
  const sourceClock = row => row.market==='US'?'美东':row.market==='HK'?'香港':'抓取 / 北京';
  let data = {rows:[],issues:[],counts:{}}, market='ALL', valuation='all', page=1, pageSize=12, running=false, completedAt='', pollTimer;
  const valuationLabel = {all:'不限估值',pb:'PB < 20%',pe:'TTM PE < 20%',any:'PB / PE 任一 < 20%',both:'PB / PE 两者均 < 20%'};
  function lowValuation(row, kind) {
    const m=row[kind];
    return !row.stale && !!m && !m.stale && finite(m.current) && m.current>0 && m.sample_count>=20 && finite(m.percentile) && m.percentile<20;
  }
  function matchesValuation(row) {
    if(valuation==='all')return true;
    if(valuation==='pb'||valuation==='pe')return lowValuation(row,valuation);
    const pb=lowValuation(row,'pb'),pe=lowValuation(row,'pe');
    return valuation==='both'?pb&&pe:pb||pe;
  }
  const local = ['127.0.0.1','localhost'].includes(location.hostname);
  const charts = new Map();
  let chartId=0;
  function capText(row) {
    if (!finite(row.market_cap)) return '市值未取得';
    const unit = {HK:'港币',US:'美元',KR:'韩元'}[row.market];
    return row.market_cap >= 1e12 ? fmt(row.market_cap/1e12)+' 万亿'+unit : fmt(row.market_cap/1e8,1)+' 亿'+unit;
  }
  // Preserve extrema, chronology, and missing intervals; statistics never use this sample.
  function simplify(points, limit=360) {
    if(points.length<=limit) return points;
    const selected=new Set([0,points.length-1]), step=Math.ceil(points.length/(limit/4));
    for(let i=0;i<points.length;i+=step){
      let lo=i,hi=i;
      selected.add(i);selected.add(Math.min(points.length-1,i+step-1));
      for(let j=i;j<Math.min(points.length,i+step);j++){
        if(points[j][1]===null){if(j===0||points[j-1][1]!==null)selected.add(j);if(j+1<points.length&&points[j+1][1]!==null)selected.add(j+1);continue;}
        if(points[lo][1]===null||points[j][1]<points[lo][1])lo=j;
        if(points[hi][1]===null||points[j][1]>points[hi][1])hi=j;
      }
      selected.add(lo);selected.add(hi);
    }
    return [...selected].sort((a,b)=>a-b).map(i=>points[i]);
  }
  function plot(m, kind, stock) {
    const points=(m.history||[]).filter(p=>p[0]), valid=points.filter(p=>finite(p[1])&&p[1]>0);
    if(!valid.length) return '<div class="no-data">暂无有效历史估值<br>当前值与缺失原因会单独显示</div>';
    const log=$('log').checked, trans=v=>log?Math.log(v):v;
    let low=Infinity,high=-Infinity;
    for(const p of valid){low=Math.min(low,p[1]);high=Math.max(high,p[1]);}
    if(finite(m.current)&&m.current>0){low=Math.min(low,m.current);high=Math.max(high,m.current);}
    let y0=log?trans(low):Math.max(0,low-(high-low)*.12), y1=trans(high);
    const span=y1-y0||Math.max(1,Math.abs(y1)*.1);
    y1+=span*.15;if(log)y0-=span*.12;
    const W=600,H=225,L=43,R=82,T=17,B=32, right=W-R, bottom=H-B;
    let t0=Date.parse(points[0][0]), t1=Date.parse(points[points.length-1][0]);
    if(t0===t1){t0-=86400000*180;t1+=86400000*180;}
    const x=t=>L+(t-t0)/(t1-t0)*(right-L), y=v=>bottom-(trans(v)-y0)/(y1-y0)*(bottom-T);
    let svg='';
    for(let i=0;i<4;i++){
      const yy=T+(bottom-T)*i/3,v=y1-(y1-y0)*i/3;
      svg+=`<line x1="${L}" x2="${right}" y1="${yy}" y2="${yy}" stroke="#e8e4dc" stroke-width=".8"/><text x="${L-7}" y="${yy+3}" text-anchor="end">${fmt(log?Math.exp(v):v,high>100?0:1)}</text>`;
    }
    for(let i=0;i<4;i++){
      const tt=t0+(t1-t0)*i/3;
      const label=new Date(tt).toISOString().slice(0,t1-t0<86400000*800?7:4);
      svg+=`<text x="${x(tt)}" y="${H-10}" text-anchor="middle">${label}</text>`;
    }
    let path='', pen=false;
    for(const p of simplify(points)){
      if(!finite(p[1])||p[1]<=0){pen=false;continue;}
      path+=(pen?' L':'M')+x(Date.parse(p[0])).toFixed(2)+' '+y(p[1]).toFixed(2);pen=true;
    }
    const color=kind==='pb'?'#17677f':'#237c63';
    svg+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="1.65" stroke-linejoin="round"/>`;
    if(valid.length<=30)svg+=valid.map(p=>`<circle cx="${x(Date.parse(p[0]))}" cy="${y(p[1])}" r="2.6" fill="${color}"/>`).join('');
    if(finite(m.current)&&m.current>0){
      const yy=y(m.current);
      svg+=`<line x1="${L}" x2="${right+7}" y1="${yy}" y2="${yy}" stroke="#ba632d" stroke-width="1.3" stroke-dasharray="5 4"/><text class="current-label" x="${right+11}" y="${yy+3}">${fmt(m.current)}×</text>`;
    }
    const id=String(++chartId);
    charts.set(id,{points:valid,t0,t1,L,right,W,name:stock.name,label:m.label,current:m.current});
    return `<div class="plot" data-chart="${id}"><svg role="img" aria-label="${esc(stock.name)} ${m.label}历史曲线，当前${fmt(m.current)}倍，分位${fmt(m.percentile,1)}%" viewBox="0 0 ${W} ${H}">${svg}<line class="cursor" y1="${T}" y2="${bottom}" stroke="#819095" stroke-dasharray="2 3" visibility="hidden"/></svg></div>`;
  }
  function metricHtml(row,kind) {
    const m=row[kind]||{}, p=m.percentile, count=m.sample_count||0;
    const invalid=finite(m.raw_current)&&m.raw_current<=0;
    const value=invalid ? '不适用' : fmt(m.current);
    const note=[];
    if(count&&count<20)note.push(`仅 ${count} 个有效样本，分位参考性有限`);
    if(invalid)note.push(kind==='pe'?'当前 TTM PE 非正或不可用，不参与分位':'当前 PB 非正或不可用，不参与分位');
    if(m.stale)note.push(`历史刷新失败${m.history_as_of?'，保留 '+stamp(m.history_as_of)+' 缓存':''}`);
    if(m.error&&!count)note.push(m.error);
    return `<section class="chart ${kind}"><div class="metric-heading"><div><div class="metric-label">${kind==='pb'?'PB · 市净率':'TTM PE · 市盈率'}</div><div class="current-value">${value}${finite(m.current)?'<small>倍</small>':''}</div></div><div class="rank ${p!==null&&p<=20?'low':p>=80?'high':''}"><strong>${fmt(p,1)}${finite(p)?'%':''}</strong><span>当前值的历史分位</span><div class="rankbar"><i style="width:${finite(p)?Math.max(0,Math.min(100,p)):0}%"></i></div></div></div>${plot(m,kind,row)}<div class="chart-footer"><span>${esc(m.start||'—')} → ${esc(m.end||'—')}</span><span>${esc(m.frequency||'日度')} · ${count.toLocaleString()} 个有效样本${m.invalid_count?` · 无效 ${m.invalid_count}`:''}</span></div><div class="chart-footer"><span>估值更新 ${esc(stamp(m.as_of))} · ${sourceClock(row)}</span><span>${esc(m.source||'')}</span></div>${note.length?`<div class="metric-note">${note.map(esc).join(' · ')}</div>`:''}</section>`;
  }
  function filtered() {
    const query=$('search').value.trim().toLowerCase(), sort=$('sort').value;
    return data.rows.filter(r=>(market==='ALL'||r.market===market)&&matchesValuation(r)&&(!query||(r.name+' '+r.code).toLowerCase().includes(query))).sort((a,b)=>{
      if(sort==='pb'||sort==='pe')return (a[sort]?.percentile??Infinity)-(b[sort]?.percentile??Infinity)||a.code.localeCompare(b.code);
      if(sort==='cap')return a.market.localeCompare(b.market)||(b.market_cap??0)-(a.market_cap??0);
      return a.code.localeCompare(b.code);
    });
  }
  function render(){
    charts.clear();$('tooltip').hidden=true;
    const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.max(1,Math.min(page,pages));
    $('result-count').textContent=`${market==='ALL'?'全部市场':marketName[market]} · ${rows.length} 只股票${valuation==='all'?'':' · '+valuationLabel[valuation]} · 最长 20 年`;
    $('cards').innerHTML=rows.length?rows.slice((page-1)*pageSize,page*pageSize).map(r=>`<article class="stock"><div class="stock-heading"><div class="identity"><span class="market ${r.market}">${marketName[r.market]}</span><div><h2><a href="${esc(r.source_url)}" target="_blank" rel="noreferrer">${esc(r.name)}</a></h2><div class="ticker">${esc(r.code)}${r.stale?' · 缓存数据':''}</div></div></div><div class="cap">${capText(r)}<small>市值更新 ${esc(stamp(r.market_cap_as_of))} · ${sourceClock(r)}</small></div></div><div class="charts">${metricHtml(r,'pb')}${metricHtml(r,'pe')}</div>${r.note?`<div class="stock-note">${esc(r.note)}</div>`:''}</article>`).join(''):`<div class="empty">${data.rows.length?'没有匹配的股票，请调整筛选条件。':'尚无估值数据。点击“刷新自选池与估值”开始获取。'}</div>`;
    $('page-info').textContent=`第 ${page} / ${pages} 页`;$('previous').disabled=page<=1;$('next').disabled=page>=pages;
    document.querySelectorAll('[data-market]').forEach(button=>{button.classList.toggle('selected',button.dataset.market===market);button.setAttribute('aria-pressed',String(button.dataset.market===market));button.querySelector('span').textContent=button.dataset.market==='ALL'?data.rows.length:data.counts[button.dataset.market]||0;});
    document.querySelectorAll('[data-valuation]').forEach(button=>{const selected=button.dataset.valuation===valuation;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  }
  async function load(){
    const response=await fetch('valuation_data.json?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error(`数据读取失败 (${response.status})`);
    const next=await response.json();if(!Array.isArray(next.rows))throw new Error('数据格式不正确，保留当前页面');data=next;
    $('total').textContent=data.rows.length;$('counts').textContent=`港股 ${data.counts.HK||0} · 美股 ${data.counts.US||0} · 韩股 ${data.counts.KR||0}`;
    for(const kind of ['pb','pe'])$(''+kind+'-low').textContent=data.rows.filter(r=>lowValuation(r,kind)).length+' 只';
    $('updated').textContent=data.updated_at?'数据完成 '+stamp(data.updated_at):'尚未获取数据';
    $('issues').hidden=!data.issues?.length;$('issue-title').textContent=`数据提示 / 未能核实的标的 (${data.issues?.length||0})`;
    $('issue-list').innerHTML=(data.issues||[]).map(i=>`<div><b>${esc(i.code)} ${esc(i.name)}</b> · ${esc(i.reason)}</div>`).join('');
    render();
  }
  function showError(message){$('error').hidden=false;$('error').textContent=message;}
  async function status(){
    if(!local)return;
    try{
      const response=await fetch('/api/leader-valuation/status?ts='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error(`刷新服务不可用 (${response.status})`);
      const s=await response.json();running=s.state==='running';$('refresh').disabled=running;$('job').hidden=!running;
      if(running){$('job-message').textContent=s.message||'正在刷新';$('job-count').textContent=s.total?`${s.done} / ${s.total}`:'';$('job-progress').value=s.total?100*s.done/s.total:0;}
      if(s.state==='failed')showError('刷新失败：'+s.message+'。上次成功数据已保留，可重试。');
      if(s.state==='complete'&&s.updated_at!==completedAt){completedAt=s.updated_at;await load();$('error').hidden=true;}
    }catch(error){showError(error.message+'。刷新页面仍可查看已缓存数据。');$('refresh').disabled=false;}
    clearTimeout(pollTimer);pollTimer=setTimeout(status,running?2500:15000);
  }
  $('refresh').addEventListener('click',async()=>{
    $('refresh').disabled=true;$('error').hidden=true;
    try{const response=await fetch('/api/leader-valuation/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error(`启动失败 (${response.status})`);await status();}catch(e){showError(e.message);$('refresh').disabled=false;}
  });
  document.querySelectorAll('[data-market]').forEach(b=>b.addEventListener('click',()=>{market=b.dataset.market;page=1;render();}));
  document.querySelectorAll('[data-valuation]').forEach(b=>b.addEventListener('click',()=>{valuation=b.dataset.valuation;page=1;render();}));
  ['search','sort','page-size'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;pageSize=Number($('page-size').value);render();}));
  $('log').addEventListener('change',render);
  function turnPage(delta){page+=delta;render();document.querySelector('.controls').scrollIntoView({behavior:'smooth',block:'start'});}
  $('previous').addEventListener('click',()=>turnPage(-1));$('next').addEventListener('click',()=>turnPage(1));
  $('cards').addEventListener('pointermove',event=>{
    const plot=event.target.closest('[data-chart]'),tip=$('tooltip');if(!plot){tip.hidden=true;return;}
    const cfg=charts.get(plot.dataset.chart),svg=plot.querySelector('svg'),rect=svg.getBoundingClientRect();if(!cfg)return;
    const px=(event.clientX-rect.left)/rect.width*cfg.W,t=cfg.t0+(px-cfg.L)/(cfg.right-cfg.L)*(cfg.t1-cfg.t0);
    if(px<cfg.L||px>cfg.right){tip.hidden=true;return;}
    let lo=0,hi=cfg.points.length-1;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(Date.parse(cfg.points[mid][0])<t)lo=mid+1;else hi=mid;}
    const prev=Math.max(0,lo-1);if(Math.abs(Date.parse(cfg.points[prev][0])-t)<Math.abs(Date.parse(cfg.points[lo][0])-t))lo=prev;
    const p=cfg.points[lo],cursor=svg.querySelector('.cursor');cursor.setAttribute('x1',px);cursor.setAttribute('x2',px);cursor.setAttribute('visibility','visible');
    tip.innerHTML=`${esc(cfg.name)} · ${p[0]}<br>${cfg.label} <b>${fmt(p[1])}×</b><br>当前 ${fmt(cfg.current)}×`;tip.hidden=false;
    tip.style.left=Math.max(6,Math.min(event.clientX+14,window.innerWidth-tip.offsetWidth-8))+'px';tip.style.top=Math.max(6,Math.min(event.clientY+14,window.innerHeight-tip.offsetHeight-8))+'px';
  });
  $('cards').addEventListener('pointerout',event=>{const plot=event.target.closest('[data-chart]');if(plot&&!plot.contains(event.relatedTarget)){plot.querySelector('.cursor')?.setAttribute('visibility','hidden');$('tooltip').hidden=true;}});
  if(!local){$('refresh').disabled=true;$('refresh').textContent='请在本机看板刷新';}
  load().then(status).catch(e=>{showError(e.message);status();});
})();
