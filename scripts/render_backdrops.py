"""Render heavily defocused 'photographic' backdrops: 3 locations x 3 times of day.

Each scene is drawn sharp at low resolution, then defocused with a large Gaussian
(the 'shallow depth of field' look), lens bokeh discs are added for point lights,
followed by atmospheric haze, vignette and fine film grain.
"""
import sys, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1600, 1000
OUT = sys.argv[1]

TIMES = {
    "day": dict(
        sky=[(0.0, "#7fb6e3"), (0.55, "#b9dcf2"), (1.0, "#eef6fb")],
        sun=(0.84, 0.10, "#fff6dc", 0.38, 0.30), haze="#dcecf6", haze_amt=0.30,
        near="#5f7d92", mid="#8aa6b9", far="#b3c9d8", lit=0.0, lights=0,
        water="#9fc2db", glass="#cfe3f0", bokeh_color=["#ffffff"], bokeh_n=10, bokeh_alpha=0.10,
        grade=(1.0, 1.0, 1.0), exposure=1.04,
    ),
    "dusk": dict(
        sky=[(0.0, "#3f5277"), (0.38, "#8a7fa4"), (0.68, "#e5a48b"), (1.0, "#ffd09a")],
        sun=(0.74, 0.60, "#ffcf8a", 0.75, 0.50), haze="#f0b896", haze_amt=0.22,
        near="#3a4058", mid="#5d5a76", far="#8d7f98", lit=0.35, lights=0.6,
        water="#a98a9c", glass="#f6b98f", bokeh_color=["#ffd28a", "#ffb877", "#fff1c9", "#ff9d6e"],
        bokeh_n=55, bokeh_alpha=0.55, grade=(1.0, 0.97, 0.95), exposure=1.0,
    ),
    "night": dict(
        sky=[(0.0, "#050c18"), (0.55, "#0c1d33"), (1.0, "#1d3550")],
        sun=(0.18, 0.16, "#cfe2ff", 0.18, 0.18), haze="#1f3d5a", haze_amt=0.18,
        near="#08121f", mid="#0f1e30", far="#183049", lit=0.62, lights=1.0,
        water="#0d1c2e", glass="#2a4a68", bokeh_color=["#ffd28a", "#ffe9b8", "#9fe3ff", "#7cc4ff", "#ff9a6a", "#c9ffe9"],
        bokeh_n=140, bokeh_alpha=0.85, grade=(0.95, 1.0, 1.06), exposure=1.0,
    ),
}


def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255


def gradient(stops, h=H, w=W):
    ys = np.linspace(0, 1, h)
    out = np.zeros((h, 3), np.float32)
    for i in range(len(stops) - 1):
        (a, ca), (b, cb) = stops[i], stops[i + 1]
        m = (ys >= a) & (ys <= b)
        t = ((ys[m] - a) / (b - a))[:, None]
        out[m] = hexc(ca) * (1 - t) + hexc(cb) * t
    return np.repeat(out[:, None, :], w, axis=1)


def glow(img, cx, cy, color, strength, radius):
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot((xx / W - cx) * (W / H), yy / H - cy)
    g = np.exp(-(d / radius) ** 2)[..., None] * strength
    return img + hexc(color) * g


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def to_arr(im):
    return np.asarray(im).astype(np.float32) / 255


def paste_mask(base, mask, color):
    m = to_arr(mask)[..., None] if mask.mode == "L" else to_arr(mask)
    if m.ndim == 3 and m.shape[2] != 1:
        m = m[..., :1]
    return base * (1 - m) + hexc(color) * m


class Layer:
    """A silhouette layer with its own colour, plus a separate list of point lights."""

    def __init__(self):
        self.mask = Image.new("L", (W, H), 0)
        self.d = ImageDraw.Draw(self.mask)


