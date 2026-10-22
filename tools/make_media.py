"""Generates week-1 Instagram media into ./media. Run: python make_media.py
Needs: pillow numpy imageio imageio-ffmpeg resvg-py. Logos: assets/logos/*.svg (simple-icons)."""
import os, io, json, glob, math, random, subprocess, urllib.request, wave, numpy as np, imageio, imageio_ffmpeg, resvg_py
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "media")
LOGOS = os.path.join(HERE, "logos")
FF = imageio_ffmpeg.get_ffmpeg_exe()
SCRIPTS = os.path.join(HERE, "scripts")


def _json(p, default):
    return json.load(open(p, encoding="utf8")) if os.path.exists(p) else default


HANDLE = _json(f"{SCRIPTS}/_config.json", {}).get("handle", "@yourhandle")
BOLD, REG = "C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/segoeui.ttf"
HEAVY = "C:/Windows/Fonts/seguibl.ttf"
GOLD, EMERALD, WHITE, GREY, RED = (245, 197, 66), (52, 211, 153), (255, 255, 255), (170, 190, 190), (248, 113, 113)
COLORS = {"gold": GOLD, "emerald": EMERALD, "red": RED, "white": WHITE}
BRAND = _json(f"{LOGOS}/colors.json", {})  # logo name -> hex; unlisted logos render near-black
FPS = 24
_f = {}


def font(p, s):
    return _f.setdefault((p, s), ImageFont.truetype(p, s))


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


# ---------------- background ----------------
def background(W, H):
    """Deep emerald gradient + faint grid + two glow layers (returned separately so they can pulse)."""
    yy = np.linspace(0, 1, H)[:, None, None]
    top, bot = np.array([5, 16, 22.0]), np.array([8, 42, 38.0])
    base = (top + (bot - top) * yy) * np.ones((1, W, 1))
    for x in range(0, W, 120):
        base[:, x:x + 2] += 6
    for y in range(0, H, 120):
        base[y:y + 2, :] += 6
    Y, X = np.mgrid[0:H, 0:W]

    def glow(cx, cy, r, col):
        d = np.exp(-(((X - cx) ** 2 + (Y - cy) ** 2) / (2 * r * r)))
        return d[..., None] * np.array(col, float)

    g1 = glow(W * 0.9, H * 0.12, W * 0.55, (90, 70, 8))     # gold, top right
    g2 = glow(W * 0.05, H * 0.85, W * 0.6, (6, 80, 62))     # emerald, bottom left
    return base, g1 + g2


# ---------------- logos ----------------
_chip = {}


