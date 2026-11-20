"""Defocused backdrop of a Delta-style green office campus: day / dusk sunset / night stars.

Same pipeline as render_backdrops.py (sharp plate -> large Gaussian defocus -> bokeh ->
haze, vignette, grain), with the defocus about 5% lighter (26 -> 24.7 px sigma).
"""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1600, 1000
OUT, LOGO = sys.argv[1], sys.argv[2]
BASE_BLUR = 6  # image px; the rest of the defocus is applied live in CSS

TIMES = {
    "day": dict(
        sky=[(0, "#5f9fd8"), (0.5, "#a9d2f0"), (1, "#e8f4fb")],
        glow=[(0.86, 0.06, "#fff6dc", 0.40, 0.28)],
        glass_top="#3f7fb3", glass_bot="#8ab9d9", mullion="#e8f1f6", fin="#f7fafb",
        frame="#dfe7ec", podium="#e9eff2", ground="#b9c6cc", tree="#5f8f6a", tree2="#7ea86f",
        lit=0.0, win="#fff1c9", logo_glow=0.0, stars=0, haze="#e4f1f8", haze_amt=0.18,
        bokeh=["#ffffff"], bokeh_alpha=0.10, grade=(1, 1, 1),
    ),
    "dusk": dict(
        sky=[(0, "#2f3f66"), (0.30, "#7a6a95"), (0.58, "#e88f6a"), (0.80, "#ffc078"), (1, "#ffe0a8")],
        glow=[(0.30, 0.66, "#ffb35c", 0.95, 0.30), (0.30, 0.66, "#fff2cf", 0.55, 0.09)],
        glass_top="#6e6c92", glass_bot="#f0a678", mullion="#3f4560", fin="#5c5872",
        frame="#4a4a66", podium="#6b5c70", ground="#4b4254", tree="#2e3a3c", tree2="#3c4842",
        lit=0.22, win="#ffd28a", logo_glow=0.35, stars=0, haze="#f3b48c", haze_amt=0.20,
        bokeh=["#ffd28a", "#ffb877", "#fff1c9"], bokeh_alpha=0.55, grade=(1, 0.98, 0.95),
    ),
    "night": dict(
        sky=[(0, "#040915"), (0.45, "#0b1a33"), (0.85, "#173458"), (1, "#22466a")],
        glow=[(0.80, 0.14, "#cfe2ff", 0.10, 0.10)],
        glass_top="#0d1d33", glass_bot="#1b3552", mullion="#08111f", fin="#101d2e",
        frame="#0c1626", podium="#0f1b2b", ground="#0a1220", tree="#060c16", tree2="#08111b",
        lit=0.24, win="#f2cf92", logo_glow=1.0, stars=260, haze="#1d3a5c", haze_amt=0.14,
        bokeh=["#ffd28a", "#ffe9b8", "#9fe3ff", "#7cc4ff"], bokeh_alpha=0.8, grade=(0.96, 1, 1.05),
    ),
}


def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def vgrad(stops, h, w):
    ys = np.linspace(0, 1, h)
    out = np.zeros((h, 3), np.float32)
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        m = (ys >= a) & (ys <= b)
        t = ((ys[m] - a) / (b - a))[:, None]
        out[m] = hexc(ca) * (1 - t) + hexc(cb) * t
    return np.repeat(out[:, None], w, 1)


def glow(img, cx, cy, color, strength, radius):
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot((xx / W - cx) * (W / H), yy / H - cy)
    return img + hexc(color) * (np.exp(-(d / radius) ** 2) * strength)[..., None]


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def to_arr(im):
    return np.asarray(im).astype(np.float32) / 255


def fill(img, box, color_or_arr):
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if x1 <= x0 or y1 <= y0:
        return
    if isinstance(color_or_arr, str):
        img[y0:y1, x0:x1] = hexc(color_or_arr)
    else:
        img[y0:y1, x0:x1] = color_or_arr(y1 - y0, x1 - x0)


