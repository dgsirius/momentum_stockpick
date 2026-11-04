(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  let lang = 'zh';
  const L = (zh, en) => lang === 'en' ? en : zh;
  let payload, points = [], months = 12, selected = -1;
  let width = 1000;
  const height = 205, left = 44, right = 14, top = 12, bottom = 28;
  const fmt = n => Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN');
  const signed = n => `${n > 0 ? '+' : ''}${fmt(n)}`;
  let x, y;

  function select(index) {
    if (!points.length) return;
    selected = Math.max(0, Math.min(points.length - 1, index));
    const row = points[selected], tip = byId('tooltip');
    tip.textContent = `${row.date}\n${L('新高','Highs')} ${fmt(row.new_highs)} · ${L('新低','Lows')} ${fmt(row.new_lows)}\n${L('净新高','Net')} ${signed(row.net)} · ${L('股票','Issues')} ${fmt(row.total_issues)}`;
    tip.hidden = false;
    const plotWidth = byId('plot').clientWidth;
    tip.style.left = `${Math.max(0, Math.min(plotWidth - tip.offsetWidth, x(selected) / width * plotWidth + 12))}px`;
    byId('cursor').setAttribute('x1', x(selected));
    byId('cursor').setAttribute('x2', x(selected));
    byId('cursor').style.display = '';
  }

  function render() {
    width = Math.max(280, byId('plot').clientWidth);
    byId('chart').setAttribute('viewBox', `0 0 ${width} ${height}`);
    const latest = payload.rows.at(-1);
    const cutoff = new Date(`${latest.date}T12:00:00Z`);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    points = payload.rows.filter(row => row.date >= cutoff.toISOString().slice(0, 10));
    x = i => left + i / Math.max(1, points.length - 1) * (width - left - right);
    const max = Math.max(1, ...points.flatMap(row => [row.new_highs, row.new_lows]));
    const step = Math.max(10, Math.ceil(max / 4 / 50) * 50), upper = Math.ceil(max / step) * step;
    y = n => top + (1 - n / upper) * (height - top - bottom);
    const grid = Array.from({length: upper / step + 1}, (_, i) => i * step).map(n => `<line class="grid" x1="${left}" x2="${width - right}" y1="${y(n)}" y2="${y(n)}"/><text class="axis" x="${left - 8}" y="${y(n) + 4}" text-anchor="end">${fmt(n)}</text>`).join('');
    const ticks = width < 600 ? [0, points.length - 1] : [0, Math.floor(points.length / 3), Math.floor(points.length * 2 / 3), points.length - 1];
    const dates = [...new Set(ticks)].map(i => `<text class="axis" x="${x(i)}" y="${height - 5}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${points[i].date}</text>`).join('');
    const line = key => points.map((row, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(row[key]).toFixed(2)}`).join(' ');
    const description = L(`${points[0].date}至${latest.date}：全美股52周新高与新低`, `${points[0].date} to ${latest.date}: US stocks 52-week new highs and lows`);
    byId('chart').innerHTML = `<title>${description}</title>${grid}${dates}<path class="series high-line" d="${line('new_highs')}"/><path class="series low-line" d="${line('new_lows')}"/><line id="cursor" class="crosshair" y1="${top}" y2="${height - bottom}" style="display:none"/>`;
    byId('tooltip').hidden = true;
    selected = -1;
    document.querySelectorAll('[data-months]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.months) === months)));
  }

  document.querySelectorAll('[data-months]').forEach(button => button.addEventListener('click', () => {
    months = Number(button.dataset.months);
    render();
  }));
  window.addEventListener('resize', () => { if (payload?.rows?.length) render(); });
  new ResizeObserver(() => { if (payload?.rows?.length && byId('plot').clientWidth > 0) render(); }).observe(byId('plot'));
  byId('chart').addEventListener('pointermove', event => {
    const box = byId('chart').getBoundingClientRect();
    const svgX = (event.clientX - box.left) / box.width * width;
    select(Math.round((svgX - left) / (width - left - right) * (points.length - 1)));
  });
  byId('chart').addEventListener('pointerleave', () => {
    byId('tooltip').hidden = true;
    if (byId('cursor')) byId('cursor').style.display = 'none';
  });
  byId('chart').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    select(event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : (selected < 0 ? points.length - 1 : selected + (event.key === 'ArrowRight' ? 1 : -1)));
  });
  function updateLanguage() {
    try { lang = window.parent.document.documentElement.lang.startsWith('en') ? 'en' : 'zh'; } catch (_) {}
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title = L('全美股52周新高新低', 'US Stocks 52-week New Highs & Lows');
    byId('chart').setAttribute('aria-label', L('每日52周新高和新低股票数量曲线', 'Daily counts of stocks making new 52-week highs and lows'));
    document.querySelector('.ranges').setAttribute('aria-label', L('历史范围', 'Historical range'));
    const copy = {
      high: ['52周新高', '52-week new highs'], low: ['52周新低', '52-week new lows'],
      net: ['净新高', 'Net new highs'], issues: ['符合条件的股票', 'Qualifying issues'],
      source: ['独立计算 · 行情来源：', 'Independent calculation · Prices: '],
      eod: [' · 收盘后更新', ' · Updated after close'], method: ['计算与更新口径', 'Methodology & updates'],
      methodBody: ['股票池来自 Nasdaq 全市场挂牌目录，包括跨交易所普通股及 ADR；排除 ETF、优先股、权证、单位证券及名称标识的基金。上市未满一年、365日窗口内少于200根有效日K、无有效成交的标的不计入当日。当天最高价严格超过此前365日最高价，计为新高；当天最低价严格低于此前365日最低价，计为新低。比较窗口排除当天，使用源站拆股调整行情。两条线都表示正数股票数量，虚线为新低。', 'Universe: common stocks and ADRs across exchanges from the Nasdaq listing directory. ETFs, preferred shares, warrants, units and named funds are excluded. A stock needs one year of history, at least 200 valid bars in the trailing 365 days, and valid trading volume on the observation date. A new high strictly exceeds the prior 365-day high; a new low strictly undercuts the prior low. Today is excluded from the window. Prices use the source’s split adjustment. Both curves are positive counts; new lows use a dashed line.'],
      updateBody: ['随看板刷新，在最新美股交易日收盘后回补数据；盘中保留最近已完成交易日。数据缺失不按零处理，刷新失败保留上次成功快照。历史按当前挂牌证券名单回算，存在幸存者偏差；来源、筛选和价格调整方法不同，数量不与其他网站强行对齐。', 'The dashboard refresh checks for a new completed US session. Intraday views retain completed-session data. Missing prices are excluded rather than filled with zero; failures retain the previous successful snapshot. Historical counts use today’s listed universe and have survivorship bias. Counts can differ from other providers because of universe and price-adjustment choices.']
    };
    document.querySelectorAll('[data-copy]').forEach(node => { node.textContent = copy[node.dataset.copy][lang === 'en' ? 1 : 0]; });
    document.querySelector('h2').textContent = L('全美股 · 52周新高 / 新低', 'US Stocks · 52-week New Highs / New Lows');
    document.querySelectorAll('[data-months]').forEach(button => { button.textContent = ({3: L('3个月', '3M'), 6: L('半年', '6M'), 12: L('1年', '1Y')})[button.dataset.months]; });
    if (payload?.rows?.length) updateMetrics();
  }
  function updateMetrics() {
    const data = payload;
    const latest = data.rows.at(-1);
    byId('highs').textContent = fmt(latest.new_highs);
    byId('lows').textContent = fmt(latest.new_lows);
    byId('net').textContent = signed(latest.net);
    byId('net').style.color = latest.net < 0 ? '#c44b48' : '#16805d';
    byId('universe').textContent = fmt(latest.total_issues);
    byId('asof').textContent = L(`数据截至 ${data.as_of} · 美股已完成交易日`, `As of ${data.as_of} · Completed US session`);
    byId('balance').textContent = latest.new_highs > 0 ? L(`新低 / 新高 ${(latest.new_lows / latest.new_highs).toFixed(2)} 倍`, `Lows / highs ${(latest.new_lows / latest.new_highs).toFixed(2)}×`) : L('新高为零', 'No new highs');
    byId('coverage').textContent = L(`历史覆盖 ${fmt(data.histories_count)} / ${fmt(data.universe_count)} 只普通股及 ADR（${data.coverage_pct}%）· 满一年后纳入统计`, `Histories: ${fmt(data.histories_count)} / ${fmt(data.universe_count)} common stocks & ADRs (${data.coverage_pct}%) · One-year seasoning`);
    const age = Math.floor((Date.now() - Date.parse(`${data.as_of}T21:00:00Z`)) / 86400000);
    byId('status').textContent = data.refresh_error ? L('本次独立行情刷新失败，当前显示上次成功快照。', 'Refresh failed. Showing the last successful snapshot.') : age > 5 ? L('数据已超过5个自然日未更新，请留意统计日期。', 'Data is over five calendar days old. Check the as-of date.') : data.coverage_pct < 100 ? L(`有 ${data.missing_count + data.stale_count} 只证券缺少本次有效历史，已排除，未按零计入。`, `${data.missing_count + data.stale_count} securities lack valid current histories and are excluded, not counted as zero.`) : '';
    render();
  }
  updateLanguage();
  try { if (window.parent !== window) new MutationObserver(updateLanguage).observe(window.parent.document.documentElement, {attributes: true, attributeFilter: ['lang']}); } catch (_) {}
  let loading = false;
  function loadData() {
    if (loading) return;
    loading = true;
    return fetch('./market_breadth_data.json', {cache: 'no-store'}).then(response => {
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    return response.json();
  }).then(data => {
    if (!data.rows?.length) throw Error(L('尚无成功快照，请刷新看板', 'No successful snapshot yet. Refresh the dashboard.'));
    if (payload?.generated_at === data.generated_at && payload?.refresh_error === data.refresh_error) return;
    payload = data;
    updateMetrics();
  }).catch(error => {
    if (!payload) byId('asof').textContent = L('数据暂不可用', 'Data unavailable');
    byId('status').textContent = payload ? L('检查更新失败，保留当前快照。', 'Update check failed. Retaining the current snapshot.') : `${L('新高新低数据加载失败', 'Breadth data could not be loaded')}: ${error.message}`;
  }).finally(() => { loading = false; });
  }
  loadData();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadData(); });
  setInterval(() => { if (!document.hidden) loadData(); }, 60000);
})();
