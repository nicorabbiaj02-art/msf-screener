// Precios en vivo para el screener (Vercel Function).
//   GET /api/precios?s=AAPL,MSFT,...   último precio y cierre anterior (hasta 120 tickers)
//   GET /api/precios?vela=AAPL         vela diaria de hoy (apertura, máximo, mínimo, último)
// Fuente: Yahoo Finance. Se cachea 30 segundos en el CDN de Vercel.
const UA = {'User-Agent': 'Mozilla/5.0 (msf-screener)'};
const yh = (s) => s.replace(/\./g, '-');          // BRK.B -> BRK-B
const ok = (s) => /^[A-Z0-9.\-]{1,10}$/.test(s);

async function json(url) {
  const r = await fetch(url, {headers: UA});
  if (!r.ok) throw new Error('Yahoo ' + r.status);
  return r.json();
}

async function cotizaciones(syms) {
  const out = {};
  const lotes = [];
  for (let i = 0; i < syms.length; i += 20) lotes.push(syms.slice(i, i + 20));
  await Promise.all(lotes.map(async (lote) => {
    try {
      const d = await json('https://query1.finance.yahoo.com/v8/finance/spark?range=1d&interval=5m&symbols=' + lote.map(yh).join(','));
      lote.forEach((s) => {
        const x = d[yh(s)];
        if (!x || !x.close) return;
        let i = x.close.length - 1;
        while (i >= 0 && x.close[i] == null) i--;
        if (i < 0) return;
        out[s] = {p: x.close[i], pc: x.chartPreviousClose ?? x.previousClose ?? null, t: x.timestamp[i]};
      });
    } catch (e) { /* ese lote queda sin precio */ }
  }));
  return out;
}

async function velaHoy(sym) {
  const d = await json('https://query1.finance.yahoo.com/v8/finance/chart/' + yh(sym) + '?range=5d&interval=1d');
  const r = d.chart.result[0], q = r.indicators.quote[0], ts = r.timestamp || [];
  // la vela de hoy puede venir con el cierre vacío mientras el mercado está abierto
  let i = ts.length - 1;
  while (i >= 0 && q.open[i] == null && q.close[i] == null) i--;
  if (i < 0) return null;
  const m = r.meta, c = m.regularMarketPrice ?? q.close[i], o = q.open[i] ?? c;
  const h = Math.max(...[q.high[i], m.regularMarketDayHigh, o, c].filter((x) => x != null));
  const l = Math.min(...[q.low[i], m.regularMarketDayLow, o, c].filter((x) => x != null));
  return {d: Math.floor(ts[i] / 86400), o, h, l, c, t: m.regularMarketTime ?? ts[i]};
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  try {
    const q = req.query || {};
    const syms = String(q.s || '').toUpperCase().split(',').map((x) => x.trim()).filter(ok).slice(0, 120);
    const vela = String(q.vela || '').toUpperCase();
    const [quotes, v] = await Promise.all([
      syms.length ? cotizaciones([...new Set(syms)]) : {},
      ok(vela) ? velaHoy(vela).catch(() => null) : null,
    ]);
    res.status(200).json({quotes, vela: v ? {sym: vela, ...v} : null, ahora: Math.floor(Date.now() / 1000)});
  } catch (e) {
    res.status(502).json({error: String(e.message || e)});
  }
};