def city_buildings(rng, layer, base_y, hmin, hmax, wmin, wmax, lights, lit, density=1.0):
    x = -40
    while x < W + 40:
        bw = rng.uniform(wmin, wmax)
        bh = rng.uniform(hmin, hmax) * (1.35 if rng.random() < 0.12 else 1)
        top = base_y - bh
        layer.d.rectangle([x, top, x + bw, base_y + 400], fill=255)
        if rng.random() < 0.25:  # stepped crown / spire
            layer.d.rectangle([x + bw * 0.3, top - bh * 0.12, x + bw * 0.7, top], fill=255)
            if rng.random() < 0.5:
                layer.d.rectangle([x + bw * 0.48, top - bh * 0.28, x + bw * 0.52, top], fill=255)
                lights.append((x + bw * 0.5, top - bh * 0.28, "#ff5a4a", 1.0))
        if lit > 0:
            for wy in np.arange(top + 8, base_y, 9):
                for wx in np.arange(x + 5, x + bw - 4, 8):
                    if rng.random() < lit * density:
                        lights.append((wx, wy, None, rng.uniform(0.35, 1.0)))
        x += bw + rng.uniform(-6, 10)


def scene_city(t, rng):
    img = gradient(t["sky"])
    sx, sy, sc, ss, sr = t["sun"]
    img = glow(img, sx, sy, sc, ss, sr)
    lights = []
    horizon = H * 0.62
    layers = []
    for (col, hmin, hmax, wmin, wmax, dens) in [
        (t["far"], 120, 330, 50, 110, 0.9),
        (t["mid"], 90, 260, 70, 150, 1.0),
        (t["near"], 60, 200, 90, 190, 1.0),
    ]:
        L = Layer()
        layer_lights = []
        city_buildings(rng, L, horizon + rng.uniform(-4, 4), hmin, hmax, wmin, wmax, layer_lights, t["lit"], dens)
        layers.append((L, col, layer_lights))
    for L, col, ll in layers:
        img = paste_mask(img, L.mask, col)
        lights += ll
    # river + reflections
    water_top = int(horizon + 6)
    refl = img[water_top - (H - water_top):water_top][::-1].copy()
    wtr = gradient([(0, t["water"]), (1, t["near"])], H - water_top)
    img[water_top:] = refl * 0.45 + wtr * 0.55
    # embankment
    img[water_top - 2:water_top + 4] = img[water_top - 2:water_top + 4] * 0.6 + hexc(t["near"]) * 0.4
    for (x, y, c, a) in list(lights):
        if y < water_top and rng.random() < 0.35:
            lights.append((x + rng.uniform(-3, 3), 2 * water_top - y, c, a * 0.45))
    # promenade lamps along the near bank
    if t["lights"]:
        for x in np.arange(20, W, 70):
            lights.append((x + rng.uniform(-8, 8), H * 0.9 + rng.uniform(-10, 10), "#ffd59a", 1.0))
    return img, lights


def scene_harbor(t, rng):
    img = gradient(t["sky"])
    sx, sy, sc, ss, sr = t["sun"]
    img = glow(img, sx, sy, sc, ss, sr)
    lights = []
    horizon = int(H * 0.58)
    # distant hills
    L = Layer()
    pts = [(0, horizon)]
    for x in range(0, W + 40, 40):
        pts.append((x, horizon - 70 - 50 * math.sin(x / 260 + 1) - 25 * math.sin(x / 90)))
    pts.append((W, horizon))
    L.d.polygon(pts, fill=255)
    img = paste_mask(img, L.mask, t["far"])
    # port cranes + low skyline
    L = Layer()
    for x in np.arange(80, W, 140):
        if rng.random() < 0.55:
            h = rng.uniform(70, 150)
            L.d.rectangle([x, horizon - h, x + 8, horizon], fill=255)
            L.d.rectangle([x - 40, horizon - h, x + 70, horizon - h + 7], fill=255)
            lights.append((x + 4, horizon - h - 4, "#ff5a4a", 1.0))
        else:
            h = rng.uniform(25, 60)
            L.d.rectangle([x, horizon - h, x + rng.uniform(40, 120), horizon], fill=255)
    for x in np.arange(0, W, 6):
        if t["lights"] and rng.random() < 0.5 * t["lights"]:
            lights.append((x, horizon - rng.uniform(2, 40), None, rng.uniform(0.3, 0.9)))
    img = paste_mask(img, L.mask, t["mid"])
    # sea
    sea = gradient([(0, t["water"]), (1, t["near"])], H - horizon)
    refl = img[horizon - (H - horizon):horizon][::-1]
    img[horizon:] = sea * 0.6 + refl * 0.4
    # glitter path from sun / moon
    yy, xx = np.mgrid[horizon:H, 0:W]
    path = np.exp(-((xx / W - sx) / (0.05 + 0.25 * (yy - horizon) / (H - horizon))) ** 2)
    sparkle = (rng.random(path.shape) < 0.02) * path
    img[horizon:] += hexc(t["sun"][2])[None, None] * (path[..., None] * 0.18 + sparkle[..., None] * 0.6)
    # near pier with railing + string lights
    L = Layer()
    L.d.polygon([(W * 0.0, H * 0.84), (W, H * 0.78), (W, H), (0, H)], fill=255)
    for x in np.arange(0, W, 90):
        y = H * 0.84 - (H * 0.06) * x / W
        L.d.rectangle([x, y - 120, x + 5, y], fill=255)
    img = paste_mask(img, L.mask, t["near"])
    if t["lights"]:
        for x in np.arange(0, W, 90):
            if rng.random() < 0.3: continue
            y0 = H * 0.84 - (H * 0.06) * x / W - 120
            for k in range(1, 6):
                xs = x + k * 15
                lights.append((xs, y0 + rng.uniform(-30, 10) * (x % 270 == 0) + 34 * math.sin(math.pi * k / 6), "#ffe2a8", 1.0 if t["lights"] else 0.0))
    for x in np.arange(30, W, 180):  # lights on the water from boats
        if t["lights"] and rng.random() < 0.6:
            lights.append((x + rng.uniform(-40, 40), horizon + rng.uniform(10, 80), rng.choice(["#fff1c9", "#9fe3ff"]), 0.9))
    return img, lights


