"""
全マシン統一モジュール一括生成
基準図面: 横3000cm × 縦1900cm / 1マス20cm / 1px=1cm
デザイン: 外枠（0.80m区画）+ 格子（空き帯のみ）+ 本体寸法 + 名前 / 不透明・余白なし
"""
from __future__ import annotations

import csv
import json
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "floorplan"
MACHINES_OUT = OUT / "machines" / "place"
PREVIEW_OUT = OUT / "machines" / "preview"
SOURCE = OUT / "source"
CATALOG = OUT / "machines_catalog.json"
ZIP_PATH = Path(r"C:\Users\ryuta-kusaka\Desktop\施工図マシン_Canva用.zip")

CELL_CM = 20
PX_PER_CM = 1  # 図面 3000×1900cm に 1:1
CELL_PX = CELL_CM * PX_PER_CM
CLEARANCE_CM = 80
BORDER = 6


def cm(v: float) -> int:
    return int(round(v * PX_PER_CM))


def get_font(size: int) -> ImageFont.ImageFont:
    for path in (
        r"C:\Windows\Fonts\YuGothB.ttc",
        r"C:\Windows\Fonts\meiryo.ttc",
        r"C:\Windows\Fonts\msgothic.ttc",
        r"C:\Windows\Fonts\arial.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_arrow_h(d: ImageDraw.ImageDraw, x0: int, x1: int, y: int, color=(20, 20, 20), w: int = 1) -> None:
    if x1 < x0:
        x0, x1 = x1, x0
    d.line([(x0, y), (x1, y)], fill=color, width=w)
    ah = 5
    d.polygon([(x0, y), (x0 + ah, y - 3), (x0 + ah, y + 3)], fill=color)
    d.polygon([(x1, y), (x1 - ah, y - 3), (x1 - ah, y + 3)], fill=color)


def draw_arrow_v(d: ImageDraw.ImageDraw, y0: int, y1: int, x: int, color=(20, 20, 20), w: int = 1) -> None:
    if y1 < y0:
        y0, y1 = y1, y0
    d.line([(x, y0), (x, y1)], fill=color, width=w)
    ah = 5
    d.polygon([(x, y0), (x - 3, y0 + ah), (x + 3, y0 + ah)], fill=color)
    d.polygon([(x, y1), (x - 3, y1 - ah), (x + 3, y1 - ah)], fill=color)


def silhouette(name: str, category: str, w: int, h: int) -> Image.Image:
    """マシン種別ごとの上面シルエット（統一トーン）。"""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    body = (55, 55, 60, 255)
    dark = (30, 30, 34, 255)
    accent = (180, 40, 50, 255)
    mid = (90, 90, 98, 255)

    n = name
    if "トレッド" in n:
        d.rounded_rectangle([2, 2, w - 3, h - 3], 6, fill=body)
        d.rounded_rectangle([int(w * 0.14), int(h * 0.16), int(w * 0.86), int(h * 0.94)], 4, fill=dark)
        d.rounded_rectangle([int(w * 0.12), 3, int(w * 0.88), int(h * 0.13)], 5, fill=mid)
        d.rectangle([int(w * 0.3), 8, int(w * 0.7), int(h * 0.1)], fill=(40, 80, 120, 255))
        d.rectangle([int(w * 0.46), int(h * 0.11), int(w * 0.54), int(h * 0.13)], fill=accent)
    elif "クロス" in n:
        d.rounded_rectangle([int(w * 0.22), 4, int(w * 0.78), h - 4], 10, fill=body)
        d.ellipse([2, int(h * 0.55), int(w * 0.32), int(h * 0.88)], fill=dark)
        d.ellipse([int(w * 0.68), int(h * 0.55), w - 3, int(h * 0.88)], fill=dark)
        d.rounded_rectangle([int(w * 0.3), 6, int(w * 0.7), int(h * 0.18)], 3, fill=dark)
    elif "リクライン" in n:
        d.rounded_rectangle([int(w * 0.15), int(h * 0.15), int(w * 0.85), int(h * 0.9)], 12, fill=body)
        d.ellipse([int(w * 0.25), int(h * 0.05), int(w * 0.75), int(h * 0.28)], fill=mid)
        d.rounded_rectangle([int(w * 0.3), int(h * 0.4), int(w * 0.7), int(h * 0.75)], 8, fill=dark)
        d.ellipse([int(w * 0.1), int(h * 0.55), int(w * 0.3), int(h * 0.7)], fill=(200, 170, 40, 255))
        d.ellipse([int(w * 0.7), int(h * 0.55), int(w * 0.9), int(h * 0.7)], fill=(200, 170, 40, 255))
    elif "エアロ" in n or "バイク" in n:
        d.ellipse([int(w * 0.2), int(h * 0.7), int(w * 0.8), int(h * 0.95)], fill=mid)
        d.ellipse([int(w * 0.28), int(h * 0.08), int(w * 0.72), int(h * 0.3)], fill=mid)
        d.ellipse([int(w * 0.22), int(h * 0.28), int(w * 0.78), int(h * 0.78)], fill=body)
        d.ellipse([int(w * 0.38), int(h * 0.5), int(w * 0.62), int(h * 0.68)], fill=dark)
        d.ellipse([4, int(h * 0.48), int(w * 0.28), int(h * 0.6)], fill=(200, 170, 40, 255))
        d.ellipse([int(w * 0.72), int(h * 0.48), w - 5, int(h * 0.6)], fill=(200, 170, 40, 255))
    elif "ラック" in n or "スミス" in n or "チンニング" in n:
        d.rectangle([int(w * 0.08), int(h * 0.08), int(w * 0.22), int(h * 0.92)], fill=dark)
        d.rectangle([int(w * 0.78), int(h * 0.08), int(w * 0.92), int(h * 0.92)], fill=dark)
        d.rectangle([int(w * 0.08), int(h * 0.08), int(w * 0.92), int(h * 0.18)], fill=accent)
        d.rectangle([int(w * 0.08), int(h * 0.82), int(w * 0.92), int(h * 0.92)], fill=body)
    elif "ケーブル" in n or "ステーション" in n:
        d.rounded_rectangle([4, 4, w - 5, h - 5], 8, fill=body)
        d.rectangle([int(w * 0.08), int(h * 0.15), int(w * 0.28), int(h * 0.85)], fill=dark)
        d.rectangle([int(w * 0.72), int(h * 0.15), int(w * 0.92), int(h * 0.85)], fill=dark)
        if w > 200:
            d.rectangle([int(w * 0.4), int(h * 0.2), int(w * 0.6), int(h * 0.8)], fill=mid)
    elif "ダンベル" in n:
        d.rounded_rectangle([4, int(h * 0.2), w - 5, int(h * 0.8)], 6, fill=body)
        for i in range(6):
            x = int(w * (0.08 + i * 0.15))
            d.rectangle([x, int(h * 0.28), x + max(6, w // 20), int(h * 0.72)], fill=dark)
    elif "ベンチ" in n or "シットアップ" in n:
        d.rounded_rectangle([int(w * 0.25), int(h * 0.15), int(w * 0.75), int(h * 0.85)], 6, fill=dark)
        d.ellipse([int(w * 0.3), int(h * 0.05), int(w * 0.7), int(h * 0.2)], fill=mid)
        d.ellipse([int(w * 0.35), int(h * 0.82), int(w * 0.65), int(h * 0.95)], fill=mid)
    elif category == "resistance":
        # ウェイトマシン共通: 座席 + ウェイト塔
        d.rounded_rectangle([int(w * 0.08), int(h * 0.15), int(w * 0.38), int(h * 0.85)], 6, fill=mid)
        d.rounded_rectangle([int(w * 0.4), int(h * 0.25), int(w * 0.92), int(h * 0.8)], 10, fill=body)
        d.rounded_rectangle([int(w * 0.5), int(h * 0.35), int(w * 0.82), int(h * 0.7)], 8, fill=dark)
        d.rectangle([int(w * 0.12), int(h * 0.2), int(w * 0.34), int(h * 0.8)], fill=(70, 70, 75, 255))
    else:
        d.rounded_rectangle([4, 4, w - 5, h - 5], 8, fill=body)
        d.rounded_rectangle([int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8)], 6, fill=dark)
    return img


def load_topdown(machine: dict, w: int, h: int) -> Image.Image:
    SOURCE.mkdir(parents=True, exist_ok=True)
    # 既存の上面図があれば優先
    for key in (machine["id"], machine["id"].rstrip("ab"), machine["name"]):
        for p in SOURCE.glob(f"*{key}*topdown*.png"):
            im = Image.open(p).convert("RGBA")
            pix = im.load()
            for y in range(im.height):
                for x in range(im.width):
                    r, g, b, a = pix[x, y]
                    if r > 235 and g > 235 and b > 235:
                        pix[x, y] = (0, 0, 0, 0)
            bbox = im.getbbox()
            if bbox:
                im = im.crop(bbox)
            return im.resize((w, h), Image.Resampling.LANCZOS)
    # 既知3種
    aliases = {
        "cardio_1": "treadmill-topdown.png",
        "cardio_2": "crosstrainer-topdown.png",
        "cardio_3a": "aerobike-topdown.png",
    }
    if machine["id"] in aliases:
        p = SOURCE / aliases[machine["id"]]
        if p.exists():
            im = Image.open(p).convert("RGBA")
            bbox = im.getbbox()
            if bbox:
                im = im.crop(bbox)
            return im.resize((w, h), Image.Resampling.LANCZOS)
    return silhouette(machine["name"], machine["category"], w, h)


def build_module(machine: dict) -> dict:
    mw = cm(machine["width_cm"])
    ml = cm(machine["length_cm"])
    clr = cm(CLEARANCE_CM)
    mod_w = mw + clr * 2
    mod_h = ml + clr * 2

    place = Image.new("RGBA", (mod_w, mod_h), (236, 236, 238, 255))
    pd = ImageDraw.Draw(place)

    for x in range(0, mod_w + 1, CELL_PX):
        pd.line([(x, 0), (x, mod_h)], fill=(200, 200, 205, 255), width=1)
    for y in range(0, mod_h + 1, CELL_PX):
        pd.line([(0, y), (mod_w, y)], fill=(200, 200, 205, 255), width=1)

    mx, my = clr, clr
    topdown = load_topdown(machine, mw, ml)
    machine_layer = Image.new("RGBA", (mw, ml), (236, 236, 238, 255))
    machine_layer.paste(topdown, (0, 0), topdown)
    place.paste(machine_layer, (mx, my))

    font_dim = get_font(14)
    font_name = get_font(15)
    black = (20, 20, 20, 255)
    mx0, my0, mx1, my1 = mx, my, mx + mw - 1, my + ml - 1

    def dim_badge(text: str, cx: int, cy: int) -> None:
        tw = int(pd.textlength(text, font=font_dim)) if hasattr(pd, "textlength") else len(text) * 8
        bw, bh = tw + 10, 18
        bx, by = cx - bw // 2, cy - bh // 2
        bx = max(BORDER + 2, min(bx, mod_w - bw - BORDER - 2))
        by = max(BORDER + 2, min(by, mod_h - bh - BORDER - 2))
        pd.rounded_rectangle([bx, by, bx + bw, by + bh], 4, fill=(255, 255, 255, 255), outline=(40, 40, 40, 255), width=1)
        pd.text((bx + 5, by + 1), text, fill=black, font=font_dim)

    w_label = f"{machine['width_cm'] / 100:.2f}m"
    l_label = f"{machine['length_cm'] / 100:.2f}m"
    dim_y = my1 + max(10, min(28, (mod_h - my1) // 3))
    draw_arrow_h(pd, mx0, mx1, dim_y, black, 1)
    dim_badge(w_label, (mx0 + mx1) // 2, dim_y + 14)
    dim_x = mx1 + max(10, min(28, (mod_w - mx1) // 3))
    draw_arrow_v(pd, my0, my1, dim_x, black, 1)
    dim_badge(l_label, dim_x, (my0 + my1) // 2)

    name = machine["name"]
    # 長い名前は短縮表示スペース確保
    display = name if len(name) <= 14 else name[:13] + "…"
    tw = pd.textlength(display, font=font_name) if hasattr(pd, "textlength") else len(display) * 11
    lw, lh = int(min(tw + 18, mod_w - BORDER * 2 - 8)), 20
    lx = (mod_w - lw) // 2
    ly = mod_h - BORDER - lh - 4
    pd.rounded_rectangle([lx, ly, lx + lw, ly + lh], 8, fill=(255, 255, 255, 255), outline=(20, 20, 20, 255), width=1)
    pd.text((lx + 8, ly + 1), display, fill=black, font=font_name)

    pd.rectangle([0, 0, mod_w - 1, mod_h - 1], outline=(10, 10, 10, 255), width=BORDER)
    pd.rectangle([BORDER, BORDER, mod_w - BORDER - 1, mod_h - BORDER - 1], outline=(60, 60, 60, 255), width=1)

    place_rgb = Image.new("RGB", place.size, (236, 236, 238))
    place_rgb.paste(place, mask=place.split()[-1])

    MACHINES_OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW_OUT.mkdir(parents=True, exist_ok=True)
    safe = machine["id"]
    place_path = MACHINES_OUT / f"{safe}_place.png"
    place_rgb.save(place_path)
    preview = place_rgb.resize((mod_w * 2, mod_h * 2), Image.Resampling.NEAREST)
    preview_path = PREVIEW_OUT / f"{safe}_preview.png"
    preview.save(preview_path)

    print(f"OK {safe}: {machine['name']} {mw}x{ml}+clr => {mod_w}x{mod_h}px")
    return {
        **machine,
        "clearance_cm": CLEARANCE_CM,
        "module_width_cm": mod_w,
        "module_length_cm": mod_h,
        "place_file": place_path.name,
        "preview_file": preview_path.name,
        "place_px_w": mod_w,
        "place_px_h": mod_h,
    }


def make_zip(rows: list[dict]) -> None:
    readme = OUT / "README_Canva.txt"
    readme.write_text(
        "\n".join(
            [
                "JOYFIT24経堂 施工図マシンモジュール（Canva用）",
                "",
                "基準図面: 横3000cm × 縦1900cm / 1マス=20cm / 1px=1cm",
                "各PNGは 本体寸法 + 四方0.80m の外枠込み・不透明・余白なし",
                "マシンごとに枠サイズは異なります（実寸が違うため）",
                "",
                "使い方:",
                "1. 公式図面（150×95マス）をCanvaに配置",
                "2. place/ 内の *_place.png をアップロードして重ねる",
                "3. 図面が3000×1900pxなら、画像はリサイズ不要（元サイズのまま）",
                "4. 外枠同士が重ならなければ0.80m区画は担保されます",
                "",
                "寸法は暫定値です。スプシ確定後に差し替え可能です。",
                "",
            ]
        ),
        encoding="utf-8",
    )

    with ZIP_PATH.open("wb") as _:
        pass
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(readme, arcname="README_Canva.txt")
        zf.write(OUT / "machines.csv", arcname="machines.csv")
        zf.write(CATALOG, arcname="machines_catalog.json")
        for p in sorted(MACHINES_OUT.glob("*_place.png")):
            zf.write(p, arcname=f"place/{p.name}")
        for p in sorted(PREVIEW_OUT.glob("*_preview.png")):
            zf.write(p, arcname=f"preview/{p.name}")
    print("ZIP:", ZIP_PATH, "size_mb=", round(ZIP_PATH.stat().st_size / 1e6, 2))


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    rows = [build_module(m) for m in catalog]
    meta = {
        "floor_cm": [3000, 1900],
        "cell_cm": CELL_CM,
        "px_per_cm": PX_PER_CM,
        "clearance_cm": CLEARANCE_CM,
        "count": len(rows),
        "machines": rows,
    }
    (OUT / "scale.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    with (OUT / "machines.csv").open("w", encoding="utf-8-sig", newline="") as f:
        fields = [
            "id", "name", "category", "width_cm", "length_cm", "clearance_cm",
            "module_width_cm", "module_length_cm", "place_px_w", "place_px_h",
            "qty", "lp_image", "place_file", "preview_file",
        ]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})
    make_zip(rows)
    print("done", len(rows), "machines")


if __name__ == "__main__":
    main()
