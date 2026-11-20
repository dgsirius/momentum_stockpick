(() => {
  const panel = document.getElementById('etfBreadth');
  if (!panel) return;
  const symbols = panel.dataset.symbols.split(' ');
  const statusNames = {ready:'已更新', insufficient:'数据不足或持仓日期待核对',
    pending:'等待首次采集', unavailable:'暂不可用', refreshing:'采集中'};
  const signalNames = {triple_oversold:'三周期低于20%', triple_overbought:'三周期高于80%',
    washout_turn:'低分位回升', distribution:'高分位转弱', divergence:'40日新高背离',
    break_below_50:'高位后跌破50%'};
  const series = [
    ['ma20', '站上20日线', '#1685a4'], ['ma50', '站上50日线', '#b65d22'],
    ['ma200', '站上200日线', '#955da5'], ['smooth50', '50日广度的10日均线', '#6a7a83'],
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const percent = value => value == null ? '—' : Number(value).toFixed(1) + '%';
  const find = name => panel.querySelector(`[data-breadth="${name}"]`);
  const symbolSelect = find('symbol');
  const range = find('range');
  let data = {};
  symbolSelect.innerHTML = symbols.map(s => `<option>${esc(s)}</option>`).join('');
  symbolSelect.hidden = symbols.length === 1;

  function renderChart(container, rows, symbol) {
    const W = 960, H = 240, L = 47, R = 22, T = 15, B = 31;
    const x = i => L + i / Math.max(1, rows.length - 1) * (W - L - R);
    const y = value => T + (100 - value) * (H - T - B) / 100;
    const grid = [0,20,50,80,100].map(v => `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#cbd9d4" stroke-dasharray="${v===50?'5 4':'2 4'}"/><text x="${L-7}" y="${y(v)+4}" text-anchor="end">${v}%</text>`).join('');
    const paths = series.map(([key, name, color]) => {
      let penDown = false;
      const path = rows.map((row, i) => {
        const value = row[key];
        if (value == null) { penDown = false; return ''; }
        const move = penDown ? 'L' : 'M';
        penDown = true;
        return `${move}${x(i).toFixed(2)},${y(value).toFixed(2)}`;
      }).join(' ');
      return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${key==='ma50'?2.5:1.5}"><title>${name}</title></path>`;
    }).join('');
    const markers = rows.map((row, i) => {
      if (!row.signals?.length || row.ma50 == null) return '';
      const title = row.signals.map(s => signalNames[s]).join('、');
      return `<circle cx="${x(i)}" cy="${y(row.ma50)}" r="3" fill="#283d43"><title>${esc(row.date)} · ${esc(title)}</title></circle>`;
    }).join('');
    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(symbol)} 成分股广度历史">
      <rect x="${L}" y="${T}" width="${W-L-R}" height="${y(80)-T}" fill="#fbefed"/>
      <rect x="${L}" y="${y(20)}" width="${W-L-R}" height="${y(0)-y(20)}" fill="#edf6ee"/>
      ${grid}${paths}${markers}
      <text x="${L}" y="${H-6}">${esc(rows[0].date)}</text>
      <text x="${W-R}" y="${H-6}" text-anchor="end">${esc(rows.at(-1).date)}</text>
      <line data-breadth-cursor y1="${T}" y2="${H-B}" stroke="#526b70" stroke-dasharray="4 3" visibility="hidden"/>
      <rect data-breadth-hit x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/>
    </svg><div class="breadth-tooltip" role="tooltip" hidden></div>`;

    const hit = container.querySelector('[data-breadth-hit]');
    const cursor = container.querySelector('[data-breadth-cursor]');
    const tooltip = container.querySelector('.breadth-tooltip');
    let hoveredIndex = -1;
    hit.addEventListener('pointermove', event => {
      const plot = hit.getBoundingClientRect();
      if (!plot.width) return;
      const fraction = Math.max(0, Math.min(1, (event.clientX - plot.left) / plot.width));
      const index = Math.round(fraction * (rows.length - 1));
      if (index === hoveredIndex) return;
      hoveredIndex = index;
      const row = rows[index];
      const signals = (row.signals || []).map(key => signalNames[key]).filter(Boolean);
      tooltip.innerHTML = `<strong>${esc(row.date)}</strong>` + series.map(([key, name, color]) =>
        `<div><span style="color:${color}">●</span> ${name} <b>${percent(row[key])}</b></div>`
      ).join('') + (signals.length ? `<div>${esc(signals.join('、'))}</div>` : '');
      tooltip.hidden = false;
      cursor.setAttribute('x1', x(index));
      cursor.setAttribute('x2', x(index));
      cursor.setAttribute('visibility', 'visible');
      const bounds = container.getBoundingClientRect();
      const anchor = plot.left - bounds.left + index / Math.max(1, rows.length - 1) * plot.width;
      const width = tooltip.offsetWidth;
      const left = anchor + width + 12 <= bounds.width ? anchor + 12 : anchor - width - 12;
      tooltip.style.left = `${Math.max(0, left)}px`;
    });
    hit.addEventListener('pointerleave', () => {
      hoveredIndex = -1;
      tooltip.hidden = true;
      cursor.setAttribute('visibility', 'hidden');
    });
  }

  function render() {
    const symbol = symbolSelect.value || symbols[0];
    const item = data[symbol] || {};
    const row = item.latest;
    find('table').innerHTML = symbols.map(s => {
      const fund = data[s] || {};
      const r = fund.latest || {};
      const coverage = r.members ? `${r.valid?.['50'] ?? 0}/${r.members}` : '—';
      return `<tr${s===symbol?' class="breadth-selected"':''}><th scope="row"><button type="button" data-symbol="${esc(s)}">${esc(s)}</button></th><td>${esc(r.date || '—')}</td>
        <td>${percent(r.ma20)}</td><td><strong>${percent(r.ma50)}</strong></td><td>${percent(r.ma200)}</td>
        <td>${percent(r.rank50)}</td><td>${coverage}</td><td>${esc(statusNames[fund.status] || '等待首次采集')}</td></tr>`;
    }).join('');
    const rows = (item.history || []).slice(-Number(range.value));
    const chartContainer = find('chart');
    if (rows.length) renderChart(chartContainer, rows, symbol);
    else chartContainer.innerHTML = '<p class="muted">等待成分股历史日线与发行商持仓。</p>';
    find('legend').innerHTML = series.map(([,name,color]) =>
      `<span style="color:${color}">● ${name}</span>`).join('');
    const events = rows.slice(-20).filter(r => r.signals?.length).reverse().slice(0,6);
    find('signals').innerHTML = events.length ? events.map(r =>
      `<li>${esc(r.date)} · ${esc(r.signals.map(s => signalNames[s]).join('、'))}</li>`).join('')
      : '<li>近20个可见交易日无触发记录</li>';
    const changes = row?.change5 == null ? '—' : (row.change5 > 0 ? '+' : '') + row.change5.toFixed(1) + ' 个百分点';
    const valid = [20,50,200].map(n => `${n}日 ${row?.valid?.[n] ?? 0}/${row?.members ?? '—'}`).join(' · ');
    const details = row ? [
      `${symbol} · ${item.market === 'HK' ? '港股' : '美股'}收盘 ${row.date}`,
      `持仓披露 ${row.holdings_asof}`, `50日广度近5日变化 ${changes}`, `有效覆盖 ${valid}`,
      row.rank_backfill_days > 0 ? `两年分位含 ${row.rank_backfill_days} 个回算日` : null,
      row.basis === 'current_roster_backfill' ? '当前成分回算' : '当日可用持仓',
      item.holdings_warning,
    ] : [item.holdings_warning];
    find('detail').textContent = details.filter(Boolean).join(' · ');
    const source = find('source');
    source.hidden = !item.source;
    if (item.source) source.href = item.source;
  }

  panel.addEventListener('click', event => {
    const button = event.target.closest('button[data-symbol]');
    if (!button) return;
    symbolSelect.value = button.dataset.symbol;
    render();
  });
  symbolSelect.addEventListener('change', render);
  range.addEventListener('change', render);
  async function refresh() {
    try {
      const response = await fetch('/api/etf-breadth', {cache:'no-store'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      data = await response.json();
      render();
    } catch {
      find('detail').textContent = '广度接口暂不可用';
    }
  }
  window.addEventListener('paper-breadth-refresh', refresh);
  refresh();
  setInterval(refresh, 60_000);
})();
