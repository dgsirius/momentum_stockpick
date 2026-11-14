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

function alertTradingPain({item, alert}) {
  const categories = alert.categories || [];
  if (alert.phase === '收盘确认') {
    const day = item.activity.days.find(row => row.date === alert.date);
    if (day?.change > 0) return '放量上涨后，判断涨势能否延续，还是会回吐当日涨幅。';
    if (day?.change < 0) return '放量下跌后，判断卖压是否延续，还是已出现止跌迹象。';
    return '成交放大但方向不明，难点是判断区间会往哪一侧突破。';
  }
  if (categories.some(category => category.includes('财报'))) {
    const earnings = item.activity.study?.find(scene => scene.label === '公司财报反应日');
    if (earnings?.samples >= 5) {
      return `财报反应日历史成交中位 ${turnoverTimes(earnings.median)}，难点是判断跳空会延续还是回补。`;
    }
    return item.kind === 'stock'
      ? '财报后的跳空可能很快反转，难点是判断开盘方向能否延续。'
      : '龙头财报带动 ETF 波动，难点是判断上涨或下跌是否扩散到其他成分股。';
  }
  if (categories.some(category => category.startsWith('OPEC+'))) {
    return item.symbol === 'XLE'
      ? '油价变动传到能源股的幅度不一，难点是判断板块能否跟随。'
      : '会议后油价可能跳空，难点是判断初始波动能否延续到常规交易时段。';
  }
  if (categories.some(category => ['FOMC','美国CPI','美国非农'].includes(category))) {
    return item.symbol === 'GLD'
      ? '数据发布后美元与利率可能同向或背离，难点是判断金价的初始反应能否延续。'
      : '数据发布后容易出现来回波动，难点是判断首波走势能否延续到收盘。';
  }
  if (alert.previous_shock) return '前一日大幅波动后，难点是判断开盘会顺势延续还是快速反转。';
  const pain = item.holder_psychology?.pain_points?.[0];
  return pain ? `${pain}？` : '难点是判断事件引发的短线波动能否形成持续走势。';
}

function renderActivityAlerts(selectedItem) {
  const panel = $('#activityAlerts');
  const monitored = Object.values(payload.symbols).filter(item => item.activity?.watch);
  panel.hidden = !monitored.length;
  if (panel.hidden) return;
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const byDate = (a,b) => a.alert.date.localeCompare(b.alert.date);
  const rows = monitored.flatMap(item => item.activity.alerts.map(alert => ({item,alert})));
  const future = rows.filter(({item,alert}) =>
    alert.phase === '盘前观察' && alert.date >= today && alert.date > item.price_end).sort(byDate);
  const closeRows = rows.filter(({alert}) => alert.phase === '收盘确认');
  const last = closeRows.filter(({item,alert}) => alert.date === item.price_end);
  const earlier = monitored.flatMap(item => closeRows
    .filter(row => row.item === item && row.alert.date < item.price_end).slice(0,3))
    .sort((a,b) => byDate(b,a));
  $('#alertRuleVersion').textContent = `监控 ${monitored.length} 个标的 · 美东 · 规则 v${payload.activity_rules.version}`;
  $('#watchStatus').textContent = future.length ? `${future.length} 条观察` : '暂无信号';
  $('#watchStatus').dataset.active = String(future.length > 0);
  $('#closeStatus').textContent = last.length ? `${last.length} 条成交异常` : '未触发';
  $('#closeStatus').dataset.active = String(last.length > 0);
  const showRow = ({item,alert}) => {
    const body = `<small>${esc(alert.date)}</small><span>${esc(alert.reasons.join(' · '))}</span>`;
    const urls = (alert.sources || []).filter(validSource);
    return `<div class="activity-alert-row"><button type="button" data-alert-symbol="${esc(item.symbol)}" data-alert-day="${esc(alert.date)}">${body}</button>${urls.length ? ` <a href="${esc(urls[0])}" target="_blank" rel="noreferrer">出处</a>` : ''}</div>`;
  };
  const show = (entries, empty) => {
    if (!entries.length) return `<p class="activity-empty">${empty}</p>`;
    const bySymbol = new Map();
    for (const row of entries) {
      if (!bySymbol.has(row.item.symbol)) bySymbol.set(row.item.symbol, []);
      bySymbol.get(row.item.symbol).push(row);
    }
    return [[true,'个股'],[false,'主题 / ETF']].map(([stock,label]) => {
      const groups = [...bySymbol.values()].filter(([row]) => (row.item.kind === 'stock') === stock);
      if (!groups.length) return '';
      return `<div class="activity-group"><h4>${label}</h4>${groups.map(group => {
        const {item} = group[0];
        return `<div class="activity-asset" data-alert-group="${esc(item.symbol)}">
          <h5><span class="activity-symbol">${esc(item.symbol)}</span>${esc(item.name)}</h5>
          ${group.map(showRow).join('')}
          <p class="activity-pain"><strong>交易痛点</strong> ${esc(alertTradingPain(group[0]))}</p>
        </div>`;
      }).join('')}</div>`;
    }).join('');
  };
  const evidence = selectedItem.activity?.evidence;
  $('#watchEvidence').textContent = evidence
    ? `${selectedItem.symbol} 历史大波动后次日（${evidence.samples} 日）成交中位 ${turnoverTimes(evidence.median)}，放量率 ${fmtPct(evidence.shock_rate)}，全期 ${fmtPct(evidence.baseline_rate)}。`
    : '';
  $('#watchAlerts').innerHTML = show(future, '近期交易日暂无观察信号');
  $('#closeAlerts').innerHTML = show(last,`${payload.market_as_of} 收盘未触发成交异常`) +
    (earlier.length ? `<details><summary>最近历史命中</summary>${show(earlier,'')}</details>` : '');
  panel.querySelectorAll('[data-alert-day]').forEach(button =>
    button.addEventListener('click', () => {
      const item = payload.symbols[button.dataset.alertSymbol];
      if (item !== selectedItem) selectSymbol(item.symbol);
      if (button.dataset.alertDay <= item.price_end) showTurnoverDay(item, button.dataset.alertDay);
    }));
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
  const study = $('#turnoverStudy');
  const scenes = item.activity?.study || [];
  study.hidden = !scenes.length;
  if (scenes.length) {
    $('#turnoverStudyRange').textContent = `${item.price_start} 至 ${item.price_end} · 美东交易日`;
    $('#turnoverStudyRows').innerHTML = scenes.map(scene =>
      `<tr><th scope="row">${esc(scene.label)}</th><td>${scene.samples}</td>
      <td>${turnoverTimes(scene.median)}</td><td>${scene.abnormal_rate == null ? '—' : fmtPct(scene.abnormal_rate)}</td></tr>`
    ).join('');
  }
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
