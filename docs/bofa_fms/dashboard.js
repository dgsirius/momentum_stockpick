(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('fms-data').textContent);
  const reports = data.reports;
  const names = data.category_labels;
  const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const $ = id => document.getElementById(id);
  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const pct = entry => (entry.approximate ? '≈' : '') + entry.value + '%';
  const monthLabel = month => month.replace('-', '.');
  const monthBefore = month => { const [y, m] = month.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
  const winners = entries => { const max = Math.max(...entries.map(e => e.value)); return entries.filter(e => e.value === max); };
  const byMonth = new Map(reports.map(r => [r.month, r]));
  const colors = ['#b35e47','#317d88','#ac8b3f','#7070a2','#74864e','#aa6c89','#537791','#9b704b','#538d7b','#a85b60','#787f92','#8a8243'];
  const categoryOrder = Object.keys(names).sort();
  const keyColors = {geopolitical_conflict:'#ac8b3f',global_inflation_accelerates:'#b35e47',trade_war_triggers_global_recession:'#537791',inflation_causes_fed_to_hike:'#7070a2','2nd_wave_of_inflation':'#be8e30',ai_bubble:'#317d88',disorderly_rise_in_bond_yields:'#aa6c89',long_magnificent_7:'#336c9f',long_gold:'#aa8c38',short_us_dollar:'#7d719d',long_oil:'#aa5e47',long_global_semiconductors:'#157c78'};
  const color = id => keyColors[id] || colors[categoryOrder.indexOf(id) % colors.length];
  const allMonths = [];
  let month = reports[0].month;
  while (month <= reports.at(-1).month) {
    allMonths.push(month);
    let [y, m] = month.split('-').map(Number); m++; if (m === 13) { m = 1; y++; }
    month = `${y}-${String(m).padStart(2,'0')}`;
  }
  let selected = byMonth.get(new URL(location.href).searchParams.get('month')) || reports.at(-1);
  const years = [...new Set(reports.map(r => r.month.slice(0,4)))];
  years.forEach(year => { const option = node('option', '', year); option.value = year; $('year-filter').append(option); });
  const monthsInScope = () => allMonths.filter(m => $('year-filter').value === 'all' || m.startsWith($('year-filter').value));
  const reportsInScope = () => reports.filter(r => monthsInScope().includes(r.month));
  const observations = reports.reduce((n,r) => n + r.risk.entries.length + r.crowding.entries.length,0);
  [
    ['已归档月报',`${reports.length} 期`,`${monthLabel(reports[0].month)} — ${monthLabel(reports.at(-1).month)}`],
    ['柱状数据',`${observations} 项`,'两类问卷 · 全部列示选项'],
    ['最新报告',monthLabel(reports.at(-1).month),`发布于 ${reports.at(-1).date}`],
    ['待补月份',`${data.missing_months.length} 个月`,`${data.duplicate_files.length} 份同内容文件已去重`]
  ].forEach(([label,value,detail]) => { const card = node('div','summary-card'); card.append(node('span','label',label),node('strong','',value),node('span','detail',detail)); $('summary').append(card); });
  $('coverage-note').append(node('strong','','当前覆盖。'),document.createTextNode(`已收录 ${reports.length} 期，缺少 ${data.missing_months.join('、')}。同一 PDF 按 SHA-256 去重，${data.duplicate_files.length} 份重复文件不重复计入。`));

  function choose(report) {
    selected = report;
    const url = new URL(location.href); url.searchParams.set('month',report.month); history.replaceState({},'',url);
    render();
  }
  function renderMonths() {
    $('month-strip').replaceChildren();
    monthsInScope().forEach(m => {
      const report = byMonth.get(m);
      const chip = node('button','month-chip',monthLabel(m) + (report ? '' : ' 缺报'));
      chip.type = 'button'; chip.disabled = !report; chip.setAttribute('aria-pressed',String(selected.month === m));
      if (report) chip.addEventListener('click',() => choose(report));
      $('month-strip').append(chip);
    });
    const activeChip = $('month-strip').querySelector('[aria-pressed="true"]');
    if (activeChip) $('month-strip').scrollLeft = activeChip.offsetLeft - $('month-strip').offsetLeft - $('month-strip').clientWidth / 2;
    const index = reports.indexOf(selected);
    $('previous-month').disabled = index === 0;
    $('next-month').disabled = index === reports.length - 1;
    $('current-month').textContent = `${selected.month.slice(0,4)} 年 ${Number(selected.month.slice(5))} 月`;
    const pdf = $('original-pdf');
    if (local) pdf.href = `/api/bofa-fms/source/${selected.date}.pdf`;
    else { pdf.removeAttribute('href'); pdf.title = '原文 PDF 保存在本机，请在本地服务打开。'; pdf.textContent = '原文 PDF（本机）'; }
    $('issue-notes').textContent = selected.notes.join(' ');
    $('sample-description').textContent = selected.sample_description || '样本信息请参阅报告首页。';
  }
  function renderSnapshot(metric) {
    const chart = selected[metric];
    const host = $(metric + '-bars'); host.replaceChildren();
    const priorReport = byMonth.get(monthBefore(selected.month));
    chart.entries.forEach(entry => {
      const prior = priorReport?.[metric].entries.find(e => e.category === entry.category);
      const row = node('div','horizontal-bar');
      const labelRow = node('div','bar-label-row');
      const label = node('span','bar-label',names[entry.category].label); label.title = entry.label_original;
      labelRow.append(label,node('span','bar-value',pct(entry)));
      const track = node('div','bar-track');
      const fill = node('div','bar-fill'); fill.style.width = entry.value + '%'; track.append(fill);
      if (prior) { const marker = node('span','previous-marker'); marker.style.left = prior.value + '%'; marker.title = `上月 ${pct(prior)}`; track.append(marker); }
      let change = prior ? `${entry.approximate || prior.approximate ? '约 ' : ''}${entry.value - prior.value > 0 ? '+' : ''}${entry.value - prior.value} pp · 上月 ${pct(prior)}` : priorReport ? '上月未列示该项' : '上月缺少原始研报';
      row.append(labelRow,track,node('span','bar-delta',change)); host.append(row);
    });
    $(metric + '-meta').textContent = `来源：${selected.date} · PDF 第 ${chart.page} 页 · Chart ${chart.chart} · 当期占比合计 ${chart.entries.some(e=>e.approximate) ? '约 ' : ''}${chart.entries.reduce((n,e)=>n+e.value,0)}%（不补足至 100%）`;
  }
  for (const metric of ['risk','crowding']) {
    const select = $(metric + '-category');
    const option = node('option','','每期首位（随月份变化）'); option.value = 'leader'; select.append(option);
    const categories = [...new Set(reports.flatMap(r => r[metric].entries.map(e => e.category)))];
    categories.sort((a,b) => names[a].label.localeCompare(names[b].label,'zh-CN')).forEach(id => { const option = node('option','',names[id].label); option.value = id; select.append(option); });
    select.addEventListener('change',() => renderHistory(metric));
  }
  function renderHistory(metric) {
    const filter = $(metric + '-category').value;
    const chart = node('div','history-columns');
    const used = new Set();
    monthsInScope().forEach(m => {
      const report = byMonth.get(m);
      const top = report ? winners(report[metric].entries) : [];
      const entry = report ? (filter === 'leader' ? top[0] : report[metric].entries.find(e => e.category === filter)) : null;
      const column = node('button','history-column'); column.type = 'button'; column.disabled = !report;
      if (m === selected.month) column.setAttribute('aria-current','true');
      const plot = node('span','column-plot');
      const status = report ? '未列示' : '缺报';
      if (entry) {
        used.add(entry.category);
        const bar = node('span','column-bar'); bar.style.height = (entry.value * 2.2) + 'px'; bar.style.background = color(entry.category);
        bar.append(node('span','column-value',pct(entry))); plot.append(bar);
        const details = filter === 'leader' ? top.map(e=>`${names[e.category].label} ${pct(e)}`).join(' / ') : `${names[entry.category].label} ${pct(entry)}`;
        column.title = `${m} · ${details}${top.length > 1 && filter === 'leader' ? '（并列第一）' : ''}`;
        column.setAttribute('aria-label',column.title);
      } else {
        plot.append(node('span','column-gap',status));
        column.setAttribute('aria-label',`${m} ${status}`); column.title = `${m} ${status}`;
      }
      column.append(plot,node('span','column-month',m.slice(5)+'月'),node('span','column-year',m.slice(0,4)));
      if (report) column.addEventListener('click',() => choose(report));
      chart.append(column);
    });
    const note = node('p','history-note','可左右滚动查看全部月份。' + (filter === 'leader' ? '每根柱子是当期最高占比，类别可能变化；并列第一详见鼠标提示、月度快照及档案。灰色空位代表缺报。' : '仅展示原图当期列示的该类别；未列示并不意味着占比为零。'));
    $(metric + '-history').replaceChildren(chart,note);
    const activeColumn = chart.querySelector('[aria-current="true"]');
    if (activeColumn) $(metric + '-history').scrollLeft = activeColumn.offsetLeft - chart.offsetLeft - $(metric + '-history').clientWidth / 2;
    const legend = $(metric + '-legend'); legend.replaceChildren();
    used.forEach(id => { const item = node('span','legend-item'); const dot = node('span','legend-dot'); dot.style.background = color(id); item.append(dot,document.createTextNode(names[id].label)); legend.append(item); });
  }
  function renderArchive() {
    $('archive-body').replaceChildren();
    const scoped = reportsInScope();
    $('archive-count').textContent = `${scoped.length} 期`;
    scoped.forEach(report => {
      const tr = node('tr');
      const dateCell = node('td'); const dateButton = node('button','text-button',report.date); dateButton.addEventListener('click',() => { choose(report); $('current-month').scrollIntoView({block:'center',behavior:'smooth'}); }); dateCell.append(dateButton); tr.append(dateCell);
      for (const metric of ['risk','crowding']) {
        const td = node('td');
        winners(report[metric].entries).forEach(entry => { const line = node('div'); line.append(document.createTextNode(names[entry.category].label+' '),node('span','archive-percent',pct(entry))); td.append(line); });
        tr.append(td);
      }
      const source = node('td','archive-source');
      if (local) { const a = node('a','','PDF ↗'); a.href = `/api/bofa-fms/source/${report.date}.pdf`; a.target = '_blank'; a.rel = 'noopener'; source.append(a); }
      source.append(node('div','',`风险 p.${report.risk.page} / 交易 p.${report.crowding.page}`)); tr.append(source);
      $('archive-body').append(tr);
    });
  }
  function render() { renderMonths(); renderSnapshot('risk'); renderSnapshot('crowding'); renderHistory('risk'); renderHistory('crowding'); renderArchive(); }
  $('previous-month').addEventListener('click',() => {
    const previous = reports[reports.indexOf(selected)-1]; if (!previous) return;
    if ($('year-filter').value !== 'all' && !previous.month.startsWith($('year-filter').value)) $('year-filter').value = previous.month.slice(0,4);
    choose(previous);
  });
  $('next-month').addEventListener('click',() => {
    const next = reports[reports.indexOf(selected)+1]; if (!next) return;
    if ($('year-filter').value !== 'all' && !next.month.startsWith($('year-filter').value)) $('year-filter').value = next.month.slice(0,4);
    choose(next);
  });
  $('year-filter').addEventListener('change',() => {
    if (!reportsInScope().includes(selected)) selected = reportsInScope().at(-1);
    choose(selected);
  });
  document.querySelectorAll('[data-evidence]').forEach(button => button.addEventListener('click',() => {
    const metric = button.dataset.evidence; const chart = selected[metric];
    $('evidence-title').textContent = `${selected.month} · ${metric === 'risk' ? '最大风险' : '最拥挤交易'}`;
    $('evidence-source').textContent = `${selected.source_file} · PDF 第 ${chart.page} 页 · Chart ${chart.chart}`;
    $('evidence-image').src = chart.evidence;
    $('evidence-image').alt = `${selected.date} Chart ${chart.chart} 原始图表`;
    $('evidence-dialog').showModal();
  }));
  $('close-evidence').addEventListener('click',() => $('evidence-dialog').close());
  $('export-csv').addEventListener('click',() => {
    const rows = [['报告日期','月份','类别','中文项','原始英文项','占比(%)','数值精度','PDF页码','图号','源文件','SHA256']];
    reports.forEach(report => ['risk','crowding'].forEach(metric => report[metric].entries.forEach(entry => rows.push([report.date,report.month,metric === 'risk' ? '最大风险' : '最拥挤交易',names[entry.category].label,entry.label_original,entry.value,entry.approximate ? '图形估读约数' : '原图或原文明示',report[metric].page,report[metric].chart,report.source_file,report.sha256]))));
    const csv = '\ufeff'+rows.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a = node('a'); a.href = url; a.download = `bofa-fms-${reports[0].month}-${reports.at(-1).month}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const importButton=$('import-pdf'),fileInput=$('pdf-file'),importStatus=$('import-status');
  let importWasRunning=false,importPolling=false,uploading=false,importErrorLocal=false;
  function applyImportState(state){
    const running=state.state==='running';
    importButton.disabled=!local||running||uploading;
    importButton.textContent=running?'正在识别并导入…':'＋ 导入月报 PDF';
    importStatus.textContent=state.message||'导入 PDF 后自动更新本看板，不触发其他看板刷新。';
    importStatus.dataset.state=state.state||'idle';
    if(running)importWasRunning=true;
    else if(importWasRunning){importWasRunning=false;if(state.state==='complete'){const url=new URL(location.href);if(state.month)url.searchParams.set('month',state.month);location.replace(url)}}
  }
  async function pollImport(){if(!local||importPolling||uploading||importErrorLocal)return;importPolling=true;try{const response=await fetch('/api/bofa-fms/status',{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);applyImportState(await response.json())}catch(error){importStatus.textContent=`状态读取失败：${error.message}`}finally{importPolling=false}}
  importButton.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files[0];if(!file)return;importErrorLocal=false;
    if(file.size>20*1024*1024||!file.name.toLowerCase().endsWith('.pdf')){importErrorLocal=true;importStatus.textContent='请选择 20 MB 以内的 PDF 文件。';fileInput.value='';return}
    uploading=true;importButton.disabled=true;importStatus.textContent=`正在上传 ${file.name} 到本机…`;
    try{
      const response=await fetch('/api/bofa-fms/import',{method:'POST',headers:{'Content-Type':'application/pdf','X-Filename':encodeURIComponent(file.name)},body:file});
      const state=await response.json();
      if(response.status===409)throw new Error('另一份月报正在导入，本文件未提交，请完成后再试。');
      if(!response.ok)throw new Error(state.error||`HTTP ${response.status}`);
      uploading=false;applyImportState(state);
      if(state.duplicate&&state.month&&byMonth.has(state.month))choose(byMonth.get(state.month));
    }catch(error){importErrorLocal=true;importStatus.textContent=`导入失败：${error.message}`;importStatus.dataset.state='failed'}
    finally{uploading=false;fileInput.value='';if(!importWasRunning)importButton.disabled=!local}
  });
  importButton.disabled=!local;
  if(local){pollImport();setInterval(pollImport,2500)}else importStatus.textContent='请在本机看板服务导入月报 PDF。';
  render();
})();
