# 施工図アセット（20cmマス）

## スケール

| 項目 | 値 |
|------|-----|
| 図面 | 横 3000cm × 縦 1900cm |
| 1マス | 20cm × 20cm |
| マス数 | 150 × 95 |
| ピクセル | **1px = 1cm** |

Canvaでは `floor_grid_3000x1900.png` を背景にし、`*_place.png` をそのまま貼ると実寸一致です。

## ファイル

- `floor_grid_3000x1900.png` … 全体格子図面
- `machines/treadmill_labeled.png` … 寸法・マス数つき（確認用）
- `machines/treadmill_labeled_preview.png` … 確認用3倍
- `machines/treadmill_place.png` … Canva貼り付け用（80×200px = 80×200cm）
- `machines.csv` … 寸法一覧（スプシ代わりの仮）
- `source/treadmill-topdown.png` … LPから起こした上面図

## 作り直し

```powershell
python build_floorplan_assets.py
```

`build_floorplan_assets.py` の `MACHINES` に寸法を20cm単位で追記して再実行。
