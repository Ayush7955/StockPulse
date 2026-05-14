/* StockPulse v2 — App Logic */
const API = '';
let state = { ticker: '', period: '1y', market: 'us', charts: {}, refreshId: null, stockData: null };
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const CURRENCY_MAP = { 'USD': '$', 'INR': '₹', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'KRW': '₩' };

document.addEventListener('DOMContentLoaded', () => {
  $('#search-form').addEventListener('submit', e => { e.preventDefault(); const v = $('#search-input').value.trim().toUpperCase(); if (v) loadStock(v); });
  $$('.pill').forEach(p => p.addEventListener('click', () => { $$('.pill').forEach(x => x.classList.remove('active')); p.classList.add('active'); state.period = p.dataset.period; if (state.ticker) loadStock(state.ticker); }));
  $$('.market-tab').forEach(t => t.addEventListener('click', () => { $$('.market-tab').forEach(x => x.classList.remove('active')); t.classList.add('active'); switchMarket(t.dataset.market); }));
  $$('.pick').forEach(p => p.addEventListener('click', () => { loadStock(p.dataset.ticker); }));
  $('#compare-btn').addEventListener('click', loadComparison);
  $('#dark-toggle').addEventListener('click', toggleDark);
  $('#auto-refresh').addEventListener('change', toggleRefresh);
  $('#export-csv').addEventListener('click', exportCSV);
  setupToggles();
  if (localStorage.getItem('dark') === 'true') document.documentElement.setAttribute('data-theme', 'dark');
});

function switchMarket(m) {
  state.market = m;
  $$('.picks-row').forEach(r => r.classList.add('hidden'));
  const row = $(`#picks-${m}`);
  if (row) row.classList.remove('hidden');
}

// ── Dark Mode ──
function toggleDark() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
  localStorage.setItem('dark', !isDark);
  $('#dark-toggle').textContent = isDark ? '🌙' : '☀️';
}

// ── Auto Refresh ──
function toggleRefresh() {
  if ($('#auto-refresh').checked) {
    state.refreshId = setInterval(() => { if (state.ticker) loadStock(state.ticker); }, 60000);
    $('#refresh-label').textContent = 'Live ●';
  } else {
    clearInterval(state.refreshId);
    $('#refresh-label').textContent = 'Live';
  }
}

// ── Load Stock ──
async function loadStock(ticker) {
  state.ticker = ticker;
  $('#search-input').value = ticker;
  $('#welcome').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
  $('#stock-name').textContent = ticker;
  showLoading();
  try {
    const [stockRes, riskRes, retRes] = await Promise.all([
      fetch(`${API}/api/stock/${ticker}?period=${state.period}`).then(r => r.json()),
      fetch(`${API}/api/risk/${ticker}?period=${state.period}`).then(r => r.json()),
      fetch(`${API}/api/returns/${ticker}?period=${state.period}`).then(r => r.json())
    ]);
    if (stockRes.error) { alert(stockRes.error); hideLoading(); return; }
    state.stockData = stockRes;
    const sym = CURRENCY_MAP[stockRes.currency] || '$';
    $('#currency-badge').textContent = stockRes.currency || 'USD';
    renderMetrics(stockRes, riskRes, sym);
    renderPriceChart(stockRes);
    renderVolumeChart(stockRes);
    if (!retRes.error) { renderReturnsChart(retRes); renderHistogram(retRes); renderReturnStats(retRes); }
    if (!riskRes.error) renderDrawdownChart(riskRes);
    hideLoading();
    $('#stock-name').textContent = stockRes.name || ticker;
    // Load prediction
    loadPrediction(ticker);
  } catch (e) { console.error(e); alert('Failed to fetch. Is server running?'); hideLoading(); }
}

function showLoading() { $$('.chart-wrap').forEach(c => c.style.opacity = '0.4'); }
function hideLoading() { $$('.chart-wrap').forEach(c => c.style.opacity = '1'); }

