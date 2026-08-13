#!/usr/bin/env python3
"""Generate Android launcher icons + splash from the official ATD mark.

Prefers ~/Downloads/atd_final-logo.png (red diesel mark on white), then
mobile/assets/atd-app-icon-512.png, then public/pwa-512.png.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
DOWNLOADS_FINAL = Path.home() / "Downloads" / "atd_final-logo.png"
DOWNLOADS_LEGACY = Path.home() / "Downloads" / "atd-app-icon-512.png"
CANONICAL = ROOT / "mobile" / "assets" / "atd-app-icon-512.png"
WHITE = (255, 255, 255, 255)
ATD_RED = (229, 42, 29, 255)
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
    CANONICAL.parent.mkdir(parents=True, exist_ok=True)
    if DOWNLOADS_FINAL.exists():
        shutil.copy2(DOWNLOADS_FINAL, CANONICAL)
        return CANONICAL
    if CANONICAL.exists():
        return CANONICAL
    if DOWNLOADS_LEGACY.exists():
        shutil.copy2(DOWNLOADS_LEGACY, CANONICAL)
        return CANONICAL
    fallback = ROOT / "public" / "pwa-512.png"
    if fallback.exists():
        return fallback
    raise FileNotFoundError("No ATD app icon found (expected ~/Downloads/atd_final-logo.png)")


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


def crop_to_mark(src: Image.Image, *, pad_ratio: float = 0.06) -> Image.Image:
    """Crop to the red ATD mark, keeping the white lightning cutouts intact."""
    rgba = src.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    bbox: list[int] | None = None
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 8 or (r > 240 and g > 240 and b > 240):
                continue
            if bbox is None:
                bbox = [x, y, x, y]
            else:
                bbox[0] = min(bbox[0], x)
                bbox[1] = min(bbox[1], y)
                bbox[2] = max(bbox[2], x)
                bbox[3] = max(bbox[3], y)
    if not bbox:
        return rgba
    pad = max(8, int(max(width, height) * pad_ratio))
    left, top, right, bottom = bbox
    return rgba.crop(
        (
            max(0, left - pad),
            max(0, top - pad),
            min(width, right + pad + 1),
            min(height, bottom + pad + 1),
        )
    )


def extract_mark_transparent(src: Image.Image) -> Image.Image:
    """Keep the red diesel mark; drop near-white canvas for adaptive foreground."""
    rgba = crop_to_mark(src, pad_ratio=0.04)
    pixels = rgba.load()
    width, height = rgba.size
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    dest = out.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 8:
                continue
            if r > 240 and g > 240 and b > 240:
                continue
            dest[x, y] = (r, g, b, a)
    bbox = out.getbbox()
    if not bbox:
        return rgba
    return out.crop(bbox)


def make_splash(src: Image.Image, width: int, height: int) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), WHITE)
    logo = crop_to_mark(src).convert("RGBA")
    target = int(min(width, height) * 0.38)
    logo.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (width - logo.width) // 2
    y = (height - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas.convert("RGB")


def write_feature_graphic(src: Image.Image) -> Path:
    width, height = 1024, 500
    art = Image.new("RGBA", (width, height), WHITE)
    draw = ImageDraw.Draw(art)
    tile = 180
    badge = fit_on_canvas(crop_to_mark(src), tile, background=WHITE, fill=0.92)
    art.alpha_composite(badge, (72, (height - tile) // 2))

    title_font = load_font(FONT_BOLD, 54)
    sub_font = load_font(FONT_REG, 26)
    meta_font = load_font(FONT_REG, 22)
    text_x = 72 + tile + 40
    draw.text((text_x, 168), "Anytime Workforce", font=title_font, fill=INK)
    draw.text((text_x, 242), "Attendance  ·  Leave  ·  Work Planner", font=sub_font, fill=MUTED)
    draw.text((text_x, 286), "Official Anytime Diesel employee app", font=meta_font, fill=ATD_RED)

    out = ROOT / "mobile" / "assets" / "play-feature-graphic-1024x500.png"
    art.convert("RGB").save(out, "PNG", optimize=True)
    return out


def main() -> None:
    source_path = resolve_source()
    src = Image.open(source_path).convert("RGBA")
    cropped = crop_to_mark(src)
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
        icon = fit_on_canvas(cropped, size, background=WHITE, fill=0.86)
        icon.save(out_dir / "ic_launcher.png", "PNG")
        icon.save(out_dir / "ic_launcher_round.png", "PNG")

    for name, size in fg_densities.items():
        out_dir = RES / f"mipmap-{name}"
        # Adaptive foreground: mark only, padded into the 66% safe zone.
        fg = fit_on_canvas(mark, size, background=(0, 0, 0, 0), fill=0.58)
        fg.save(out_dir / "ic_launcher_foreground.png", "PNG")

    # Adaptive background color
    (RES / "values").mkdir(parents=True, exist_ok=True)
    (RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        "    <color name=\"ic_launcher_background\">#FFFFFF</color>\n"
        "</resources>\n",
        encoding="utf-8",
    )

    store = fit_on_canvas(cropped, 512, background=WHITE, fill=0.86)
    store_path = ROOT / "mobile" / "assets" / "play-icon-512.png"
    store.save(store_path, "PNG")
    store.save(ROOT / "public" / "pwa-512.png", "PNG")
    store.save(ROOT / "public" / "atd-mark.png", "PNG")
    fit_on_canvas(cropped, 64, background=WHITE, fill=0.86).save(ROOT / "public" / "atd-favicon.png", "PNG")
    fit_on_canvas(cropped, 192, background=WHITE, fill=0.86).save(ROOT / "public" / "pwa-192.png", "PNG")
    fit_on_canvas(cropped, 180, background=WHITE, fill=0.86).save(ROOT / "public" / "apple-touch-icon.png", "PNG")
    store.save(ROOT / "mobile" / "assets" / "icon-512.png", "PNG")
    fit_on_canvas(cropped, 192, background=WHITE, fill=0.86).save(ROOT / "mobile" / "assets" / "icon-192.png", "PNG")
    fit_on_canvas(cropped, 180, background=WHITE, fill=0.86).save(
        ROOT / "mobile" / "assets" / "apple-touch-icon.png", "PNG"
    )

    # Android 12+ launch icon (circular mask) — extra padding so the mark is not clipped.
    (RES / "drawable").mkdir(parents=True, exist_ok=True)
    fit_on_canvas(cropped, 1152, background=WHITE, fill=0.52).save(
        RES / "drawable" / "splash_icon.png", "PNG", optimize=True
    )

    # Splash screens — white + centered official ATD mark.
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
