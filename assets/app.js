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
    renderPerfil(r);
  }

  // ---------- Perfil de la empresa (widget de TradingView) ----------
  function tvSymbol(r) { return (['NASDAQ', 'NYSE', 'AMEX'].includes(r.ex) ? r.ex + ':' : '') + r.sym; }
  function renderPerfil(r) {
    const box = $('#tv-perfil'); if (!box) return;
    const sym = tvSymbol(r);
    if (box.dataset.sym === sym) return;
    box.dataset.sym = sym;
    $('#perfil-sym').textContent = r.name.replace(/ - .*$/, '');
    const cont = el('div', 'tradingview-widget-container');
    cont.append(el('div', 'tradingview-widget-container__widget'));
    const sc = document.createElement('script');
    sc.type = 'text/javascript'; sc.async = true;
    sc.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-profile.js';
    sc.textContent = JSON.stringify({width: '100%', height: '100%', colorTheme: 'dark', isTransparent: true, symbol: sym, locale: 'es'});
    cont.append(sc);
    box.replaceChildren(cont);
  }

  function renderGraficos(r) {
    const box = $('#graficos');
    const s = r && S.ser && S.ser.get(r.sym);
    if (!s || !S.fechas) { if (!S.ser) return; box.replaceChildren(el('div', 'msf-load msf-err', 'Sin datos de gráfico para esta acción.')); return; }
    box.replaceChildren();
    const c = parse(s.s_close), R = parse(s.s_rsi), m = parse(s.s_macd), g = parse(s.s_sig);
    const o = s.s_open ? parse(s.s_open) : c, hi = s.s_high ? parse(s.s_high) : c, lo = s.s_low ? parse(s.s_low) : c;
    const hst = m.map((v, i) => v - g[i]), n = c.length;
    const dates = S.fechas.slice(-n).map((d) => toDate(d.fecha));
    const W = Math.max(280, box.clientWidth - 12 || 600);
    const P = [{h: 190}, {h: 110}, {h: 130}];
    const head = 22, gap = 14, axisH = 22;
    let yy = 0; P.forEach((p) => { p.top = yy + head; yy = p.top + p.h + gap; });
    const H = yy - gap + axisH;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).style('overflow', 'visible');
    const ok = 'var(--msf-up)', bad = 'var(--msf-down)';

    const pFmt = c[n - 1] < 1 ? num.format('.4f') : c[n - 1] < 10 ? num.format('.2f') : num.format(',.0f');
    const mExt = d3.max([...m, ...g, ...hst].map(Math.abs)) || 1;
    const mFmt = num.format(mExt < 0.1 ? '.3f' : mExt < 10 ? '.2f' : ',.0f');
    const cMin = d3.min(lo), cMax = d3.max(hi), pad = (cMax - cMin) * 0.08 || cMax * 0.02;
    P[0].y = d3.scaleLinear([cMin - pad, cMax + pad], [P[0].top + P[0].h, P[0].top]).nice(4); P[0].fmt = pFmt;
    P[1].y = d3.scaleLinear([0, 100], [P[1].top + P[1].h, P[1].top]); P[1].fmt = num.format('d'); P[1].ticks = [30, 50, 70];
    P[2].y = d3.scaleLinear([-mExt * 1.1, mExt * 1.1], [P[2].top + P[2].h, P[2].top]).nice(4); P[2].fmt = mFmt;

    const meas = svg.append('text').attr('font-size', 11);
    let mr = 0;
    P.forEach((p) => (p.ticks || p.y.ticks(4)).forEach((t) => { meas.text(p.fmt(t)); mr = Math.max(mr, meas.node().getComputedTextLength()); }));
    meas.remove(); mr += 12;
    const x = d3.scaleLinear([0, n - 1], [4, W - mr - 6]);
    const line = (arr, y) => d3.line((d, i) => x(i), (d) => y(d))(arr);

    P.forEach((p) => {
      const ticks = p.ticks || p.y.ticks(4), gg = svg.append('g');
      gg.selectAll('line').data(ticks).join('line').attr('x1', x(0)).attr('x2', x(n - 1)).attr('y1', (t) => p.y(t)).attr('y2', (t) => p.y(t)).attr('stroke', 'var(--msf-grid)');
      gg.selectAll('text').data(ticks).join('text').attr('x', W - mr + 6).attr('y', (t) => p.y(t)).attr('dy', '0.32em')
        .attr('font-size', 11).attr('fill', 'var(--msf-muted)').text((t) => p.fmt(t));
    });
    const title = (p, parts) => {
      const t = svg.append('text').attr('x', x(0)).attr('y', p.top - 8).attr('font-size', 12);
      parts.forEach(([txt, col], i) => t.append('tspan').attr('dx', i ? 10 : 0).attr('fill', col || 'var(--msf-text)').attr('font-weight', i ? 400 : 700).text(txt));
    };

    // Precio: velas japonesas (verde alcista, rojo bajista)
    const p0 = P[0];
    const step = (x(n - 1) - x(0)) / Math.max(1, n - 1);
    const cw = Math.max(2, Math.min(14, step * 0.68));
    const velas = svg.append('g');
    d3.range(n).forEach((i) => {
      const up = c[i] >= o[i], col = up ? ok : bad;
      velas.append('line').attr('x1', x(i)).attr('x2', x(i)).attr('y1', p0.y(hi[i])).attr('y2', p0.y(lo[i]))
        .attr('stroke', col).attr('stroke-width', 1.2);
      const y1 = p0.y(Math.max(o[i], c[i])), y2 = p0.y(Math.min(o[i], c[i]));
      velas.append('rect').attr('x', x(i) - cw / 2).attr('width', cw).attr('y', y1).attr('height', Math.max(1, y2 - y1))
        .attr('fill', col).attr('stroke', col).attr('stroke-width', 0.8).attr('rx', 0.8);
    });
    title(p0, [['Precio'], ['Velas diarias · 60 ruedas', 'var(--msf-muted)']]);

    // RSI
    const p1 = P[1];
    svg.append('rect').attr('x', x(0)).attr('width', x(n - 1) - x(0)).attr('y', p1.y(70)).attr('height', p1.y(30) - p1.y(70)).attr('fill', 'var(--msf-blue)').attr('opacity', 0.1);
    [30, 70].forEach((v) => svg.append('line').attr('x1', x(0)).attr('x2', x(n - 1)).attr('y1', p1.y(v)).attr('y2', p1.y(v)).attr('stroke', v === 30 ? ok : bad).attr('stroke-dasharray', '4 3').attr('opacity', 0.7));
    svg.append('path').attr('d', line(R, p1.y)).attr('fill', 'none').attr('stroke', 'var(--msf-sky)').attr('stroke-width', 2).attr('stroke-linejoin', 'round');
    title(p1, [['RSI 14'], [dec(r.rsi, 1), r.rsi < 30 ? ok : r.rsi > 70 ? bad : 'var(--msf-sky)']]);

    // Divergencia
    if (r.divA >= 0 && r.divB >= 0 && r.divB < n) {
      const col = r.div === 'Alcista' ? ok : bad;
      const ext = r.div === 'Alcista' ? lo : hi;
      [[p0.y, ext], [p1.y, R]].forEach(([y, arr]) => {
        svg.append('line').attr('x1', x(r.divA)).attr('x2', x(r.divB)).attr('y1', y(arr[r.divA])).attr('y2', y(arr[r.divB]))
          .attr('stroke', col).attr('stroke-width', 2.5).attr('stroke-linecap', 'round');
        [r.divA, r.divB].forEach((i) => svg.append('circle').attr('cx', x(i)).attr('cy', y(arr[i])).attr('r', 3.5).attr('fill', col));
      });
      svg.append('text').attr('x', Math.min(x(r.divB), W - mr - 40)).attr('y', p0.y(ext[r.divB]) + (r.div === 'Alcista' ? 16 : -10)).attr('text-anchor', 'middle')
        .attr('font-size', 11).attr('font-weight', 700).attr('fill', col).text('Div. ' + r.div.toLowerCase());
    }

    // MACD
    const p2 = P[2], bw = Math.max(1.5, Math.min(10, (x(n - 1) - x(0)) / n - 1.5));
    svg.append('line').attr('x1', x(0)).attr('x2', x(n - 1)).attr('y1', p2.y(0)).attr('y2', p2.y(0)).attr('stroke', 'var(--msf-axis)');
    svg.append('g').selectAll('rect').data(hst).join('rect')
      .attr('x', (d, i) => x(i) - bw / 2).attr('width', bw).attr('rx', 1)
      .attr('y', (d) => Math.min(p2.y(d), p2.y(0))).attr('height', (d) => Math.max(0.5, Math.abs(p2.y(d) - p2.y(0))))
      .attr('fill', (d) => d >= 0 ? ok : bad).attr('opacity', 0.5);
    svg.append('path').attr('d', line(m, p2.y)).attr('fill', 'none').attr('stroke', 'var(--msf-cyan)').attr('stroke-width', 2);
    svg.append('path').attr('d', line(g, p2.y)).attr('fill', 'none').attr('stroke', 'var(--msf-amber)').attr('stroke-width', 1.5);
    title(p2, [['MACD 12/26/9'], ['● MACD', 'var(--msf-cyan)'], ['● Señal', 'var(--msf-amber)'], [r.senal, r.senal === 'Compra' ? ok : bad]]);

    // Eje de fechas
    const nt = Math.max(2, Math.min(6, Math.floor((x(n - 1) - x(0)) / 80)));
    const tix = d3.range(nt).map((k) => Math.round(k * (n - 1) / (nt - 1)));
    svg.append('g').selectAll('text').data(tix).join('text').attr('x', (i) => x(i)).attr('y', H - 6)
      .attr('text-anchor', (i, k) => k === 0 ? 'start' : k === tix.length - 1 ? 'end' : 'middle')
      .attr('font-size', 11).attr('fill', 'var(--msf-muted)').text((i) => fDay(dates[i]));

    // Tooltip
    const rule = svg.append('line').attr('y1', P[0].top).attr('y2', P[2].top + P[2].h).attr('stroke', 'var(--msf-ref)').attr('opacity', 0);
    const dots = P.map(() => svg.append('circle').attr('r', 3.5).attr('opacity', 0));
    const tip = d3.select(box).append('div').attr('class', 'gtip').style('opacity', 0);
    svg.append('rect').attr('x', x(0)).attr('width', x(n - 1) - x(0)).attr('y', 0).attr('height', H).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [px] = d3.pointer(ev, svg.node());
        const i = Math.max(0, Math.min(n - 1, Math.round(x.invert(px))));
        rule.attr('x1', x(i)).attr('x2', x(i)).attr('opacity', 1);
        [[P[0].y(c[i]), c[i] >= o[i] ? 'var(--msf-up)' : 'var(--msf-down)'], [P[1].y(R[i]), 'var(--msf-sky)'], [P[2].y(m[i]), 'var(--msf-cyan)']]
          .forEach(([cy, col], k) => dots[k].attr('cx', x(i)).attr('cy', cy).attr('fill', col).attr('opacity', k === 0 ? 0 : 1));
        tip.selectAll('*').remove();
        tip.append('div').attr('class', 't').text(fLong(dates[i]));
        const vc = c[i] >= o[i] ? css('--msf-up') : css('--msf-down');
        [[vc, 'Apertura', price(o[i])], [vc, 'Máximo', price(hi[i])], [vc, 'Mínimo', price(lo[i])], [vc, 'Cierre', price(c[i])], ['#38bdf8', 'RSI', dec(R[i], 0)], ['#22d3ee', 'MACD', mFmt(m[i])], ['#fbbf24', 'Señal', mFmt(g[i])], [hst[i] >= 0 ? css('--msf-up') : css('--msf-down'), 'Histograma', mFmt(hst[i])]]
          .forEach(([col, k, v]) => { const d = tip.append('div'); d.append('i').style('background', col); d.append('span').text(k + ': ' + v); });
        const rect = box.getBoundingClientRect(), scale = rect.width / W;
        const tw = tip.node().offsetWidth, left = x(i) * scale;
        tip.style('left', (left + 12 + tw > rect.width ? left - tw - 12 : left + 12) + 'px').style('top', '4px').style('opacity', 1);
      })
      .on('pointerleave', () => { rule.attr('opacity', 0); dots.forEach((d) => d.attr('opacity', 0)); tip.style('opacity', 0); });
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
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => renderGraficos(selRow()), 150); });

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
    renderLista(); renderGraficos(selRow());
  }).catch((e) => {
    console.error(e);
    $('#filas').replaceChildren();
    const tr = el('tr'), td = el('td'); td.colSpan = 12;
    td.append(el('div', 'msf-load msf-err', 'No se pudieron cargar los datos. Si abriste el archivo con doble clic, subilo a GitHub Pages o usá un servidor local (ver README).'));
    tr.append(td); $('#filas').append(tr);
  });
})();