// ── Metrics ──
function renderMetrics(s, r, sym) {
  const chg = s.change_pct || 0;
  const cls = chg >= 0 ? 'positive' : 'negative';
  const arr = chg >= 0 ? '▲' : '▼';
  $('#m-price').innerHTML = `<span class="label">Current Price</span><span class="value">${sym}${s.current_price?.toFixed(2)||'—'}</span><span class="sub ${cls}">${arr} ${Math.abs(chg).toFixed(2)}%</span>`;
  if (r.error) return;
  const vl = r.volatility > 0.4 ? 'High' : r.volatility > 0.2 ? 'Medium' : 'Low';
  const vc = r.volatility > 0.4 ? 'negative' : r.volatility > 0.2 ? '' : 'positive';
  $('#m-vol').innerHTML = `<span class="label">Volatility</span><span class="value">${r.volatility_pct?.toFixed(1)||'—'}%</span><span class="sub ${vc}">${vl} Risk</span>`;
  const sc = r.sharpe_ratio > 1 ? 'positive' : r.sharpe_ratio > 0 ? '' : 'negative';
  const sl = r.sharpe_ratio > 2 ? 'Excellent' : r.sharpe_ratio > 1 ? 'Good' : r.sharpe_ratio > 0 ? 'Below Avg' : 'Poor';
  $('#m-sharpe').innerHTML = `<span class="label">Sharpe Ratio</span><span class="value">${r.sharpe_ratio?.toFixed(2)||'—'}</span><span class="sub ${sc}">${sl}</span>`;
  const dc = r.max_drawdown_pct < -20 ? 'negative' : r.max_drawdown_pct < -10 ? '' : 'positive';
  $('#m-dd').innerHTML = `<span class="label">Max Drawdown</span><span class="value">${r.max_drawdown_pct?.toFixed(1)||'—'}%</span><span class="sub ${dc}">VaR 95%: ${r.var_95_pct?.toFixed(2)||'—'}%</span>`;
}

// ── Chart Helper ──
function makeChart(id, cfg) { if (state.charts[id]) state.charts[id].destroy(); const ctx = document.getElementById(id)?.getContext('2d'); if (!ctx) return null; state.charts[id] = new Chart(ctx, cfg); return state.charts[id]; }
const C = { close:'#26251e', sma20:'#f54e00', sma50:'#c08532', sma200:'#1f8a65', ema:'#cf2d56', bb:'rgba(159,187,224,0.6)', vol:'rgba(38,37,30,0.15)', vUp:'rgba(31,138,101,0.4)', vDn:'rgba(207,45,86,0.4)', cum:'#f54e00', dd:'#cf2d56' };
const chartFont = { family: 'Inter', size: 11 };
const monoFont = { family: 'JetBrains Mono', size: 11 };
const gridColor = 'rgba(38,37,30,0.05)';
const tickColor = 'rgba(38,37,30,0.4)';

function renderPriceChart(d) {
  makeChart('priceChart', { type: 'line', data: { labels: d.dates, datasets: [
    { label:'Close', data:d.close, borderColor:C.close, borderWidth:2, pointRadius:0, tension:0.1, order:1 },
    { label:'SMA 20', data:d.sma_20, borderColor:C.sma20, borderWidth:1.5, pointRadius:0, tension:0.1, hidden:false, order:2 },
    { label:'SMA 50', data:d.sma_50, borderColor:C.sma50, borderWidth:1.5, pointRadius:0, tension:0.1, hidden:true, order:3 },
    { label:'SMA 200', data:d.sma_200, borderColor:C.sma200, borderWidth:1.5, pointRadius:0, tension:0.1, hidden:true, order:4 },
    { label:'EMA 20', data:d.ema_20, borderColor:C.ema, borderWidth:1.5, pointRadius:0, borderDash:[4,3], tension:0.1, hidden:true, order:5 },
    { label:'BB Upper', data:d.bb_upper, borderColor:C.bb, borderWidth:1, pointRadius:0, tension:0.1, fill:false, hidden:true, order:6 },
    { label:'BB Lower', data:d.bb_lower, borderColor:C.bb, borderWidth:1, pointRadius:0, tension:0.1, fill:'-1', backgroundColor:'rgba(159,187,224,0.08)', hidden:true, order:7 },
  ]}, options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{display:false},tooltip:{backgroundColor:'#26251e',titleFont:chartFont,bodyFont:monoFont}}, scales:{ x:{ticks:{maxTicksLimit:12,font:chartFont,color:tickColor},grid:{display:false}}, y:{ticks:{font:monoFont,color:tickColor},grid:{color:gridColor}} } } });
  syncToggles();
}

function renderVolumeChart(d) {
  const colors = d.close.map((c,i) => i===0 ? C.vol : (c >= d.close[i-1] ? C.vUp : C.vDn));
  makeChart('volumeChart', { type:'bar', data:{labels:d.dates, datasets:[{label:'Volume',data:d.volume,backgroundColor:colors,borderRadius:2}]}, options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:false},y:{ticks:{font:monoFont,color:'rgba(38,37,30,0.3)',callback:v=>(v/1e6).toFixed(0)+'M'},grid:{color:gridColor}}}} });
}

function renderReturnsChart(d) {
  makeChart('cumChart', { type:'line', data:{labels:d.dates, datasets:[{label:'Cumulative %',data:d.cumulative_returns_pct,borderColor:C.cum,borderWidth:2,pointRadius:0,tension:0.1,fill:{target:'origin',above:'rgba(245,78,0,0.06)',below:'rgba(207,45,86,0.06)'}}]}, options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{maxTicksLimit:10,font:chartFont,color:tickColor},grid:{display:false}},y:{ticks:{font:monoFont,color:tickColor,callback:v=>v.toFixed(1)+'%'},grid:{color:gridColor}}}} });
}

