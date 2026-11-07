"""Prepare the selected original concept sheet without using the old mesh.

The selected low-poly concept is a three-view strip (front, side, back). Tripo's
RAB contract takes four square directional PNGs, so the side view is mirrored
for the fourth direction. No Blender render or generated mesh is read here.
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "output/imagegen/cavalry-lowpoly/001-a-stylized-low-poly-3d-game-character-concept-sheet-for-a-mo.png"
OUT = ROOT / "artifacts/cavalry/tripo/original-lowpoly-001"
OUT.mkdir(parents=True, exist_ok=True)


def square_fit(image, size=512):
    image = image.convert("RGB")
    bg = image.getpixel((0, 0))
    fitted = ImageOps.contain(image, (size - 24, size - 24), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), bg)
    canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas


def main():
    source = Image.open(SOURCE).convert("RGB")
    # The selected concept is three equal orthographic panels: front, side,
    # back. Keep the original pixels and only normalize each panel to a square.
    # The concept layout leaves unequal gutters around the side view. These
    # boundaries keep a neighboring horse head/tail out of each crop.
    panels = [
        source.crop((40, 0, 520, source.height)),
        source.crop((560, 0, 1210, source.height)),
        source.crop((1280, 0, 1730, source.height)),
    ]
    views = {
        "front": square_fit(panels[0]),
        "left": square_fit(panels[1]),
        "back": square_fit(panels[2]),
        "right": square_fit(panels[1].transpose(Image.Transpose.FLIP_LEFT_RIGHT)),
    }
    for name, image in views.items():
        image.save(OUT / f"{name}.png")
    sheet = Image.new("RGB", (1024, 1024), views["front"].getpixel((0, 0)))
    for name, xy in (("front", (0, 0)), ("left", (512, 0)), ("back", (0, 512)), ("right", (512, 512))):
        sheet.paste(views[name], xy)
    sheet.save(OUT / "original-four-view.png")
    print("ORIGINAL_REFERENCE_READY", SOURCE, OUT, flush=True)


main()