def lattice_tower(d, x, base, h):
    w = h * 0.12
    d.polygon([(x - w, base), (x - w * 0.18, base - h), (x + w * 0.18, base - h), (x + w, base)], fill=255)
    d.rectangle([x - 2, base - h - h * 0.15, x + 2, base - h], fill=255)
    for k in range(3):  # antenna panels (RRU / AAU)
        yy = base - h + 6 + k * 14
        d.rectangle([x - w * 0.55, yy, x + w * 0.55, yy + 9], fill=255)


def scene_ridge(t, rng):
    img = gradient(t["sky"])
    sx, sy, sc, ss, sr = t["sun"]
    img = glow(img, sx, sy, sc, ss, sr)
    lights = []
    if t is TIMES["night"]:
        for _ in range(160):
            lights.append((rng.uniform(0, W), rng.uniform(0, H * 0.4), "star", rng.uniform(0.15, 0.4)))
    ridges = [
        (t["far"], H * 0.50, 70, 0.0021),
        (t["mid"], H * 0.60, 90, 0.0032),
    ]
    for col, base, amp, f in ridges:
        L = Layer()
        ph = rng.uniform(0, 6)
        pts = [(0, H)] + [
            (x, base - amp * (0.6 * math.sin(x * f + ph) + 0.4 * math.sin(x * f * 2.7 + ph * 2)))
            for x in range(0, W + 20, 20)
        ] + [(W, H)]
        L.d.polygon(pts, fill=255)
        img = paste_mask(img, L.mask, col)
    # valley city lights
    vy = H * 0.70
    L = Layer()
    L.d.rectangle([0, vy, W, H], fill=255)
    img = paste_mask(img, L.mask, t["mid"])
    if t["lights"]:
        for _ in range(int(500 * t["lights"])):
            x = rng.uniform(0, W)
            y = vy + abs(rng.normal(0, 40)) + 4
            lights.append((x, y, None, rng.uniform(0.3, 1.0)))
    # near ridge with towers
    L = Layer()
    pts = [(0, H)] + [
        (x, H * 0.80 - 120 * math.exp(-((x - W * 0.70) / 360) ** 2) - 18 * math.sin(x / 70))
        for x in range(0, W + 20, 20)
    ] + [(W, H)]
    L.d.polygon(pts, fill=255)
    for x, h in [(W * 0.66, 230), (W * 0.80, 170), (W * 0.30, 110)]:
        base = H * 0.80 - 120 * math.exp(-((x - W * 0.70) / 360) ** 2) + 6
        lattice_tower(L.d, x, base, h)
        lights.append((x, base - h - h * 0.15, "#ff4a3a", 1.0))
        lights.append((x, base - h * 0.55, "#ff4a3a", 0.7))
    img = paste_mask(img, L.mask, t["near"])
    if t is TIMES["day"]:  # soft cumulus
        for _ in range(7):
            img = glow(img, rng.uniform(0, 1), rng.uniform(0.08, 0.32), "#ffffff", 0.14, rng.uniform(0.14, 0.24))
    return img, lights