function renderHistogram(d) {
  const h = d.histogram;
  const colors = h.labels.map(l => parseFloat(l)>=0 ? 'rgba(31,138,101,0.5)' : 'rgba(207,45,86,0.5)');
  makeChart('histChart', { type:'bar', data:{labels:h.labels.map(l=>(parseFloat(l)*100).toFixed(1)+'%'), datasets:[{label:'Freq',data:h.counts,backgroundColor:colors,borderRadius:2}]}, options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{maxTicksLimit:10,font:monoFont,color:tickColor},grid:{display:false}},y:{ticks:{font:monoFont,color:'rgba(38,37,30,0.3)'},grid:{color:gridColor}}}} });
}

function renderReturnStats(d) {
  const s = d.stats;
  $('#ret-stats').innerHTML = `
    <div class="stat-item"><div class="stat-val">${s.mean_return?.toFixed(3)}%</div><div class="stat-label">Mean Daily</div></div>
    <div class="stat-item"><div class="stat-val positive">${s.best_day?.toFixed(2)}%</div><div class="stat-label">Best Day</div></div>
    <div class="stat-item"><div class="stat-val negative">${s.worst_day?.toFixed(2)}%</div><div class="stat-label">Worst Day</div></div>
    <div class="stat-item"><div class="stat-val positive">${s.positive_pct}%</div><div class="stat-label">Positive Days</div></div>
    <div class="stat-item"><div class="stat-val">${s.positive_days}</div><div class="stat-label">Up Days</div></div>
    <div class="stat-item"><div class="stat-val">${s.negative_days}</div><div class="stat-label">Down Days</div></div>`;
}

function renderDrawdownChart(r) {
  makeChart('ddChart', { type:'line', data:{labels:r.drawdown_dates, datasets:[{label:'Drawdown',data:r.drawdown_values.map(v=>v?v*100:0),borderColor:C.dd,borderWidth:1.5,pointRadius:0,tension:0.1,fill:{target:'origin',above:'transparent',below:'rgba(207,45,86,0.1)'}}]}, options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{maxTicksLimit:10,font:chartFont,color:tickColor},grid:{display:false}},y:{ticks:{font:monoFont,color:tickColor,callback:v=>v.toFixed(0)+'%'},grid:{color:gridColor}}}} });
}

// ── Toggles ──
function setupToggles() { $$('.toggle-btn').forEach(btn => btn.addEventListener('click', () => { btn.classList.toggle('on'); syncToggles(); })); }
function syncToggles() {
  const ch = state.charts['priceChart']; if (!ch) return;
  const map = {'sma20':1,'sma50':2,'sma200':3,'ema':4,'bb':5};
  $$('.toggle-btn').forEach(btn => { const k=btn.dataset.toggle, i=map[k]; if(i===undefined)return; const on=btn.classList.contains('on'); if(k==='bb'){ch.data.datasets[5].hidden=!on;ch.data.datasets[6].hidden=!on;}else{ch.data.datasets[i].hidden=!on;} });
  ch.update();
}

