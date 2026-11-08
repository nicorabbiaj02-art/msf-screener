"""
Actualiza los datos del Screener RSI + MACD de Mercados Sin Filtro.

1. Arma el universo de acciones de NYSE, NASDAQ y AMEX con los directorios de Nasdaq Trader
   (sin ETFs, warrants, units, rights ni preferidas).
2. Baja 1 año de cierres diarios de Yahoo Finance para cada una.
3. Calcula RSI 14 (Wilder), MACD 12/26/9, la señal Compra/Venta y divergencias RSI recientes.
4. Escribe data/acciones_resumen.json, data/acciones_series.json y data/fechas.json.

Solo usa la biblioteca estándar de Python 3.9+. Uso:  python scripts/actualizar_datos.py
"""
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
N = 60                # ruedas que se guardan para los gráficos
MAX_DIV_AGE = 10      # divergencias de las últimas 10 jornadas
MIN_PRICE = 0.5
THREADS = 12
UA = {"User-Agent": "Mozilla/5.0 (msf-screener)"}


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# ---------- 1. Universo ----------
# \b al final: sin él, «Units?» excluía a UnitedHealth, United Airlines, etc., y «Notes?» a cualquier nombre que empezara así.
BAD = re.compile(r"\b(Warrants?|Rights?|Units?|Preferred|Depositary Shares? Representing|Notes?|Debentures?|Subordinated|Perpetual)\b|%", re.I)
BAD_ADR = re.compile(r"\b(Warrants?|Rights?|Units?|Notes?|Debentures?|Subordinated|Perpetual)\b|%", re.I)
CLASE = re.compile(r"^[A-Z]{1,5}\.[A-Z]$")  # acciones de clase, p. ej. BRK.B o BF.B


def excluir(name):
    """Los ADR de acciones preferidas (ITUB, PBR.A…) son acciones comunes para el inversor: no se excluyen por «Preferred»."""
    if re.search(r"American Depositary|\bADS\b|\bADR\b", name, re.I):
        return bool(BAD_ADR.search(name))
    return bool(BAD.search(name))


def universo():
    out = []
    nas = get("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt").decode("utf-8", "replace")
    for line in nas.splitlines()[1:]:
        p = line.split("|")
        if len(p) < 8 or p[0].startswith("File"):
            continue
        sym, name, _, test, _, _, etf = p[:7]
        if test == "Y" or etf == "Y" or excluir(name):
            continue
        out.append((sym, name.strip(), "NASDAQ"))
    oth = get("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt").decode("utf-8", "replace")
    exm = {"N": "NYSE", "A": "AMEX", "P": "NYSE", "Z": "BATS", "V": "NYSE"}
    for line in oth.splitlines()[1:]:
        p = line.split("|")
        if len(p) < 8 or p[0].startswith("File"):
            continue
        sym, name, ex, _, etf, _, test = p[:7]
        if test == "Y" or etf == "Y" or excluir(name) or "$" in sym or ("." in sym and not CLASE.match(sym)):
            continue
        out.append((sym, name.strip(), exm.get(ex, "NYSE")))
    return out


# ---------- 2. Precios ----------
def bajar(sym):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym.replace('.', '-')}?range=1y&interval=1d"  # Yahoo usa BRK-B
    for intento in range(3):
        try:
            return json.loads(get(url, 20))["chart"]["result"][0]
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 + intento * 4)
        except Exception:
            time.sleep(2 + intento * 4)
    return None


# ---------- 3. Indicadores ----------
def ema(x, n):
    k = 2 / (n + 1)
    o = [None] * len(x)
    s = sum(x[:n]) / n
    o[n - 1] = s
    for i in range(n, len(x)):
        s = x[i] * k + s * (1 - k)
        o[i] = s
    return o


def rsi(c, n=14):
    o = [None] * len(c)
    g = l = 0.0
    for i in range(1, n + 1):
        d = c[i] - c[i - 1]
        g += max(d, 0)
        l += max(-d, 0)
    g /= n
    l /= n
    o[n] = 100 if l == 0 else 100 - 100 / (1 + g / l)
    for i in range(n + 1, len(c)):
        d = c[i] - c[i - 1]
        g = (g * (n - 1) + max(d, 0)) / n
        l = (l * (n - 1) + max(-d, 0)) / n
        o[i] = 100 if l == 0 else 100 - 100 / (1 + g / l)
    return o


def divergencia(c, r):
    """B: mínimo/máximo reciente (3 ruedas a la izquierda, hasta 3 a la derecha; puede ser la última rueda).
    A: pivote confirmado (3 y 3) más cercano, entre 5 y 45 ruedas antes de B."""
    L = len(c)

    def ext(i, lo):
        a = c[max(0, i - 3):min(L, i + 4)]
        return c[i] == (min(a) if lo else max(a))

    for B in range(L - 1, L - 2 - MAX_DIV_AGE, -1):
        for lo, nombre in ((True, "Alcista"), (False, "Bajista")):
            if not ext(B, lo):
                continue
            for A in range(B - 5, max(3, B - 45) - 1, -1):
                if A + 3 >= L or not ext(A, lo):
                    continue
                if lo and c[B] < c[A] and r[B] > r[A] + 1 and min(r[A], r[B]) < 45:
                    return nombre, A - (L - N), B - (L - N), L - 1 - B
                if not lo and c[B] > c[A] and r[B] < r[A] - 1 and max(r[A], r[B]) > 55:
                    return nombre, A - (L - N), B - (L - N), L - 1 - B
                break
    return "Ninguna", -1, -1, -1


