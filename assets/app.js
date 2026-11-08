/* Screener RSI + MACD — Mercados Sin Filtro */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const S = {rows: null, ser: null, fechas: null, q: '', senal: '', cruce: '', div: '', dage: '', rsi: '', liq: '', ex: '', sort: 'volusd', dir: -1, limit: 100, sel: null};

  // ---------- Formatos ----------
  const es = d3.timeFormatLocale({dateTime: '%x %X', date: '%d/%m/%Y', time: '%H:%M:%S', periods: ['AM', 'PM'],
    days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], shortDays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    shortMonths: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']});
  const num = d3.formatLocale({decimal: ',', thousands: '.', grouping: [3], currency: ['US$', '']});
  const fDay = es.utcFormat('%-d %b'), fLong = es.utcFormat('%-d de %B de %Y');
  const toDate = (s) => new Date(s + 'T00:00:00Z');
  const int = num.format(',');
  const price = (v) => v == null ? '—' : 'US$' + num.format(v < 1 ? ',.4f' : ',.2f')(v);
  const pct = (v) => (v > 0 ? '+' : '') + num.format('.2f')(v) + '%';
  const dec = (v, d) => num.format('.' + d + 'f')(v);
  const compact = (v) => new Intl.NumberFormat('es-AR', {notation: 'compact', maximumFractionDigits: 1}).format(v);
  const parse = (s) => s.split(',').map(Number);
  const hace = (h) => h === 0 ? 'última jornada' : h === 1 ? 'hace 1 jornada' : 'hace ' + h + ' jornadas';
  const tv = (r) => 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent((['NASDAQ', 'NYSE', 'AMEX'].includes(r.ex) ? r.ex + ':' : '') + r.sym);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const badge = (t) => el('span', 'badge b-' + t, t);
  const css = (n) => getComputedStyle($('.msf')).getPropertyValue(n).trim();
  // ---------- Nexo con la Terminal de Análisis Fundamental (Entrenando tus Finanzas) ----------
  const TERMINAL = 'https://terminal-fundamental-etf.vercel.app';
  let UNIV = null; // tickers con ficha fundamental
  const fundUrl = (sym) => TERMINAL + '/#empresa-' + sym.toLowerCase().replace(/\./g, '-');
  fetch(TERMINAL + '/universo.json').then((r) => r.ok ? r.json() : null).then((j) => {
    if (!j || !j.empresas) return;
    UNIV = new Set(Object.keys(j.empresas));
    if (S.rows) { renderLista(); renderDetalle(); }
  }).catch(() => { /* sin nexo: la página funciona igual */ });

  // ---------- Filtros ----------
  function filtered() {
    if (!S.rows) return [];
    const q = S.q.trim().toUpperCase();
    const f = S.rows.filter((r) => {
      if (q && !r.sym.includes(q) && !r.name.toUpperCase().includes(q)) return false;
      if (S.senal && r.senal !== S.senal) return false;
      if (S.cruce && r.dias > +S.cruce) return false;
      if (S.div === 'any') { if (r.div === 'Ninguna') return false; } else if (S.div && r.div !== S.div) return false;
      if (S.dage !== '' && (r.div === 'Ninguna' || r.divHace > +S.dage)) return false;
      if (S.rsi === 'lo' && !(r.rsi < 30)) return false;
      if (S.rsi === 'hi' && !(r.rsi > 70)) return false;
      if (S.rsi === 'mid' && (r.rsi < 30 || r.rsi > 70)) return false;
      if (S.liq && r.volusd < +S.liq) return false;
      if (S.ex && r.ex !== S.ex) return false;
      return true;
    });
    const k = S.sort, dir = S.dir;
    const v = (r) => k === 'divHace' && r.divHace < 0 ? (dir > 0 ? 1e9 : -1e9) : r[k];
    f.sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k]) : v(a) - v(b)) * dir);
    return f;
  }
  function selRow() {
    if (!S.rows) return null;
    if (S.sel) { const r = S.rows.find((x) => x.sym === S.sel); if (r) return r; }
    return filtered()[0] || S.rows[0];
  }

  // ---------- Resumen ----------
  function renderResumen() {
    const R = S.rows, cnt = (fn) => int(R.filter(fn).length);
    const fecha = R.reduce((m, r) => r.date > m ? r.date : m, '');
    $$('.fecha').forEach((e) => { e.textContent = fLong(toDate(fecha)); });
    $('#total').textContent = int(R.length);
    $('#t-compra').textContent = cnt((r) => r.senal === 'Compra');
    $('#t-venta').textContent = cnt((r) => r.senal === 'Venta');
    $('#t-cruces').textContent = cnt((r) => r.dias <= 3);
    $('#t-divA').textContent = cnt((r) => r.div === 'Alcista' && r.divHace <= 2);
    $('#t-divB').textContent = cnt((r) => r.div === 'Bajista' && r.divHace <= 2);
    $('#t-lo').textContent = cnt((r) => r.rsi < 30);
    $('#t-hi').textContent = cnt((r) => r.rsi > 70);
  }

  // ---------- Mini gráficos ----------
  function sparkRsi(vals) {
    const w = 96, h = 26, n = vals.length;
    const x = d3.scaleLinear([0, n - 1], [1, w - 3]), y = d3.scaleLinear([0, 100], [h - 1, 1]);
    const svg = d3.create('svg').attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);
    svg.append('rect').attr('x', 0).attr('width', w).attr('y', y(70)).attr('height', y(30) - y(70)).attr('fill', 'var(--msf-blue)').attr('opacity', 0.1);
    [30, 70].forEach((v) => svg.append('line').attr('x1', 0).attr('x2', w).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', 'var(--msf-ref)').attr('stroke-dasharray', '2 2'));
    svg.append('path').attr('d', d3.line((d, i) => x(i), (d) => y(d))(vals)).attr('fill', 'none').attr('stroke', 'var(--msf-sky)').attr('stroke-width', 1.5).attr('stroke-linejoin', 'round');
    const last = vals[n - 1];
    svg.append('circle').attr('cx', x(n - 1)).attr('cy', y(last)).attr('r', 2.5).attr('fill', last < 30 ? 'var(--msf-up)' : last > 70 ? 'var(--msf-down)' : 'var(--msf-sky)');
    return svg.node();
  }
  function sparkMacd(m, g) {
    const w = 96, h = 26, n = m.length, hist = m.map((v, i) => v - g[i]);
    const ext = d3.max([...m, ...g].map(Math.abs)) || 1;
    const x = d3.scaleLinear([0, n - 1], [1, w - 3]), y = d3.scaleLinear([-ext, ext], [h - 1, 1]);
    const bw = Math.max(1, (w - 4) / n - 0.4);
    const svg = d3.create('svg').attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);
    svg.append('g').selectAll('rect').data(hist).join('rect')
      .attr('x', (d, i) => x(i) - bw / 2).attr('width', bw)
      .attr('y', (d) => Math.min(y(d), y(0))).attr('height', (d) => Math.abs(y(d) - y(0)))
      .attr('fill', (d) => d >= 0 ? 'var(--msf-up)' : 'var(--msf-down)').attr('opacity', 0.55);
    svg.append('path').attr('d', d3.line((d, i) => x(i), (d) => y(d))(m)).attr('fill', 'none').attr('stroke', 'var(--msf-cyan)').attr('stroke-width', 1.4);
    svg.append('path').attr('d', d3.line((d, i) => x(i), (d) => y(d))(g)).attr('fill', 'none').attr('stroke', 'var(--msf-amber)').attr('stroke-width', 1);
    return svg.node();
  }

  // ---------- Tabla ----------
  function renderLista() {
    const f = filtered(), cur = selRow(), tb = $('#filas');
    $('#conteo').textContent = int(f.length);
    $$('.mas').forEach((b) => { b.hidden = f.length <= S.limit; });
    const frag = document.createDocumentFragment();
    f.slice(0, S.limit).forEach((r) => {
      const tr = el('tr'); tr.dataset.key = r.sym;
      if (cur && r.sym === cur.sym) tr.className = 'sel';
      const td = (cls) => { const c = el('td', cls); tr.append(c); return c; };
      const c0 = td(); c0.append(el('span', 'tk', r.sym));
      if (UNIV && UNIV.has(r.sym)) { const f = el('a', 'fchip', 'F'); f.href = fundUrl(r.sym); f.target = '_blank'; f.rel = 'noopener'; f.title = 'Ver análisis fundamental de ' + r.sym; c0.append(f); }
      c0.append(el('span', 'nm', r.name));
      td('n').textContent = price(r.price);
      td('n ' + (r.chg >= 0 ? 'up' : 'down')).textContent = pct(r.chg);
      td('n').append(el('span', 'rsi-chip ' + (r.rsi < 30 ? 'rsi-lo' : r.rsi > 70 ? 'rsi-hi' : ''), dec(r.rsi, 1)));
      const s = S.ser && S.ser.get(r.sym);
      const cr = td(), cm = td();
      if (s) { cr.append(sparkRsi(parse(s.s_rsi))); cm.append(sparkMacd(parse(s.s_macd), parse(s.s_sig))); }
      td().append(badge(r.senal));
      td('n c-hide').textContent = int(r.dias);
      td().append(badge(r.div));
      const ch = td('n');
      if (r.divHace >= 0) {
        ch.append(el('span', null, hace(r.divHace)));
        if (r.divEstado === 'En formación') ch.append(el('span', 'nm', 'en formación'));
      }
      td('n c-hide').textContent = compact(r.volusd);
      const a = el('a', 'tvl', 'TV ↗'); a.href = tv(r); a.target = '_blank'; a.rel = 'noopener noreferrer';
      td().append(a);
      frag.append(tr);
    });
    tb.replaceChildren(frag);
  }
  $('#filas').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-key]');
    if (tr) select(tr.dataset.key);
  });

  // ---------- Detalle ----------
  function renderDetalle() {
    const r = selRow(); if (!r) return;
    $('#d-sym').textContent = r.sym;
    $('#d-name').textContent = r.name + ' · ' + r.ex;
    $('#d-price').textContent = price(r.price);
    const ch = $('#d-chg'); ch.textContent = pct(r.chg); ch.className = r.chg >= 0 ? 'up' : 'down';
    const ri = $('#d-rsi'); ri.textContent = dec(r.rsi, 1); ri.className = r.rsi < 30 ? 'rsi-lo' : r.rsi > 70 ? 'rsi-hi' : '';
    $('#d-macd').textContent = num.format('.3~f')(r.macd);
    $('#d-sig').textContent = num.format('.3~f')(r.signal);
    $('#d-senal').replaceChildren(badge(r.senal));
    $('#d-div').replaceChildren(badge(r.div));
    $('#d-tv').href = tv(r);
    const fb = $('#d-fund'); fb.hidden = !(UNIV && UNIV.has(r.sym)); if (!fb.hidden) { fb.href = fundUrl(r.sym); fb.setAttribute('aria-label', 'Ver el análisis fundamental de ' + r.sym); }
    $('#d-tv').setAttribute('aria-label', 'Ver ' + r.sym + ' en TradingView');
    let t = 'MACD ' + (r.senal === 'Compra' ? 'por encima' : 'por debajo') + ' de su señal: cruzó ' + (r.dias === 1 ? 'en la última rueda' : 'hace ' + r.dias + ' ruedas') + '. ';
    if (S.fechas && r.div !== 'Ninguna') {
      const dts = S.fechas.slice(-60), d = (i) => dts[i] ? fDay(toDate(dts[i].fecha)) : '';
      const est = r.divEstado === 'En formación' ? ' Todavía en formación: el punto más reciente puede cambiar en las próximas ruedas.' : ' Confirmada.';
      t += r.div === 'Alcista'
        ? 'Divergencia alcista (' + hace(r.divHace) + ') entre el ' + d(r.divA) + ' y el ' + d(r.divB) + ': el precio marcó un mínimo más bajo pero el RSI uno más alto.' + est
        : 'Divergencia bajista (' + hace(r.divHace) + ') entre el ' + d(r.divA) + ' y el ' + d(r.divB) + ': el precio marcó un máximo más alto pero el RSI uno más bajo.' + est;
    } else if (r.div === 'Ninguna') t += 'Sin divergencia RSI en las últimas 10 jornadas.';
    $('#d-txt').textContent = t;
    renderGraficos(r);
  }

  // ---------- Gráfico principal: Lightweight Charts (TradingView) ----------
  const HIST = new Map();
  let CH = null; // {chart, sym}
  const C = {up: '#34d399', down: '#fb7185', cyan: '#22d3ee', sky: '#38bdf8', amber: '#fbbf24', muted: '#8ea8cc', grid: 'rgba(120,160,220,0.07)', line: 'rgba(56,189,248,0.25)'};

  function emaJs(x, n, start) {
    const o = new Array(x.length).fill(null), k = 2 / (n + 1);
    if (x.length < start + n) return o;
    let s = 0; for (let i = start; i < start + n; i++) s += x[i];
    s /= n; o[start + n - 1] = s;
    for (let i = start + n; i < x.length; i++) { s = x[i] * k + s * (1 - k); o[i] = s; }
    return o;
  }
  function rsiJs(c, n = 14) {
    const o = new Array(c.length).fill(null); if (c.length <= n) return o;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; g += Math.max(d, 0); l += Math.max(-d, 0); }
    g /= n; l /= n; o[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < c.length; i++) {
      const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
      o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return o;
  }

  function cargarHist(sym) {
    if (HIST.has(sym)) return HIST.get(sym);
    const p = fetch('data/hist/' + encodeURIComponent(sym) + '.json' + v).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    HIST.set(sym, p); p.catch(() => HIST.delete(sym));
    return p;
  }

  function renderGraficos(r) {
    const box = $('#graficos'); if (!box || !r) return;
    if (CH && CH.sym === r.sym) return;
    const sym = r.sym;
    cargarHist(sym).then((h) => {
      if (selRow() && selRow().sym !== sym) return; // ya eligieron otra
      dibujar(box, r, h);
    }).catch(() => {
      if (CH) { CH.chart.remove(); CH = null; }
      box.replaceChildren(el('div', 'msf-load msf-err', 'No se pudo cargar la historia de ' + sym + '.'));
    });
  }

  function dibujar(box, r, h) {
    const LW = window.LightweightCharts;
    if (CH) { CH.chart.remove(); CH = null; }
    box.replaceChildren();
    const legend = el('div', 'lw-legend'); const area = el('div', 'lw-area');
    box.append(area, legend);
    const n = h.c.length, T = h.d.map((d) => d * 86400);
    const R = rsiJs(h.c), e12 = emaJs(h.c, 12, 0), e26 = emaJs(h.c, 26, 0);
    const M = e12.map((a, i) => a != null && e26[i] != null ? a - e26[i] : null);
    const st = M.findIndex((x) => x != null), G = emaJs(M.map((x) => x ?? 0), 9, st);
    const pf = r.price < 1 ? 4 : 2;

    const chart = LW.createChart(area, {
      autoSize: true,
      layout: {background: {type: 'solid', color: '#030916'}, textColor: C.muted, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11,
        panes: {separatorColor: C.line, separatorHoverColor: 'rgba(34,211,238,0.35)', enableResize: true}, attributionLogo: true},
      grid: {vertLines: {color: C.grid}, horzLines: {color: C.grid}},
      rightPriceScale: {borderColor: C.line},
      timeScale: {borderColor: C.line, rightOffset: 4, barSpacing: 8, minBarSpacing: 2},
      crosshair: {mode: LW.CrosshairMode.Normal, vertLine: {color: 'rgba(150,190,240,0.5)', labelBackgroundColor: '#0b1d44'}, horzLine: {color: 'rgba(150,190,240,0.5)', labelBackgroundColor: '#0b1d44'}},
      localization: {locale: 'es-AR', priceFormatter: (p) => num.format(',.' + pf + 'f')(p)},
    });
    // Panel 0: velas + volumen
    const velas = chart.addSeries(LW.CandlestickSeries, {upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down, wickUpColor: C.up, wickDownColor: C.down,
      priceFormat: {type: 'price', precision: pf, minMove: pf === 4 ? 0.0001 : 0.01}});
    velas.setData(T.map((t, i) => ({time: t, open: h.o[i], high: h.h[i], low: h.l[i], close: h.c[i]})));
    const vol = chart.addSeries(LW.HistogramSeries, {priceScaleId: 'vol', priceFormat: {type: 'volume'}, lastValueVisible: false, priceLineVisible: false});
    chart.priceScale('vol').applyOptions({scaleMargins: {top: 0.82, bottom: 0}, visible: false});
    vol.setData(T.map((t, i) => ({time: t, value: h.v ? h.v[i] : 0, color: h.c[i] >= h.o[i] ? 'rgba(52,211,153,0.25)' : 'rgba(251,113,133,0.25)'})));
    velas.priceScale().applyOptions({scaleMargins: {top: 0.08, bottom: 0.2}});

    // Panel 1: RSI
    const rsiS = chart.addSeries(LW.LineSeries, {color: C.sky, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, priceFormat: {type: 'price', precision: 1, minMove: 0.1}}, 1);
    rsiS.setData(T.map((t, i) => R[i] == null ? {time: t} : {time: t, value: R[i]}));
    rsiS.createPriceLine({price: 70, color: C.down, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true, title: ''});
    rsiS.createPriceLine({price: 30, color: C.up, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true, title: ''});
    rsiS.priceScale().applyOptions({scaleMargins: {top: 0.08, bottom: 0.08}});
    rsiS.applyOptions({autoscaleInfoProvider: () => ({priceRange: {minValue: 0, maxValue: 100}})});

    // Panel 2: MACD
    const histS = chart.addSeries(LW.HistogramSeries, {priceLineVisible: false, lastValueVisible: false, priceFormat: {type: 'price', precision: 3, minMove: 0.001}}, 2);
    histS.setData(T.map((t, i) => M[i] == null || G[i] == null ? {time: t} : {time: t, value: M[i] - G[i], color: M[i] - G[i] >= 0 ? 'rgba(52,211,153,0.55)' : 'rgba(251,113,133,0.55)'}));
    const macdS = chart.addSeries(LW.LineSeries, {color: C.cyan, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, priceFormat: {type: 'price', precision: 3, minMove: 0.001}}, 2);
    macdS.setData(T.map((t, i) => M[i] == null ? {time: t} : {time: t, value: M[i]}));
    const sigS = chart.addSeries(LW.LineSeries, {color: C.amber, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, priceFormat: {type: 'price', precision: 3, minMove: 0.001}}, 2);
    sigS.setData(T.map((t, i) => G[i] == null ? {time: t} : {time: t, value: G[i]}));

    // Divergencia: línea sobre mínimos/máximos y sobre el RSI, con marcador
    const div = h.div;
    if (div && r.div !== 'Ninguna' && div[0] >= 0 && div[1] < n) {
      const [a, b] = div, alc = r.div === 'Alcista', col = alc ? C.up : C.down, ext = alc ? h.l : h.h;
      const opt = {color: col, lineWidth: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, pointMarkersVisible: true};
      chart.addSeries(LW.LineSeries, opt, 0).setData([{time: T[a], value: ext[a]}, {time: T[b], value: ext[b]}]);
      chart.addSeries(LW.LineSeries, opt, 1).setData([{time: T[a], value: R[a]}, {time: T[b], value: R[b]}]);
      if (LW.createSeriesMarkers) LW.createSeriesMarkers(velas, [{time: T[b], position: alc ? 'belowBar' : 'aboveBar', color: col, shape: alc ? 'arrowUp' : 'arrowDown', text: 'Div. ' + r.div.toLowerCase()}]);
    }

    // Alturas de los paneles: precio grande, RSI y MACD más chicos
    const panes = chart.panes();
    [5, 1.7, 1.9].forEach((f, k) => { if (panes[k] && panes[k].setStretchFactor) panes[k].setStretchFactor(f); });

    // Arranca mostrando los últimos ~6 meses; se puede arrastrar para ver todo el año
    chart.timeScale().setVisibleLogicalRange({from: Math.max(0, n - 125), to: n + 3});

    // Leyenda con OHLC, RSI y MACD bajo el cursor
    const fecha = (t) => fLong(new Date(t * 1000));
    const fill = (i) => {
      const up = h.c[i] >= h.o[i], col = up ? C.up : C.down;
      legend.replaceChildren();
      const row1 = el('div', 'lw-row');
      row1.append(el('b', 'lw-sym', r.sym), el('span', 'lw-date', fecha(T[i])));
      const row2 = el('div', 'lw-row');
      [['A', h.o[i]], ['Máx', h.h[i]], ['Mín', h.l[i]], ['C', h.c[i]]].forEach(([k, val]) => {
        const s = el('span', null, k + ' '); s.append(Object.assign(el('b', null, num.format(',.' + pf + 'f')(val)), {style: 'color:' + col})); row2.append(s);
      });
      const row3 = el('div', 'lw-row');
      if (R[i] != null) { const s = el('span', null, 'RSI '); s.append(Object.assign(el('b', null, dec(R[i], 1)), {style: 'color:' + C.sky})); row3.append(s); }
      if (M[i] != null && G[i] != null) {
        const s = el('span', null, 'MACD '); s.append(Object.assign(el('b', null, num.format('.3~f')(M[i])), {style: 'color:' + C.cyan})); row3.append(s);
        const s2 = el('span', null, 'Señal '); s2.append(Object.assign(el('b', null, num.format('.3~f')(G[i])), {style: 'color:' + C.amber})); row3.append(s2);
      }
      legend.append(row1, row2, row3);
    };
    fill(n - 1);
    const idx = new Map(T.map((t, i) => [t, i]));
    chart.subscribeCrosshairMove((p) => { fill(p && p.time != null && idx.has(p.time) ? idx.get(p.time) : n - 1); });

    CH = {chart, sym: r.sym};
  }

  // ---------- Interacción ----------
  function select(sym) {
    S.sel = sym;
    renderDetalle();
    $$('#filas tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.key === sym));
    const det = $('#detalle');
    det.scrollIntoView({behavior: 'smooth', block: 'start'});
    det.classList.remove('flash'); void det.offsetWidth; det.classList.add('flash');
    try { history.replaceState(null, '', '#' + sym); } catch (e) { /* nada */ }
  }
  function redraw() { S.limit = 100; renderLista(); if (!S.sel) renderDetalle(); }

  $$('.f-q').forEach((inp) => inp.addEventListener('input', () => { S.q = inp.value; redraw(); }));
  $$('.f-sel').forEach((sel) => sel.addEventListener('change', () => { S[sel.dataset.k] = sel.value; redraw(); }));
  $$('.f-reset').forEach((b) => b.addEventListener('click', () => {
    ['q', 'senal', 'cruce', 'div', 'dage', 'rsi', 'liq', 'ex'].forEach((k) => { S[k] = ''; });
    $$('.f-q, .f-sel').forEach((e) => { e.value = ''; });
    redraw();
  }));
  $$('.mas').forEach((b) => b.addEventListener('click', () => { S.limit += 100; renderLista(); }));
  $$('th[data-k]').forEach((th) => th.querySelector('button').addEventListener('click', () => {
    const k = th.dataset.k;
    if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = (k === 'sym' || k === 'dias' || k === 'divHace') ? 1 : -1; }
    $$('th[data-k]').forEach((t) => { if (t.dataset.k === S.sort) t.setAttribute('aria-sort', S.dir > 0 ? 'ascending' : 'descending'); else t.removeAttribute('aria-sort'); });
    redraw();
  }));

  // ---------- Carga ----------
  const v = '?v=' + Math.floor(Date.now() / 3.6e6); // evita caché viejo, cambia cada hora
  const get = (u) => fetch(u + v).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
  Promise.all([get('data/acciones_resumen.json'), get('data/fechas.json')]).then(([rows, fechas]) => {
    S.rows = rows; S.fechas = fechas;
    const h = decodeURIComponent(location.hash.slice(1)).toUpperCase();
    if (h && rows.some((r) => r.sym === h)) S.sel = h;
    renderResumen(); renderLista(); renderDetalle();
    if (S.sel) requestAnimationFrame(() => $('#detalle').scrollIntoView({block: 'start'})); // llegó con #TICKER (p. ej. desde la terminal fundamental)
    return get('data/acciones_series.json');
  }).then((ser) => {
    S.ser = new Map(ser.map((r) => [r.sym, r]));
    renderLista();
  }).catch((e) => {
    console.error(e);
    $('#filas').replaceChildren();
    const tr = el('tr'), td = el('td'); td.colSpan = 12;
    td.append(el('div', 'msf-load msf-err', 'No se pudieron cargar los datos. Si abriste el archivo con doble clic, subilo a GitHub Pages o usá un servidor local (ver README).'));
    tr.append(td); $('#filas').append(tr);
  });
})();
