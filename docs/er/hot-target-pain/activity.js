const turnoverDollars = value => value == null ? '—' : (Math.abs(value) >= 1e8
  ? (value / 1e8).toLocaleString('zh-CN', {maximumFractionDigits: 2}) + ' 亿美元'
  : (value / 1e4).toLocaleString('zh-CN', {maximumFractionDigits: 0}) + ' 万美元');
const turnoverTimes = value => value == null ? '—' : Number(value).toFixed(2) + '×';
const signedPercent = value => value == null ? '—' : (value > 0 ? '+' : '') + (value * 100).toFixed(2) + '%';
const plotStart = item => item.timeline_start || item.earliest_article;
const validSource = url => /^https:\/\/[a-z0-9.-]+(?:\/|$)/i.test(url || '');

function renderActivityHeader(item) {
  const linked = (item.activity?.related || []).filter(symbol => payload.symbols[symbol]);
  const host = $('#relatedSymbols');
  host.hidden = !linked.length;
  host.innerHTML = linked.length ? '<b>相关主题 / 标的</b>' + linked.map(symbol =>
    `<button type="button" data-related-symbol="${symbol}">${esc(symbol)} · ${esc(payload.symbols[symbol].name)}</button>`
  ).join('') : '';
  host.querySelectorAll('button').forEach(button =>
    button.addEventListener('click', () => selectSymbol(button.dataset.relatedSymbol)));
}

function renderEtfHeader(item) {
  const last = item.activity.days.at(-1);
  $('#tickerBadge').textContent = item.symbol;
  $('#symbolTitle').textContent = item.name + ' · ' + item.symbol;
  $('#symbolRange').textContent = `日线 ${item.price_start} 至 ${item.price_end} · 美东交易日`;
  $('#boardStats').innerHTML = [
    ['最近收盘', fmtPrice(item.series.at(-1).close)],
    ['日涨跌', signedPercent(last?.change)],
    ['美元成交额', turnoverDollars(last?.amount)],
    ['较前 20 日基准', turnoverTimes(last?.ratio)],
  ].map(([title,value]) => `<div class="board-stat"><small>${title}</small><b>${value}</b></div>`).join('');
  $('#assetScope').textContent = '成交额为 OpenD 市场成交额，柱色表示价格涨跌。盘前提醒用于观察，收盘提醒以实际成交额确认。';
  $('#dateCoverage').hidden = true;
  $('#earningsStatus').hidden = true;
  $('#chartLabel').textContent = '前复权价格、均线与动态前高回撤';
  $('#methodGrid').innerHTML = `<div><b>市场成交额</b><br>原始美元成交额 ÷ 此前 20 个交易日中位数。<a href="${esc(payload.activity_rules.source)}" target="_blank" rel="noreferrer">OpenD 字段</a></div>
    <div><b>盘前与收盘信号</b><br>盘前使用官方日历或前一日极端波动。收盘按 ${payload.activity_rules.turnover_multiple.toFixed(1)}× 或超基准成交额超过此前 252 日第 ${Math.round(payload.activity_rules.increase_quantile*100)} 百分位识别异常，显示同期催化和价格形态。</div>
    <div><b>事件映射</b><br>成分股盘后财报对应下一美股交易日。宏观、公司或主题事件显示原始出处，技术点用行情计算。</div>`;
}

function turnoverPopover(row, pointer) {
  const pop = $('#chartPopover');
  hideContentTooltip();
  const events = row.events.map(event => {
    const title = esc(event.title);
    const date = event.announce && event.announce !== row.date ? ` · 公告 ${esc(event.announce)}` : '';
    return `<li>${validSource(event.url) ? `<a href="${esc(event.url)}" target="_blank" rel="noreferrer">${title}</a>` : title} <small>${esc(event.category)}${date}</small></li>`;
  }).join('');
  pop.innerHTML = `<div class="popover-head"><div><span class="popover-label">美元成交额 · ${row.abnormal ? '成交异常' : '日度行情'}</span>
    <h4>${esc(row.date)} · ${turnoverDollars(row.amount)}</h4></div>
    <button type="button" class="popover-close" data-popover-close aria-label="关闭详情">×</button></div>
    <div class="popover-metrics"><div><small>放量倍数</small><b>${turnoverTimes(row.ratio)}</b></div>
    <div><small>超基准成交额</small><b>${turnoverDollars(row.baseline == null ? null : row.amount-row.baseline)}</b></div>
    <div><small>日涨跌</small><b>${signedPercent(row.change)}</b></div></div>
    ${events ? `<ul class="popover-reasons">${events}</ul>` : ''}`;
  finishChartPopover(pointer);
}