def fmt(x, d):
    return format(round(x, d), "g") if abs(x) >= 1e-12 else "0"


def procesar(sym, name, ex, d):
    ts = d.get("timestamp") or []
    q = d["indicators"]["quote"][0]
    pts = [(t, c, v, o, h, l) for t, c, v, o, h, l in zip(ts, q["close"], q["volume"], q.get("open") or [None] * len(ts),
                                                       q.get("high") or [None] * len(ts), q.get("low") or [None] * len(ts)) if c is not None]
    if len(pts) < N + 40:
        return None
    t = [p[0] for p in pts]
    c = [p[1] for p in pts]
    vol = [p[2] or 0 for p in pts]
    op = [p[3] if p[3] is not None else p[1] for p in pts]
    hi = [max(x for x in (p[4], p[3], p[1]) if x is not None) for p in pts]
    lo = [min(x for x in (p[5], p[3], p[1]) if x is not None) for p in pts]
    price = d["meta"].get("regularMarketPrice") or c[-1]
    if price < MIN_PRICE:
        return None
    R = rsi(c)
    e12, e26 = ema(c, 12), ema(c, 26)
    macd = [(a - b) if a is not None and b is not None else None for a, b in zip(e12, e26)]
    st = next(i for i, x in enumerate(macd) if x is not None)
    sg = [None] * st + ema(macd[st:], 9)
    hist = [m - s if s is not None else None for m, s in zip(macd, sg)]
    compra = macd[-1] > sg[-1]
    dias = 0
    for i in range(len(hist) - 1, 0, -1):
        if hist[i] is None or (hist[i] > 0) != compra:
            break
        dias += 1
    div, dA, dB, hace = divergencia(c, R)
    dc = 4 if c[-1] < 1 else 2 if c[-1] < 1000 else 0
    ser = lambda a, k: ",".join(fmt(x, k) for x in a[-N:])
    return {
        "sym": sym, "name": name[:60], "ex": ex,
        "date": str(dt.datetime.fromtimestamp(t[-1], dt.timezone.utc).date()),
        "price": round(price, 4 if price < 1 else 2),
        "chg": round((c[-1] / c[-2] - 1) * 100, 2),
        "rsi": round(R[-1], 1),
        "macd": float(fmt(macd[-1], 3)), "signal": float(fmt(sg[-1], 3)), "hist": float(fmt(hist[-1], 3)),
        "senal": "Compra" if compra else "Venta", "dias": dias,
        "div": div, "divA": dA, "divB": dB, "divHace": hace,
        "divEstado": ("Confirmada" if hace >= 3 else "En formación") if div != "Ninguna" else "",
        "volusd": round(sum(vol[-20:]) / 20 * c[-1]),
        "_ts": t[-N:],
        "s_open": ser(op, dc), "s_high": ser(hi, dc), "s_low": ser(lo, dc), "s_close": ser(c, dc), "s_rsi": ser(R, 0), "s_macd": ser(macd, 3), "s_sig": ser(sg, 3),
    }


def main():
    t0 = time.time()
    U = universo()
    print(f"Universo: {len(U)} acciones", flush=True)

    filas, fallas = [], 0

    def job(u):
        d = bajar(u[0])
        if d is None:
            return None, True
        try:
            return procesar(u[0], u[1], u[2], d), False
        except Exception:
            return None, False

    with cf.ThreadPoolExecutor(THREADS) as pool:
        for i, (fila, fallo) in enumerate(pool.map(job, U)):
            fallas += fallo
            if fila:
                filas.append(fila)
            if i % 500 == 0:
                print(f"  {i}/{len(U)}  ok={len(filas)} fallas={fallas}  {time.time() - t0:.0f}s", flush=True)

    if len(filas) < 0.6 * len(U):
        print(f"Muy pocas acciones descargadas ({len(filas)}). No se pisan los datos anteriores.")
        sys.exit(1)

    ultima = max(f["date"] for f in filas)
    limite = str(dt.date.fromisoformat(ultima) - dt.timedelta(days=7))
    filas = [f for f in filas if f["date"] >= limite]
    filas.sort(key=lambda f: -f["volusd"])

    # fechas de las últimas N ruedas: las de la acción más operada al día
    ref = next(f for f in filas if f["date"] == ultima)
    fechas = [{"i": i, "fecha": str(dt.datetime.fromtimestamp(x, dt.timezone.utc).date())} for i, x in enumerate(ref["_ts"])]

    S = ["s_open", "s_high", "s_low", "s_close", "s_rsi", "s_macd", "s_sig"]
    resumen = [{k: v for k, v in f.items() if k not in S and k != "_ts"} for f in filas]
    series = [{"sym": f["sym"], **{k: f[k] for k in S}} for f in filas]

    os.makedirs(DATA, exist_ok=True)
    dump = lambda name, obj: json.dump(obj, open(os.path.join(DATA, name), "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    dump("acciones_resumen.json", resumen)
    dump("acciones_series.json", series)
    dump("fechas.json", fechas)
    dump("meta.json", {"cierre": ultima, "generado": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "acciones": len(filas)})
    print(f"Listo: {len(filas)} acciones al cierre del {ultima} en {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