def glass(t, sky_img, box, rng, lights, cols, rows, refl=0.45):
    """Curtain wall: a sky reflection blended with the glass tint, mullion grid, lit panes."""
    x0, y0, x1, y1 = [int(v) for v in box]
    tint = vgrad([(0, t["glass_top"]), (1, t["glass_bot"])], y1 - y0, x1 - x0)
    # reflect the sky (mirrored vertically, slightly compressed) for a real-glass feel
    src = sky_img[max(0, 2 * y0 - y1):y0][::-1]
    if src.shape[0] >= 2:
        src = np.asarray(to_img(src).resize((x1 - x0, y1 - y0))).astype(np.float32) / 255
        tint = tint * (1 - refl) + src * refl
    sky_img[y0:y1, x0:x1] = tint
    cw, rh = (x1 - x0) / cols, (y1 - y0) / rows
    for r in range(rows):
        for c in range(cols):
            if rng.random() < t["lit"]:
                px, py = x0 + c * cw, y0 + r * rh
                lights.append((px + cw / 2, py + rh / 2, t["win"], rng.uniform(0.4, 1.0)))
                sky_img[int(py + 2):int(py + rh - 2), int(px + 2):int(px + cw - 2)] = (
                    sky_img[int(py + 2):int(py + rh - 2), int(px + 2):int(px + cw - 2)] * 0.3 + hexc(t["win"]) * 0.7)
    m = hexc(t["mullion"])
    for c in range(cols + 1):
        x = int(x0 + c * cw)
        sky_img[y0:y1, max(0, x - 1):x + 2] = m
    for r in range(rows + 1):
        y = int(y0 + r * rh)
        sky_img[max(0, y - 1):y + 1, x0:x1] = sky_img[max(0, y - 1):y + 1, x0:x1] * 0.4 + m * 0.6


def tree(d, cx, base, r, col):
    d.rectangle([cx - r * 0.08, base - r * 0.9, cx + r * 0.08, base], fill=col)
    for k in range(5):
        a = k / 5 * math.tau
        d.ellipse([cx - r + math.cos(a) * r * 0.35, base - 2.1 * r + math.sin(a) * r * 0.3,
                   cx + r + math.cos(a) * r * 0.35, base - 0.4 * r + math.sin(a) * r * 0.3], fill=col)


def render(t, rng):
    img = vgrad(t["sky"], H, W)
    for g in t["glow"]:
        img = glow(img, *g)
    lights = []
    stars = [(rng.uniform(0, W), H * 0.6 * rng.random() ** 1.6, rng.uniform(0.25, 1.0)) for _ in range(t["stars"])]
    ground_y = int(H * 0.80)

    # left companion block (lower, horizontal bands of glass + white spandrels)
    glass(t, img, (40, H * 0.40, 430, ground_y), rng, lights, 9, 11, refl=0.35)
    for r in range(12):
        y = H * 0.40 + r * (ground_y - H * 0.40) / 11
        fill(img, (40, y - 4, 430, y + 4), t["fin"])
    fill(img, (20, H * 0.38, 450, H * 0.41), t["frame"])

    # main tower: glass with vertical sun-shading fins and a crown carrying the mark
    tx0, tx1, ty0 = 620, 1060, int(H * 0.10)
    glass(t, img, (tx0, ty0, tx1, ground_y), rng, lights, 12, 26, refl=0.5)
    for k in range(13):
        x = tx0 + k * (tx1 - tx0) / 12
        fill(img, (x - 5, ty0, x + 5, ground_y), t["fin"])
    fill(img, (tx0 - 18, ty0 - 80, tx1 + 18, ty0), t["frame"])   # crown
    fill(img, (tx0 - 30, ty0 - 8, tx1 + 30, ty0 + 6), t["fin"])   # roof blade
    # roof garden on the crown edge (green building)
    d0 = ImageDraw.Draw(plate_holder := to_img(img))
    img = to_arr(plate_holder)

    # podium wing linking the two
    glass(t, img, (430, H * 0.62, tx0, ground_y), rng, lights, 8, 4, refl=0.3)
    fill(img, (410, H * 0.60, tx0 + 10, H * 0.625), t["fin"])
    glass(t, img, (tx1, H * 0.56, 1560, ground_y), rng, lights, 9, 6, refl=0.3)
    fill(img, (tx1 - 10, H * 0.54, 1580, H * 0.565), t["fin"])

    # ground plaza
    img[ground_y:] = vgrad([(0, t["podium"]), (1, t["ground"])], H - ground_y, W)

    plate = to_img(img)
    d = ImageDraw.Draw(plate)
    # green roof + landscaping (rows of trees in front of the building)
    for x in np.arange(-20, W + 40, 95):
        tree(d, x + rng.uniform(-20, 20), ground_y + rng.uniform(40, 90), rng.uniform(55, 85),
             t["tree"] if rng.random() < 0.6 else t["tree2"])
    for x in np.arange(tx0 - 10, tx1 + 10, 40):
        d.ellipse([x - 22, ty0 - 104, x + 22, ty0 - 78], fill=t["tree2"])
    # mark on the crown
    logo = Image.open(LOGO).convert("RGBA")
    lw = int((tx1 - tx0) * 0.86)
    logo = logo.resize((lw, int(lw * logo.height / logo.width)), Image.LANCZOS)
    lx, ly = (tx0 + tx1 - lw) // 2, ty0 - 66
    if t["logo_glow"]:
        lit = Image.new("RGBA", logo.size, (150, 220, 255, 0))
        lit.putalpha(logo.getchannel("A"))
        lit = Image.blend(logo, lit, t["logo_glow"])
        plate.alpha_composite(lit, (lx, ly)) if plate.mode == "RGBA" else plate.paste(lit, (lx, ly), lit)
    else:
        plate.paste(logo, (lx, ly), logo)
    if True:
        lights.append((tx0 + (tx1 - tx0) / 2, ly + 20, "#8fd6ff", max(0.35, t["logo_glow"])))
    # plaza lamps
    if t["lit"]:
        for x in np.arange(30, W, 120):
            lights.append((x, ground_y + 70 + rng.uniform(-8, 8), "#ffd59a", 1.0))
    # warm sunset reflection streak on the tower glass
    a = to_arr(plate)
    if t is TIMES["dusk"]:
        yy, xx = np.mgrid[0:H, 0:W]
        streak = np.exp(-((xx - (tx0 + 140) - (yy - ty0) * 0.25) / 120) ** 2) * ((xx > tx0) & (xx < tx1) & (yy > ty0) & (yy < ground_y))
        a = a + hexc("#ffc98a") * (streak * 0.30)[..., None]
    return a, lights, stars


