#!/usr/bin/env python3
"""Generate branded Android adaptive launcher icons from the PWA 512 asset."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "pwa-512.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
BRAND = (220, 47, 32, 255)  # #dc2f20


def fit_square(img: Image.Image, size: int, pad_ratio: float = 0.18) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BRAND)
    inner = max(1, int(size * (1 - pad_ratio * 2)))
    logo = img.convert("RGBA")
    logo.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas


def main() -> None:
    src = Image.open(SRC)
    densities = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    fg_densities = {
        "mdpi": 108,
        "hdpi": 162,
        "xhdpi": 216,
        "xxhdpi": 324,
        "xxxhdpi": 432,
    }
    for name, size in densities.items():
        out_dir = RES / f"mipmap-{name}"
        out_dir.mkdir(parents=True, exist_ok=True)
        icon = fit_square(src, size, pad_ratio=0.16)
        icon.save(out_dir / "ic_launcher.png", "PNG")
        icon.save(out_dir / "ic_launcher_round.png", "PNG")

    for name, size in fg_densities.items():
        out_dir = RES / f"mipmap-{name}"
        # Adaptive foreground: logo on transparent with safe zone padding.
        fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        logo = src.convert("RGBA")
        inner = int(size * 0.55)
        logo.thumbnail((inner, inner), Image.Resampling.LANCZOS)
        x = (size - logo.width) // 2
        y = (size - logo.height) // 2
        fg.alpha_composite(logo, (x, y))
        fg.save(out_dir / "ic_launcher_foreground.png", "PNG")

    # Play Store 512 marketing icon
    store = fit_square(src, 512, pad_ratio=0.14)
    store_path = ROOT / "mobile" / "assets" / "play-icon-512.png"
    store_path.parent.mkdir(parents=True, exist_ok=True)
    store.save(store_path, "PNG")
    print(f"Wrote launcher icons under {RES} and {store_path}")


if __name__ == "__main__":
    main()
