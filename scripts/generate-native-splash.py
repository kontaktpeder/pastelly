#!/usr/bin/env python3
"""Compose the iOS launch splash from the Pastelly app icon.

Requires Pillow:  python3 -m pip install pillow
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ICON_SRC = ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/Design uten navn (23).png"
SPLASH_DIR = ROOT / "ios/App/App/Assets.xcassets/Splash.imageset"
PUBLIC_ICON = ROOT / "public/brand/app-icon.png"

CANVAS = 2732
ICON_PX = 512
RADIUS_RATIO = 0.2237
BG = (255, 255, 255, 255)


def rounded_icon(src: Image.Image, size: int) -> Image.Image:
    scale = 4
    big = size * scale
    icon = src.convert("RGBA").resize((big, big), Image.Resampling.LANCZOS)
    radius = int(big * RADIUS_RATIO)
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=radius, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=scale * 0.35))
    icon.putalpha(mask)
    return icon.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    src = Image.open(ICON_SRC)
    icon = rounded_icon(src, ICON_PX)

    splash = Image.new("RGBA", (CANVAS, CANVAS), BG)
    xy = ((CANVAS - ICON_PX) // 2, (CANVAS - ICON_PX) // 2)
    splash.alpha_composite(icon, xy)
    splash_rgb = splash.convert("RGB")

    SPLASH_DIR.mkdir(parents=True, exist_ok=True)
    for name in (
        "splash-2732x2732.png",
        "splash-2732x2732-1.png",
        "splash-2732x2732-2.png",
    ):
        splash_rgb.save(SPLASH_DIR / name, "PNG", optimize=True)

    PUBLIC_ICON.parent.mkdir(parents=True, exist_ok=True)
    src.convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS).save(
        PUBLIC_ICON, "PNG", optimize=True
    )
    print(f"splash → {SPLASH_DIR}")
    print(f"web icon → {PUBLIC_ICON}")


if __name__ == "__main__":
    main()