// ── Prediction ──
async function loadPrediction(ticker) {
  try {
    const res = await fetch(`${API}/api/predict/${ticker}?period=${state.period}`).then(r => r.json());
    if (res.error) { $('#pred-cards').innerHTML = `<div class="pred-card" style="grid-column:1/-1"><div class="pc-label">Prediction unavailable</div><div class="pc-sub">${res.error}</div></div>`; return; }
    const sym = CURRENCY_MAP[state.stockData?.currency] || '$';
    const d7c = res.pred_7d_change >= 0 ? 'positive' : 'negative';
    const d30c = res.pred_30d_change >= 0 ? 'positive' : 'negative';
    $('#pred-cards').innerHTML = `
      <div class="pred-card"><div class="pc-label">7-Day Target</div><div class="pc-value ${d7c}">${sym}${res.pred_7d?.toFixed(2)}</div><div class="pc-sub ${d7c}">${res.pred_7d_change>=0?'+':''}${res.pred_7d_change?.toFixed(2)}%</div></div>
      <div class="pred-card"><div class="pc-label">30-Day Target</div><div class="pc-value ${d30c}">${sym}${res.pred_30d?.toFixed(2)}</div><div class="pc-sub ${d30c}">${res.pred_30d_change>=0?'+':''}${res.pred_30d_change?.toFixed(2)}%</div></div>
      <div class="pred-card"><div class="pc-label">Direction</div><div class="pc-value">${res.direction === 'up' ? '📈 Bullish' : '📉 Bearish'}</div><div class="pc-sub">ML Confidence</div></div>
      <div class="pred-card"><div class="pc-label">Model Accuracy</div><div class="pc-value">${res.accuracy?.toFixed(1)}%</div><div class="pc-sub">R² Score: ${res.r2?.toFixed(3)}</div></div>`;
    // Prediction chart
    const histDates = res.hist_dates || [];
    const histPrices = res.hist_prices || [];
    const predDates = res.forecast_dates || [];
    const predPrices = res.forecast_prices || [];
    const upperBand = res.upper_band || [];
    const lowerBand = res.lower_band || [];
    const allDates = [...histDates, ...predDates];
    const histLine = [...histPrices, ...predDates.map(() => null)];
    const predLine = [...histDates.map(() => null), ...predPrices];
    const upLine = [...histDates.map(() => null), ...upperBand];
    const dnLine = [...histDates.map(() => null), ...lowerBand];
    makeChart('predChart', { type:'line', data:{labels:allDates, datasets:[
      {label:'Historical',data:histLine,borderColor:C.close,borderWidth:2,pointRadius:0,tension:0.1},
      {label:'Forecast',data:predLine,borderColor:'#c08532',borderWidth:2,pointRadius:0,borderDash:[6,3],tension:0.1},
      {label:'Upper Band',data:upLine,borderColor:'rgba(192,133,50,0.3)',borderWidth:1,pointRadius:0,tension:0.1,fill:false},
      {label:'Lower Band',data:dnLine,borderColor:'rgba(192,133,50,0.3)',borderWidth:1,pointRadius:0,tension:0.1,fill:'-1',backgroundColor:'rgba(192,133,50,0.08)'},
    ]}, options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{labels:{font:chartFont,usePointStyle:true,pointStyle:'line'}}}, scales:{x:{ticks:{maxTicksLimit:12,font:chartFont,color:tickColor},grid:{display:false}},y:{ticks:{font:monoFont,color:tickColor},grid:{color:gridColor}}}} });
  } catch (e) { console.error('Prediction error:', e); }
}

// ── Comparison ──
async function loadComparison() {
  const tickers = [];
  $$('.comp-ticker').forEach(i => { const v = i.value.trim().toUpperCase(); if (v) tickers.push(v); });
  if (tickers.length < 2) { alert('Enter at least 2 tickers to compare'); return; }
  try {
    const res = await fetch(`${API}/api/compare?tickers=${tickers.join(',')}&period=${state.period}`).then(r => r.json());
    if (res.error) { alert(res.error); return; }
    $('#compare-results').classList.remove('hidden');
    renderCompareChart(res); renderCorrelation(res); renderBetas(res);
  } catch (e) { console.error(e); alert('Comparison failed'); }
}

const CC = ['#f54e00','#1f8a65','#c08532','#cf2d56','#9fbbe0','#c0a8dd'];
function renderCompareChart(d) {
  const ds = d.tickers.map((t,i) => ({label:t, data:d.normalized[t], borderColor:CC[i%CC.length], borderWidth:2, pointRadius:0, tension:0.1}));
  makeChart('compareChart', { type:'line', data:{labels:d.dates,datasets:ds}, options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{labels:{font:chartFont,usePointStyle:true,pointStyle:'line'}}}, scales:{x:{ticks:{maxTicksLimit:10,font:chartFont,color:tickColor},grid:{display:false}},y:{ticks:{font:monoFont,color:tickColor},grid:{color:gridColor}}}} });
}

function renderCorrelation(d) {
  const c = d.correlation; let h = '<table class="corr-table"><tr><th></th>';
  c.labels.forEach(l => h += `<th>${l}</th>`); h += '</tr>';
  c.matrix.forEach((row,i) => { h += `<tr><th>${c.labels[i]}</th>`; row.forEach(v => { const bg = v>0.7?'rgba(31,138,101,0.15)':v>0.3?'rgba(192,133,50,0.1)':v<0?'rgba(207,45,86,0.1)':'transparent'; h += `<td style="background:${bg}">${v?.toFixed(3)||'—'}</td>`; }); h += '</tr>'; });
  h += '</table>'; $('#corr-table').innerHTML = h;
}

function renderBetas(d) {
  let h = ''; Object.entries(d.betas||{}).forEach(([t,b]) => { const c = b>1?'negative':'positive'; h += `<span class="beta-tag"><strong>${t}</strong> β = <span class="${c}">${b?.toFixed(3)||'—'}</span></span>`; });
  $('#beta-tags').innerHTML = h || '<span class="beta-tag">No beta data</span>';
}

// ── Export CSV ──
function exportCSV() {
  const d = state.stockData; if (!d) { alert('Load a stock first'); return; }
  let csv = 'Date,Open,High,Low,Close,Volume\n';
  d.dates.forEach((dt,i) => { csv += `${dt},${d.open[i]},${d.high[i]},${d.low[i]},${d.close[i]},${d.volume[i]}\n`; });
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${d.ticker}_${state.period}.csv`; a.click();
}