def chip(name, S):
    k = (name, S)
    if k in _chip:
        return _chip[k]
    p = f"{LOGOS}/{name}.svg"
    if not os.path.exists(p):  # any simple-icons slug works; fetched once, then cached
        os.makedirs(LOGOS, exist_ok=True)
        urllib.request.urlretrieve(f"https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/{name}.svg", p)
    svg = open(p, encoding="utf8").read().replace("<svg ", f'<svg fill="#{BRAND.get(name, "111111")}" ', 1)
    png = bytes(resvg_py.svg_to_bytes(svg_string=svg, width=int(S * 0.62)))
    logo = Image.open(io.BytesIO(png)).convert("RGBA")
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([0, 0, S - 1, S - 1], radius=S // 4, fill=(255, 255, 255, 255))
    im.alpha_composite(logo, ((S - logo.width) // 2, (S - logo.height) // 2))
    _chip[k] = im
    return im


def paste_alpha(layer, im, xy, a):
    if a <= 0:
        return
    im = im.copy()
    im.putalpha(im.getchannel("A").point(lambda v: int(v * a)))
    layer.alpha_composite(im, xy)


# ---------------- text layout ----------------
def wrap(d, text, f, maxw):
    lines = []
    for para in text.split("\n"):
        cur = ""
        for w in para.split():
            t = (cur + " " + w).strip()
            if d.textlength(t, font=f) <= maxw:
                cur = t
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def fit(d, text, path, size, maxw, maxlines):
    while True:
        f = font(path, size)
        lines = wrap(d, text, f, maxw)
        if len(lines) <= maxlines or size <= 44:
            return lines, f, int(size * 1.18)
        size -= 6


def layout(W, H, title, sub=None, kicker=None, logos=(), color=WHITE, accent=GOLD, yr=(0.14, 0.80)):
    """Precomputes everything positioned for one card; returns a dict used by draw_card()."""
    d = ImageDraw.Draw(Image.new("RGB", (4, 4)))
    maxw = W - 340
    tl, tf, tlh = fit(d, title, HEAVY, 100 if len(title) < 45 else 80, maxw, 6)
    sl, sf, slh = fit(d, sub, REG, 52, maxw, 5) if sub else ([], None, 0)
    S = 120
    h = (70 if kicker else 0) + len(tl) * tlh + 50 + (len(sl) * 68 + 20 if sl else 0) + (S + 40 if logos else 0)
    pad = 80
    ch = h + 2 * pad
    cy0 = int(H * yr[0]) + (int(H * (yr[1] - yr[0])) - ch) // 2
    cx0, cx1 = 70, W - 70
    y = cy0 + pad
    items, t = [], 0.1
    if kicker:
        items.append(("txt", kicker, 130, y, font(BOLD, 40), accent, 0.1))
        y += 70
    for ln in tl:
        x = 130
        for w in ln.split():
            items.append(("txt", w, x, y, tf, color, t))
            x += d.textlength(w + " ", font=tf)
            t += 0.09
        y += tlh
    bar_y = y + 14
    y += 50
    sub_t = t + 0.1
    for ln in sl:
        items.append(("txt", ln, 130, y, sf, GREY, sub_t))
        y += 68
    if sl:
        y += 20
    lg = []
    if logos:
        x = 130
        for i, n in enumerate(logos):
            try:
                lg.append((chip(n, S), x, y + 10, sub_t + 0.15 * i))
            except Exception:  # offline / unknown slug: skip the logo
                continue
            x += S + 30
    return dict(card=(cx0, cy0, cx1, cy0 + ch), items=items, bar=(130, bar_y), accent=accent, logos=lg, dur=t)


def draw_card(layer, L, t):
    d = ImageDraw.Draw(layer)
    a = ease(t / 0.35)
    x0, y0, x1, y1 = L["card"]
    sh = int((1 - a) * 40)
    d.rounded_rectangle([x0, y0 + sh, x1, y1 + sh], radius=44, fill=(255, 255, 255, int(24 * a)),
                        outline=L["accent"] + (int(110 * a),), width=3)
    bx, by = L["bar"]
    d.rounded_rectangle([bx, by, bx + int(220 * ease((t - L["dur"] + 0.4) / 0.5)), by + 8], radius=4, fill=L["accent"] + (255,))
    for _, txt, x, y, f, col, delay in L["items"]:
        e = ease((t - delay) / 0.4)
        if e <= 0:
            continue
        yy = y + int((1 - e) * 36)
        d.text((x + 3, yy + 4), txt, font=f, fill=(0, 0, 0, int(110 * e)))
        d.text((x, yy), txt, font=f, fill=col + (int(255 * e),))
    for im, x, y, delay in L["logos"]:
        e = ease((t - delay) / 0.4)
        paste_alpha(layer, im, (x, y + int((1 - e) * 30)), e)


# ---------------- animated extras ----------------
def particles(W, H, n=26, seed=3):
    r = random.Random(seed)
    return [(r.uniform(0, W), r.uniform(0, H + 300), r.uniform(25, 70), r.choice(["$", "$", "•", "+"]),
             r.randint(34, 76), r.randint(28, 70)) for _ in range(n)]


def chart_pts(n=48, seed=7):
    r = random.Random(seed)
    v, out = 0.0, []
    for i in range(n):
        v += r.uniform(-0.35, 0.9)
        out.append(v)
    lo, hi = min(out), max(out)
    return [(p - lo) / (hi - lo) for p in out]


def draw_extras(layer, W, H, t, prog, parts, pts):
    d = ImageDraw.Draw(layer)
    for x, y0, sp, ch, size, al in parts:
        y = (y0 - sp * t) % (H + 300) - 150
        d.text((x + 8 * math.sin(t + x), y), ch, font=font(BOLD, size), fill=GOLD + (al,))
    cx0, cx1, cy0, cy1 = 70, W - 70, 1500, 1740
    pos = prog * (len(pts) - 1)
    k = int(pos)
    xy = [(cx0 + (cx1 - cx0) * i / (len(pts) - 1), cy1 - (cy1 - cy0) * pts[i]) for i in range(k + 1)]
    if k < len(pts) - 1:
        f = pos - k
        xy.append((cx0 + (cx1 - cx0) * (k + f) / (len(pts) - 1), cy1 - (cy1 - cy0) * (pts[k] + (pts[k + 1] - pts[k]) * f)))
    if len(xy) > 1:
        d.line(xy, fill=GOLD + (55,), width=16, joint="curve")
        d.line(xy, fill=GOLD + (230,), width=5, joint="curve")
        ex, ey = xy[-1]
        d.ellipse([ex - 12, ey - 12, ex + 12, ey + 12], fill=WHITE + (255,))


# ---------------- healing-tone music ----------------
def music(path, secs, sr=44100):
    """Original ambient drone: 432 Hz root + 528 Hz + soft bowl strikes. Not a medical claim."""
    t = np.arange(int(secs * sr)) / sr
    out = np.zeros((len(t), 2))
    for f, amp, det in [(136.1, .30, .25), (432, .22, .35), (528, .16, .30), (648, .08, .20), (864, .05, .15)]:
        lfo = 0.75 + 0.25 * np.sin(2 * np.pi * (0.07 + f / 40000) * t)
        out[:, 0] += amp * lfo * np.sin(2 * np.pi * (f - det) * t)
        out[:, 1] += amp * lfo * np.sin(2 * np.pi * (f + det) * t)
    k = 0.0
    while k < secs - 1:
        m = t >= k
        dt = np.where(m, t - k, 0)
        env = np.where(m, np.exp(-dt / 1.8) * np.minimum(dt / 0.02, 1), 0)
        bowl = sum(a * np.sin(2 * np.pi * 528 * r * t) for r, a in [(1, .5), (2.71, .18), (5.4, .06)]) * env * 0.18
        out[:, 0] += bowl
        out[:, 1] += np.roll(bowl, 900)
        k += 6.0
    for dly, g in [(0.37, .35), (0.61, .25)]:  # cheap reverb: feedback-free echoes
        n = int(dly * sr)
        out[n:] += g * out[:-n]
    fade = np.minimum(1, np.minimum(t / 1.5, (secs - t) / 2.0))
    out *= fade[:, None]
    out *= 0.6 / max(np.abs(out).max(), 1e-6)
    pcm = (out * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())


# ---------------- reels ----------------
def reel(path, scenes):
    W, H = 1080, 1920
    base, glow = background(W, H)
    parts, pts = particles(W, H), chart_pts()
    Ls = []
    for s in scenes:
        title, sub, sec = s[:3]
        o = s[3] if len(s) > 3 else {}
        Ls.append((layout(W, H, title, sub, **o), sec))
    total = sum(s for _, s in Ls)
    cover = path.replace(".mp4", "_cover.png")
    tmp = path.replace(".mp4", "_silent.mp4")
    w = imageio.get_writer(tmp, fps=FPS, codec="libx264", quality=8, macro_block_size=1)
    n_total, fi = int(total * FPS), 0
    for L, sec in Ls:
        for k in range(int(sec * FPS)):
            t = fi / FPS
            bg = np.clip(base + glow * (0.8 + 0.2 * math.sin(t * 1.3)), 0, 255).astype(np.uint8)
            im = Image.fromarray(bg).convert("RGBA")
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            draw_extras(layer, W, H, t, fi / n_total, parts, pts)
            draw_card(layer, L, k / FPS)
            d = ImageDraw.Draw(layer)
            d.text((70, 235), HANDLE, font=font(BOLD, 40), fill=GOLD + (255,))
            d.rectangle([0, 150, int(W * fi / n_total), 156], fill=GOLD + (255,))
            im.alpha_composite(layer)
            frame = im.convert("RGB")
            if fi == int(FPS * 1.6):
                frame.save(cover)  # cover = hook fully revealed
            w.append_data(np.asarray(frame))
            fi += 1
    w.close()
    wav = path.replace(".mp4", ".wav")
    music(wav, total)
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", tmp, "-i", wav, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                    "-shortest", path], check=True)
    os.remove(tmp); os.remove(wav)


# ---------------- static posts ----------------
def static(path, W, H, title, sub=None, kicker=None, logos=(), accent=GOLD, counter=None, footer=None, big_logo=None, yr=(0.12, 0.84), handle_y=None):
    base, glow = background(W, H)
    im = Image.fromarray(np.clip(base + glow, 0, 255).astype(np.uint8)).convert("RGBA")
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = chart_pts()
    if H > 1500 or True:  # faint finished chart along the bottom
        draw_extras(layer, W, H, 0, 1.0, particles(W, H, 14), pts)
    L = layout(W, H, title, sub, kicker=kicker, logos=logos, accent=accent, yr=yr)
    if big_logo:
        L["items"] = [(a, b, c, y + 190, e, f, g) for a, b, c, y, e, f, g in L["items"]]
        x0, y0, x1, y1 = L["card"]
        L["card"] = (x0, y0 - 70, x1, y1 + 190)
        L["bar"] = (L["bar"][0], L["bar"][1] + 190)
        try:
            L["logos"] = [(chip(big_logo, 220), 130, y0 + 10, 0)]
        except Exception:
            L["logos"] = []
    draw_card(layer, L, 5)
    d = ImageDraw.Draw(layer)
    d.text((70, handle_y if handle_y else H - 90), HANDLE, font=font(BOLD, 40), fill=accent + (255,))
    if counter:
        d.text((W - 160, H - 90), counter, font=font(BOLD, 40), fill=GREY + (255,))
    if footer:
        d.text((70, H - 150), footer, font=font(REG, 30), fill=GREY + (255,))
    im.alpha_composite(layer)
    im.convert("RGB").save(path)


def carousel(folder, slides):
    os.makedirs(folder, exist_ok=True)
    n = len(slides)
    for i, s in enumerate(slides, 1):
        title, sub, o = s
        static(f"{folder}/slide_{i:02d}.png", 1080, 1350, title, sub, counter=f"{i}/{n}", **o)


def story(path, title, sub=None, kicker=None):
    # lower middle left empty for the poll/question sticker added in the Instagram app
    static(path, 1080, 1920, title, sub, kicker=kicker, yr=(0.20, 0.56), handle_y=235)


def opts(d):
    """JSON scene/slide -> layout kwargs (only the keys that are present)."""
    o = {k: d[k] for k in ("kicker", "logos", "footer") if k in d}
    if "logo" in d:
        o["big_logo"] = d["logo"]
    if "accent" in d:
        o["accent"] = COLORS[d["accent"]]
    return o


def build(p, force):
    """One scripts/<name>.json -> media/<name>... ; skipped when output is newer than script and this file."""
    name = os.path.splitext(os.path.basename(p))[0]
    spec = json.load(open(p, encoding="utf8"))
    kind = spec["type"]
    target = {"reel": f"{OUT}/{name}.mp4", "story": f"{OUT}/{name}.png", "carousel": f"{OUT}/{name}/slide_01.png"}[kind]
    if not force and os.path.exists(target) and os.path.getmtime(target) > max(os.path.getmtime(p), os.path.getmtime(__file__)):
        print("skip (up to date):", name)
        return
    print("building:", name)
    if kind == "reel":
        reel(target, [(s["title"], s.get("sub"), s["seconds"], opts(s)) for s in spec["scenes"]])
    elif kind == "carousel":
        carousel(f"{OUT}/{name}", [(s["title"], s.get("sub"), opts(s)) for s in spec["slides"]])
    else:
        story(target, spec["title"], spec.get("sub"), spec.get("kicker"))


def render(spec_path, out_base):
    """CLI used by the Next.js app: spec json -> out_base.mp4 / out_base.png / out_base/slide_NN.png."""
    global HANDLE
    spec = json.load(open(spec_path, encoding="utf8"))
    HANDLE = spec.get("handle") or HANDLE
    kind = spec["type"]
    if kind == "reel":
        reel(out_base + ".mp4", [(s["title"], s.get("sub"), s["seconds"], opts(s)) for s in spec["scenes"]])
    elif kind == "carousel":
        carousel(out_base, [(s["title"], s.get("sub"), opts(s)) for s in spec["slides"]])
    else:
        story(out_base + ".png", spec["title"], spec.get("sub"), spec.get("kicker"))


if __name__ == "__main__":
    import sys
    if len(sys.argv) == 4 and sys.argv[1] == "--render":
        render(sys.argv[2], sys.argv[3])
        sys.exit(0)
    os.makedirs(OUT, exist_ok=True)
    force = "--force" in sys.argv
    for p in sorted(glob.glob(f"{SCRIPTS}/[!_]*.json")):
        build(p, force)
    print("done")
