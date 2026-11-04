(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  // The user has authorized personal local use only.
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
    document.querySelector('.breadth').textContent = '此数据仅供本地个人使用。';
    return;
  }
  let payload, points = [], months = 12, selected = -1;
  let width = 1000;
  const height = 205, left = 44, right = 14, top = 12, bottom = 28;
  const fmt = n => Number(n).toLocaleString('zh-CN');
  const signed = n => `${n > 0 ? '+' : ''}${fmt(n)}`;
  let x, y;

  function select(index) {
    if (!points.length) return;
    selected = Math.max(0, Math.min(points.length - 1, index));
    const row = points[selected], tip = byId('tooltip');
    tip.textContent = `${row.date}\n新高 ${fmt(row.new_highs)} · 新低 ${fmt(row.new_lows)}\n净新高 ${signed(row.net)} · 股票 ${fmt(row.total_issues)}`;
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
    byId('chart').innerHTML = `<title>${points[0].date}至${latest.date}：全美股52周新高与新低</title>${grid}${dates}<path class="series high-line" d="${line('new_highs')}"/><path class="series low-line" d="${line('new_lows')}"/><line id="cursor" class="crosshair" y1="${top}" y2="${height - bottom}" style="display:none"/>`;
    byId('tooltip').hidden = true;
    selected = -1;
    document.querySelectorAll('[data-months]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.months) === months)));
  }

  document.querySelectorAll('[data-months]').forEach(button => button.addEventListener('click', () => {
    months = Number(button.dataset.months);
    render();
  }));
  window.addEventListener('resize', () => { if (payload?.rows?.length) render(); });
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
  fetch('./data.json', {cache: 'no-store'}).then(response => {
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    return response.json();
  }).then(data => {
    payload = data;
    if (!data.rows?.length) throw Error('尚无成功快照，请刷新趋势评分');
    const latest = data.rows.at(-1);
    byId('highs').textContent = fmt(latest.new_highs);
    byId('lows').textContent = fmt(latest.new_lows);
    byId('net').textContent = signed(latest.net);
    byId('net').style.color = latest.net < 0 ? '#c44b48' : '#16805d';
    byId('universe').textContent = fmt(latest.total_issues);
    byId('asof').textContent = `数据截至 ${data.as_of} · 美股已完成交易日`;
    byId('balance').textContent = latest.new_highs > 0 ? `新低 / 新高 ${(latest.new_lows / latest.new_highs).toFixed(2)} 倍` : '新高为零';
    const sourceAge = Math.floor((Date.now() - Date.parse(`${data.as_of}T21:00:00Z`)) / 86400000);
    byId('status').textContent = data.refresh_error ? '本次来源更新失败，当前显示上次成功快照。' : sourceAge > 5 ? '来源数据已超过5个自然日未更新，请留意上方统计日期。' : '';
    if (data.checked_at) byId('status').title = `最近检查：${data.checked_at}`;
    render();
  }).catch(error => {
    byId('asof').textContent = '数据暂不可用';
    byId('status').textContent = `新高新低数据加载失败：${error.message}`;
  });
})();