def disc(size, edge_bright=True):
    """A lens bokeh disc: flat interior, slightly brighter rim, soft edge."""
    r = size / 2
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.hypot(xx - r + 0.5, yy - r + 0.5) / r
    a = np.clip((1 - d) * r * 0.9, 0, 1)
    if edge_bright:
        a = a * (0.75 + 0.35 * np.clip(d, 0, 1) ** 3)
    return a


def add_bokeh(img, lights, t, rng, scale):
    out = img.copy()
    pal = t["bokeh_color"]
    for (x, y, c, a) in lights:
        col = hexc(c) if c else hexc(rng.choice(pal))
        size = int(rng.uniform(14, 34) * scale)
        if y > H * 0.82:
            size = int(size * rng.uniform(1.3, 2.2))  # nearer lights -> bigger discs
        k = disc(size)
        x0, y0 = int(x - size / 2), int(y - size / 2)
        xs, ys = max(0, x0), max(0, y0)
        xe, ye = min(W, x0 + size), min(H, y0 + size)
        if xe <= xs or ye <= ys:
            continue
        kk = k[ys - y0:ye - y0, xs - x0:xe - x0][..., None]
        out[ys:ye, xs:xe] += col * kk * a * t["bokeh_alpha"] * 0.55
    # a few huge foreground discs drifting across the frame
    for _ in range(t["bokeh_n"] // 8 + 2):
        size = int(rng.uniform(70, 170) * scale)
        x, y = rng.uniform(0, W), rng.uniform(H * 0.1, H)
        col = hexc(rng.choice(pal))
        k = disc(size)
        x0, y0 = int(x - size / 2), int(y - size / 2)
        xs, ys = max(0, x0), max(0, y0)
        xe, ye = min(W, x0 + size), min(H, y0 + size)
        if xe <= xs or ye <= ys:
            continue
        kk = k[ys - y0:ye - y0, xs - x0:xe - x0][..., None]
        out[ys:ye, xs:xe] += col * kk * t["bokeh_alpha"] * 0.10
    return out


def finish(img, t, rng):
    # atmospheric haze toward the bottom/horizon and a gentle vignette
    yy, xx = np.mgrid[0:H, 0:W]
    haze = np.exp(-((yy / H - 0.62) / 0.22) ** 2)[..., None] * t["haze_amt"]
    img = img * (1 - haze) + hexc(t["haze"]) * haze
    v = 1 - 0.28 * (np.hypot((xx / W - 0.5) * 1.2, yy / H - 0.48) ** 2)
    img = img * v[..., None]
    img = img * np.array(t["grade"])[None, None] * t["exposure"]
    grain = rng.normal(0, 0.012, (H, W, 1))
    return np.clip(img + grain, 0, 1)


SCENES = {"city": scene_city, "harbor": scene_harbor, "ridge": scene_ridge}

for name, fn in SCENES.items():
    for tname, t in TIMES.items():
        rng = np.random.default_rng(hash(name) % 1000 + 7)
        random.seed(1)
        sharp, lights = fn(t, rng)
        # defocus: large blur (~f/1.4 portrait lens on a far background)
        plate = to_img(sharp)
        pd = ImageDraw.Draw(plate)
        pal = t["bokeh_color"]
        for (x, y, c, a) in lights:
            col = tuple(int(v * 255) for v in hexc(pal[int(x * 7 + y) % len(pal)] if c in (None, "star") else c))
            r = 1 if c == "star" else 2
            pd.ellipse([x - r, y - r, x + r, y + r], fill=col)
        blurred = to_arr(plate.filter(ImageFilter.GaussianBlur(26)))
        # only some point lights survive as distinct defocused discs
        sel = [l for l in lights if l[2] != "star" and (l[2] is not None or rng.random() < 0.10)]
        bok = add_bokeh(np.zeros_like(blurred), sel, t, rng, 1.0)
        bok = 1 - np.exp(-bok * 1.4)
        bok = to_arr(to_img(np.clip(bok, 0, 1)).filter(ImageFilter.GaussianBlur(2.2)))
        img = 1 - (1 - blurred) * (1 - bok)  # screen blend
        img = finish(img, t, rng)
        to_img(img).resize((1600, 1000), Image.LANCZOS).save(f"{OUT}/{name}-{tname}.webp", quality=72, method=6)
        print(name, tname)
