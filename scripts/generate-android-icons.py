#!/usr/bin/env python3
"""Generate Android launcher icons + splash from the official ATD mark.

Prefers mobile/assets/atd-app-icon-512.png (black tile + rust diesel mark).
Falls back to ~/Downloads/atd-app-icon-512.png, then public/pwa-512.png.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
DOWNLOADS = Path.home() / "Downloads" / "atd-app-icon-512.png"
CANONICAL = ROOT / "mobile" / "assets" / "atd-app-icon-512.png"
BLACK = (0, 0, 0, 255)
RUST = (196, 74, 42, 255)  # approximate ATD mark on the provided asset
CANVAS = (246, 248, 252, 255)
INK = (32, 36, 44, 255)
MUTED = (90, 98, 112, 255)
FONT_BOLD = Path("/usr/share/fonts/truetype/noto/NotoSansDisplay-Bold.ttf")
FONT_REG = Path("/usr/share/fonts/truetype/noto/NotoSansDisplay-Regular.ttf")

SPLASH_PORT = {
    "mdpi": (320, 480),
    "hdpi": (480, 800),
    "xhdpi": (720, 1280),
    "xxhdpi": (1080, 1920),
    "xxxhdpi": (1440, 2560),
}
SPLASH_LAND = {
    "mdpi": (480, 320),
    "hdpi": (800, 480),
    "xhdpi": (1280, 720),
    "xxhdpi": (1920, 1080),
    "xxxhdpi": (2560, 1440),
}


def resolve_source() -> Path:
    if CANONICAL.exists():
        return CANONICAL
    if DOWNLOADS.exists():
        CANONICAL.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(DOWNLOADS, CANONICAL)
        return CANONICAL
    fallback = ROOT / "public" / "pwa-512.png"
    if fallback.exists():
        return fallback
    raise FileNotFoundError("No ATD app icon found (expected mobile/assets/atd-app-icon-512.png)")


def load_font(path: Path, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype(str(path), size=size)
    except OSError:
        return ImageFont.load_default()


def fit_on_canvas(
    src: Image.Image,
    size: int,
    *,
    background: tuple[int, int, int, int],
    fill: float,
) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), background)
    logo = src.convert("RGBA")
    inner = max(1, int(size * fill))
    logo.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas


def extract_mark_transparent(src: Image.Image) -> Image.Image:
    """Keep non-black pixels for adaptive foreground (safe-zone mark)."""
    rgba = src.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    dest = out.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 8:
                continue
            # Drop near-black background
            if r < 28 and g < 28 and b < 28:
                continue
            dest[x, y] = (r, g, b, a)
    bbox = out.getbbox()
    if not bbox:
        return rgba
    pad = 6
    left, top, right, bottom = bbox
    return out.crop(
        (
            max(0, left - pad),
            max(0, top - pad),
            min(width, right + pad),
            min(height, bottom + pad),
        )
    )


def make_splash(src: Image.Image, width: int, height: int) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), BLACK)
    logo = src.convert("RGBA")
    target = int(min(width, height) * 0.42)
    logo.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (width - logo.width) // 2
    y = (height - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas.convert("RGB")


def write_feature_graphic(src: Image.Image) -> Path:
    width, height = 1024, 500
    art = Image.new("RGBA", (width, height), BLACK)
    draw = ImageDraw.Draw(art)
    tile = 180
    badge = fit_on_canvas(src, tile, background=BLACK, fill=0.92)
    art.alpha_composite(badge, (72, (height - tile) // 2))

    title_font = load_font(FONT_BOLD, 54)
    sub_font = load_font(FONT_REG, 26)
    meta_font = load_font(FONT_REG, 22)
    text_x = 72 + tile + 40
    draw.text((text_x, 168), "Anytime Workforce", font=title_font, fill=(255, 255, 255, 255))
    draw.text((text_x, 242), "Attendance  ·  Leave  ·  Work Planner", font=sub_font, fill=(180, 184, 192, 255))
    draw.text((text_x, 286), "Official Anytime Diesel employee app", font=meta_font, fill=RUST)

    out = ROOT / "mobile" / "assets" / "play-feature-graphic-1024x500.png"
    art.convert("RGB").save(out, "PNG", optimize=True)
    return out


def main() -> None:
    source_path = resolve_source()
    src = Image.open(source_path).convert("RGBA")
    mark = extract_mark_transparent(src)

    # Keep a canonical copy in the repo + credentials-friendly export.
    CANONICAL.parent.mkdir(parents=True, exist_ok=True)
    if source_path.resolve() != CANONICAL.resolve():
        shutil.copy2(source_path, CANONICAL)

    densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    fg_densities = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

    for name, size in densities.items():
        out_dir = RES / f"mipmap-{name}"
        out_dir.mkdir(parents=True, exist_ok=True)
        icon = fit_on_canvas(src, size, background=BLACK, fill=0.92)
        icon.save(out_dir / "ic_launcher.png", "PNG")
        icon.save(out_dir / "ic_launcher_round.png", "PNG")

    for name, size in fg_densities.items():
        out_dir = RES / f"mipmap-{name}"
        # Adaptive foreground: mark only, padded into the 66% safe zone.
        fg = fit_on_canvas(mark, size, background=(0, 0, 0, 0), fill=0.66)
        fg.save(out_dir / "ic_launcher_foreground.png", "PNG")

    # Adaptive background color
    (RES / "values").mkdir(parents=True, exist_ok=True)
    (RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        "    <color name=\"ic_launcher_background\">#000000</color>\n"
        "</resources>\n",
        encoding="utf-8",
    )

    store = fit_on_canvas(src, 512, background=BLACK, fill=0.92)
    store_path = ROOT / "mobile" / "assets" / "play-icon-512.png"
    store.save(store_path, "PNG")
    store.save(ROOT / "public" / "pwa-512.png", "PNG")
    fit_on_canvas(src, 192, background=BLACK, fill=0.92).save(ROOT / "public" / "pwa-192.png", "PNG")
    fit_on_canvas(src, 180, background=BLACK, fill=0.92).save(ROOT / "public" / "apple-touch-icon.png", "PNG")
    store.save(ROOT / "mobile" / "assets" / "icon-512.png", "PNG")
    fit_on_canvas(src, 192, background=BLACK, fill=0.92).save(ROOT / "mobile" / "assets" / "icon-192.png", "PNG")
    fit_on_canvas(src, 180, background=BLACK, fill=0.92).save(
        ROOT / "mobile" / "assets" / "apple-touch-icon.png", "PNG"
    )

    # Splash screens — black + centered ATD mark (replaces default Capacitor blue/white).
    for name, (w, h) in SPLASH_PORT.items():
        out_dir = RES / f"drawable-port-{name}"
        out_dir.mkdir(parents=True, exist_ok=True)
        make_splash(src, w, h).save(out_dir / "splash.png", "PNG", optimize=True)
    for name, (w, h) in SPLASH_LAND.items():
        out_dir = RES / f"drawable-land-{name}"
        out_dir.mkdir(parents=True, exist_ok=True)
        make_splash(src, w, h).save(out_dir / "splash.png", "PNG", optimize=True)
    (RES / "drawable").mkdir(parents=True, exist_ok=True)
    make_splash(src, 1080, 1920).save(RES / "drawable" / "splash.png", "PNG", optimize=True)

    feature = write_feature_graphic(src)
    print(f"Source: {source_path}")
    print(f"Wrote launcher icons, splash screens, {store_path.name}, and {feature.name}")


if __name__ == "__main__":
    main()
