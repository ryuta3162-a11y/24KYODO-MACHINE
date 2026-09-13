from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(
    r"C:\Users\ryuta-kusaka\.cursor\projects\c-Users-ryuta-kusaka-Documents-GitHub-24KYODO-MACHINE\assets"
)

MATRIX_SRC = ROOT / "floorplan/source/smith_matrix_src.png"
CYBEX_GEN = ASSETS / "smith_cybex_white.png"
CYBEX_SAVED = ROOT / "floorplan/source/smith_cybex_white.png"


def font(size: int) -> ImageFont.ImageFont:
    for p in (
        r"C:\Windows\Fonts\YuGothB.ttc",
        r"C:\Windows\Fonts\meiryo.ttc",
        r"C:\Windows\Fonts\msgothic.ttc",
    ):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def to_white_bg(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                px[x, y] = (255, 255, 255, 255)
                continue
            if r > 235 and g > 235 and b > 235 and abs(r - g) < 12 and abs(g - b) < 12:
                px[x, y] = (255, 255, 255, 255)
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def fit_contain(
    im: Image.Image,
    box_w: int,
    box_h: int,
    bg=(255, 255, 255),
    pad_ratio: float = 0.06,
) -> Image.Image:
    canvas = Image.new("RGB", (box_w, box_h), bg)
    max_w = int(box_w * (1 - pad_ratio * 2))
    max_h = int(box_h * (1 - pad_ratio * 2))
    scale = min(max_w / im.width, max_h / im.height)
    nw = max(1, int(im.width * scale))
    nh = max(1, int(im.height * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (box_w - nw) // 2
    y = (box_h - nh) // 2
    canvas.paste(resized, (x, y))
    return canvas


def make_jpg(src: Path, out: Path, label: str, ref_size: tuple[int, int]) -> None:
    base = to_white_bg(Image.open(src))
    w, h = ref_size
    fitted = fit_contain(base, w, h - 160, bg=(255, 255, 255), pad_ratio=0.05)
    out_im = Image.new("RGB", (w, h), (255, 255, 255))
    out_im.paste(fitted, (0, 20))
    d = ImageDraw.Draw(out_im)
    f = font(48)
    bbox = d.textbbox((0, 0), label, font=f)
    tw = bbox[2] - bbox[0]
    d.text(((w - tw) // 2, h - 110), label, fill=(20, 20, 20), font=f)
    out_im.save(out, quality=92, optimize=True)
    print("jpg", out.name, out_im.size)


def make_place_preview(
    src: Path,
    place_out: Path,
    preview_out: Path,
    place_size: tuple[int, int],
) -> None:
    base = to_white_bg(Image.open(src))
    place_bg = (236, 238, 241)
    place = fit_contain(base, place_size[0], place_size[1], bg=place_bg, pad_ratio=0.04)
    place.save(place_out)
    prev = fit_contain(base, 256, 256, bg=place_bg, pad_ratio=0.06)
    prev.save(preview_out)
    print("place/preview", place_out.name, place.size, preview_out.name, prev.size)


def main() -> None:
    Image.open(CYBEX_GEN).convert("RGBA").save(CYBEX_SAVED)
    ref_jpg = Image.open(ROOT / "freeweight_6.jpg")
    ref_place = Image.open(ROOT / "floorplan/machines/place/freeweight_6_place.png")

    items = [
        ("freeweight_6b", MATRIX_SRC, "スミスマシン　×1"),
        ("freeweight_6c", CYBEX_SAVED, "スミスマシン　×1"),
    ]
    for mid, src, label in items:
        make_jpg(src, ROOT / f"{mid}.jpg", label, ref_jpg.size)
        make_place_preview(
            src,
            ROOT / f"floorplan/machines/place/{mid}_place.png",
            ROOT / f"floorplan/machines/preview/{mid}_preview.png",
            ref_place.size,
        )


if __name__ == "__main__":
    main()