function turnoverChart(item) {
  const svg = $('#turnoverChart');
  clear(svg);
  const rows = item.activity?.days || [];
  $('#turnoverPanel').hidden = !rows.length;
  if (!rows.length) return;
  const width = Number($('#timelineTrack').dataset.chartWidth || 1080);
  const height = 164, left = 58, right = 18, top = 27, bottom = 24;
  const x = dateScale(plotStart(item), item.price_end, left, width-right);
  const max = Math.max(...rows.map(row => row.amount), 1) * 1.12;
  const y = value => height-bottom-value/max*(height-bottom-top);
  const barWidth = Math.max(1.15, Math.min(13, (width-left-right)/rows.length * .65));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  [0, max / 2, max].forEach(value => {
    const yy = y(value);
    svg.appendChild(svgEl('line', {x1:left, x2:width-right, y1:yy, y2:yy, class:'turnover-grid'}));
    svg.appendChild(svgEl('text', {x:left-7, y:yy+4, 'text-anchor':'end', class:'turnover-axis'},
      (value/1e8).toLocaleString('zh-CN', {maximumFractionDigits:1})));
  });
  const bars = svgEl('g'), markers = svgEl('g');
  const markerSize = width < 1500 ? 3.7 : 4.8;
  rows.forEach(row => {
    const cx = x(row.date), cy = y(row.amount);
    const color = row.change > 0 ? '#168a7c' : row.change < 0 ? '#bc5951' : '#7a8c8b';
    const bar = svgEl('rect', {x:cx-barWidth/2, y:cy, width:barWidth, height:Math.max(.7,y(0)-cy),
      fill:color, opacity:row.abnormal ? .92 : .57, 'data-turnover-date':row.date});
    const label = `${row.date} · ${turnoverDollars(row.amount)} · ${turnoverTimes(row.ratio)} · ${signedPercent(row.change)}`;
    addTitle(bar,label);
    bar.addEventListener('click', event => {event.stopPropagation(); turnoverPopover(row,event)});
    bars.appendChild(bar);
    if (!row.abnormal && !row.events.length) return;

    const target = svgEl('g', {class:'turnover-marker',role:'button',tabindex:0,
      'aria-label':label+(row.abnormal?' · 成交异常':'')+row.events.map(event=>' · '+event.title).join(''),
      'data-turnover-marker':row.date});
    const my = cy-2;
    if (row.events.length) target.appendChild(svgEl('circle', {cx, cy:my, r:markerSize,
      fill:'#c77a19', stroke:'#fff', 'stroke-width':1, 'data-market-event':row.date}));
    if (row.abnormal) {
      const yy = row.events.length ? my-markerSize*2-2 : my;
      const m = markerSize+.4;
      target.appendChild(svgEl('path', {d:`M${cx} ${yy-m} l${m} ${m} -${m} ${m} -${m} -${m} Z`,
        fill:'#f7faf9', stroke:'#3b5592', 'stroke-width':1.4, 'data-market-anomaly':row.date}));
    }
    addTitle(target,label+'\n'+row.events.map(event=>event.title).join('；'));
    target.addEventListener('click', event => {event.stopPropagation(); turnoverPopover(row,event)});
    target.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      turnoverPopover(row, {clientX:rect.right,clientY:rect.bottom});
    });
    markers.appendChild(target);
  });
  svg.appendChild(bars);
  svg.appendChild(svgEl('path',{d:linePath(rows,'baseline',x,y),fill:'none',stroke:'#687876',
    'stroke-dasharray':'4 4','stroke-width':1.3,'pointer-events':'none'}));
  svg.appendChild(markers);
}

