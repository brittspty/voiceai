"""Rebuild public/brand/jai-og.png from the homepage hero title and public lines.

Keeps the existing jAI lockup pixels. Rewrites the headline and footer.
Requires Poppins Bold and Regular (google/fonts ofl/poppins) at /tmp/fonts
or next to this script is not assumed; pass --font-dir.
"""

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public/brand/jai-og.png"
HERO = ROOT / "lib/homepage-content.ts"
BRAND = ROOT / "lib/brand/public.ts"
FONT_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/fonts")

BG = (35, 31, 32)
PAPER = (245, 242, 240)
ORANGE = (255, 88, 0)
MUTE = (184, 176, 173)
LINE = (58, 52, 53)


def quoted(path: Path, name: str) -> str:
    text = path.read_text()
    match = re.search(rf"export const {name} = \"([^\"]+)\"", text)
    if not match:
        raise SystemExit(f"missing {name} in {path}")
    return match.group(1)


def hero_title() -> str:
    text = HERO.read_text()
    match = re.search(r"hero:\s*\{\s*title:\s*\"([^\"]+)\"", text)
    if not match:
        raise SystemExit("missing homepage hero title")
    return match.group(1)


def main() -> None:
    title = hero_title()
    tagline = quoted(BRAND, "PUBLIC_TAGLINE")
    ad_line = quoted(BRAND, "PUBLIC_AD_LINE")
    bold = ImageFont.truetype(str(FONT_DIR / "Poppins-Bold.ttf"), 48)
    regular = ImageFont.truetype(str(FONT_DIR / "Poppins-Regular.ttf"), 21)

    image = Image.open(SRC).convert("RGB")
    if image.size != (1200, 630):
        raise SystemExit(f"unexpected size {image.size}")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 270, 1200, 630), fill=BG)
    draw.line((72, 538, 1128, 538), fill=LINE)

    line_one = "Stop letting platforms prescribe your ROI."
    line_two = "Own the audience"
    if title != f"{line_one} {line_two}":
        raise SystemExit(f"hero title changed, update the wrap in this script: {title}")

    def baseline_for_top(font: ImageFont.FreeTypeFont, text: str, top: int) -> int:
        box = draw.textbbox((0, 0), text, font=font, anchor="ls")
        return top - box[1]

    def paint(text: str, xy: tuple[int, int], font: ImageFont.FreeTypeFont, fill: tuple[int, int, int]) -> int:
        draw.text(xy, text, font=font, fill=fill, anchor="ls")
        box = draw.textbbox(xy, text, font=font, anchor="ls")
        return box[2]

    first_base = baseline_for_top(bold, line_one, 300)
    second_base = baseline_for_top(bold, line_two, 362)
    paint(line_one, (74, first_base), bold, PAPER)
    end = paint(line_two, (74, second_base), bold, PAPER)
    paint(".", (end, second_base), bold, ORANGE)

    footer_base = baseline_for_top(regular, tagline, 571)
    paint(tagline, (72, footer_base), regular, MUTE)
    right_box = draw.textbbox((0, 0), ad_line, font=regular, anchor="ls")
    paint(ad_line, (1126 - right_box[2], footer_base), regular, MUTE)

    image.save(SRC, format="PNG", optimize=True)
    print(f"wrote {SRC} headline={title}.")


if __name__ == "__main__":
    main()
