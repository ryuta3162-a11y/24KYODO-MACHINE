# 施工図アセット（20cmマス）

## スケール

| 項目 | 値 |
|------|-----|
| 図面 | 横 3000cm × 縦 1900cm |
| 1マス | 20cm × 20cm |
| マス数 | 150 × 95 |
| ピクセル | **1px = 1cm** |

配置Web／Canvaでは **2F公式図面** `floor_2f_3000x1900.jpg` を背景にし、`machines/place/*_place.png` をそのまま貼ると実寸一致です。

## ファイル

- `floor_2f.jpg` … ユーザー提供の2階図面（原寸アップロード）
- `source/floor_2f.jpg` … 同上の保管コピー
- `floor_2f_3000x1900.jpg` … 配置用（3000×1900に正規化）
- `floor_grid_3000x1900.png` … 空グリッド（予備）
- `machines/place/*.png` … 配置モジュール（1px=1cm）
- `machines.csv` / `machines_catalog.json` … 寸法カタログ

## 作り直し

```powershell
python build_floorplan_assets.py
```