function renderActivityAlerts(item) {
  const panel = $('#activityAlerts');
  panel.hidden = !item.activity?.watch;
  if (panel.hidden) return;
  const rows = item.activity.alerts;
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const past = rows.filter(alert => alert.date <= item.price_end);
  const future = rows.filter(alert => alert.date >= today && alert.date > item.price_end && alert.phase === '盘前观察')
    .sort((a,b) => a.date.localeCompare(b.date));
  const last = past.filter(alert => alert.date === item.price_end && alert.phase === '收盘确认');
  const earlier = past.filter(alert => alert.date < item.price_end && alert.phase === '收盘确认').slice(0,3);
  $('#alertRuleVersion').textContent = `规则 v${payload.activity_rules.version} · 美东 · 看板内提醒`;
  const show = (entries, empty) => entries.length ? entries.map(alert => {
    const body = `<small>${esc(alert.date)}</small><span>${esc(alert.reasons.join(' · '))}</span>`;
    const urls = (alert.sources || []).filter(validSource);
    return `<div class="activity-alert-row">${alert.date <= item.price_end
      ? `<button type="button" data-alert-day="${esc(alert.date)}">${body}</button>`
      : body}${urls.length ? ` <a href="${esc(urls[0])}" target="_blank" rel="noreferrer">出处</a>` : ''}</div>`;
  }).join('') : `<p class="activity-empty">${empty}</p>`;
  const evidence = item.activity.evidence;
  $('#watchEvidence').textContent = evidence
    ? `历史大波动后次日（${evidence.samples} 日）成交中位 ${turnoverTimes(evidence.median)}，放量率 ${fmtPct(evidence.shock_rate)}，全期 ${fmtPct(evidence.baseline_rate)}。`
    : '';
  $('#watchAlerts').innerHTML = show(future.slice(0,4), '近期交易日暂无观察信号');
  $('#closeAlerts').innerHTML = show(last,`${item.price_end} 收盘成交额未达到异常阈值`) +
    (earlier.length ? `<details><summary>最近历史命中</summary>${show(earlier,'')}</details>` : '');
  panel.querySelectorAll('[data-alert-day]').forEach(button =>
    button.addEventListener('click', () => showTurnoverDay(item, button.dataset.alertDay)));
}

function showTurnoverDay(item, day) {
  const scroll = $('#timelineScroll');
  const width = Number($('#timelineTrack').dataset.chartWidth);
  scroll.scrollLeft = dateScale(plotStart(item), item.price_end, 58, width-18)(day)-scroll.clientWidth/2;
  const marker = $(`[data-turnover-marker="${day}"]`);
  if (marker) {
    $('#turnoverChart').scrollIntoView({block:'nearest',behavior:'instant'});
    requestAnimationFrame(() => requestAnimationFrame(() => marker.dispatchEvent(
      new KeyboardEvent('keydown',{key:'Enter'}))));
  }
}

function renderTurnoverCases(item) {
  const host = $('#turnoverCases');
  const data = (item.activity?.days || []).filter(row => row.ratio != null && row.abnormal);
  host.hidden = !data.length;
  if (host.hidden) return;
  const byRatio = [...data].sort((a,b) => b.ratio-a.ratio)[0];
  const byAmount = [...data].sort((a,b) => (b.amount-b.baseline)-(a.amount-a.baseline))[0];
  const byEvent = [...data].filter(row => row.events.some(event => validSource(event.url)))
    .sort((a,b) => b.ratio-a.ratio)[0];
  const dates = new Map();
  [[byRatio,'最高倍数'],[byAmount,'最大增额'],[byEvent,'事件放量']].forEach(([row,label]) => {
    if (!row) return;
    if (!dates.has(row.date)) dates.set(row.date,{row,labels:[]});
    dates.get(row.date).labels.push(label);
  });
  host.innerHTML = '<b>成交额案例</b>'+[...dates.values()].map(({row,labels}) =>
    `<button type="button" data-case-day="${row.date}">${labels.join(' / ')} · ${row.date} · ${turnoverTimes(row.ratio)}</button>`
  ).join('');
  host.querySelectorAll('button').forEach(button =>
    button.addEventListener('click', () => showTurnoverDay(item,button.dataset.caseDay)));
}