def disc(size):
    r = size / 2
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.hypot(xx - r + 0.5, yy - r + 0.5) / r
    return np.clip((1 - d) * r * 0.9, 0, 1) * (0.75 + 0.35 * np.clip(d, 0, 1) ** 3)


def stamp(out, x, y, size, col, a):
    if size < 2:
        return
    k = disc(size)
    x0, y0 = int(x - size / 2), int(y - size / 2)
    xs, ys, xe, ye = max(0, x0), max(0, y0), min(W, x0 + size), min(H, y0 + size)
    if xe > xs and ye > ys:
        out[ys:ye, xs:xe] += col * (k[ys - y0:ye - y0, xs - x0:xe - x0] * a)[..., None]


for name, t in TIMES.items():
    rng = np.random.default_rng(11)
    sharp, lights, stars = render(t, rng)
    plate = to_img(sharp)
    pd = ImageDraw.Draw(plate)
    for (x, y, c, a) in lights:
        pd.ellipse([x - 2, y - 2, x + 2, y + 2], fill=tuple(int(v * 255) for v in hexc(c)))
    blurred = to_arr(plate.filter(ImageFilter.GaussianBlur(BASE_BLUR)))
    bok = np.zeros_like(blurred)
    # Dusk and night carry no bokeh discs: window and lamp light only survives as the
    # soft glow left in the blurred plate. Day keeps its few faint foreground discs.
    if name == "day":
        for _ in range(3):
            stamp(bok, rng.uniform(0, W), rng.uniform(H * 0.15, H), int(rng.uniform(80, 170)),
                  hexc(rng.choice(t["bokeh"])), t["bokeh_alpha"] * 0.10)
    # stars: a gentle starfield that still reads through the defocus (small soft discs)
    skyref = vgrad(t["sky"], H, W)
    for (x, y, a) in stars:
        if np.abs(sharp[int(y), int(x)] - skyref[int(y), int(x)]).max() > 0.08:
            continue
        stamp(bok, x, y, int(rng.uniform(5, 11) if a < 0.85 else rng.uniform(12, 18)),
              hexc(rng.choice(["#ffffff", "#dce9ff", "#fff3d9"])), a * 0.55)
    bok = 1 - np.exp(-bok * 1.4)
    bok = to_arr(to_img(bok).filter(ImageFilter.GaussianBlur(2.0)))
    img = blurred
    yy, xx = np.mgrid[0:H, 0:W]
    hz = np.exp(-((yy / H - 0.78) / 0.2) ** 2)[..., None] * t["haze_amt"]
    img = img * (1 - hz) + hexc(t["haze"]) * hz
    img = img * (1 - 0.26 * (np.hypot((xx / W - 0.5) * 1.2, yy / H - 0.48) ** 2))[..., None]
    img = img * np.array(t["grade"]) + rng.normal(0, 0.012, (H, W, 1))
    to_img(img).save(f"{OUT}/delta-{name}.webp", quality=80, method=6)
    to_img(bok).save(f"{OUT}/delta-{name}-lights.webp", quality=80, method=6)
    print(name)
