# 経堂マシン配置 — 現状メモ（2026-09-15）

別PCで開いたとき用。今日ここで決まった運用が正。

## 見る場所

- 図面: https://24kyodo-machine.vercel.app/floorplan-app/?room=kyodo-2f
- スプレッドシート（経堂アイデアプール）: https://docs.google.com/spreadsheets/d/1YR4UNjOHT-AManewnSOEPxuR01kBVwXfgoCAjDsPeOw/edit
- 追加マシンタブ: https://docs.google.com/spreadsheets/d/1YR4UNjOHT-AManewnSOEPxuR01kBVwXfgoCAjDsPeOw/edit#gid=1243608110
- GitHub: https://github.com/ryuta3162-a11y/24KYODO-MACHINE
- 本番は `main` を push すると Vercel が更新する

## 今日の結論

WEB追加マシンの正は **スプレッドシート「追加マシン」**。

- 図面に出すのはシートにある行だけ
- シートの行を消すと、図面の一覧・配置からも見えなくなる
- 追加・変更はシートに書けて確認できてから成功。シートに残らない成功は出さない
- 画像ファイルは Vercel Blob に残るが、画面の有無はシートが決める

以前は Blob（裏）だけにパワーマックス V3 などがあり、シートに無かった。今日それを「追加マシン」へ写した。MATRIXクライム・自走式トレッドミル・technogymステアクライマーもシート側に揃えてある。

## 仕組み（短く）

1. 図面でマシン追加 → 画像を Blob へ
2. GAS が「追加マシン」へ upsert（マシンIDが同じなら上書き）
3. セルを読み直して書けたことを確認してから、図面カタログを更新
4. `/api/machines` は「追加マシン」CSV を読む。Blob の extras は画像つなぎだけ

GAS（社用アカウント `r-kusaka@okamoto-group.co.jp` で配置済み）:

- 編集: https://script.google.com/d/1tGVgPsLYLPnllQqWRLX_jpgMlwDTplvC0-yyfL7k83BAB3_0cUWNYvh2/edit
- Web App: https://script.google.com/macros/s/AKfycbw7L7epmdDMcrY2PooWjq3EUAkELSHMC6vj93-xLLZ_7RGJxOysAxlBxRyt9uCErxfO/exec
- 共有してもらっていた長い文字列は **スクリプトIDではなく APIキー**。Sheets API のキーだけでは書けない。書き込みは上記 GAS（所有者として実行）がやる。キーは GAS 書き込みの合言葉としても使っている

## clasp（GAS を直すとき）

この作業PCの Node はポータブル。PowerShell は `clasp.ps1` を拒否するので **`clasp.cmd`** を使う。

```powershell
$env:Path = "C:\Users\r-kus\AppData\Local\nodejs-portable\node-v22.16.0-win-x64;" + $env:Path
cd C:\Users\r-kus\Github\24KYODO-MACHINE
clasp.cmd login
clasp.cmd push -f
clasp.cmd deploy -i AKfycbw7L7epmdDMcrY2PooWjq3EUAkELSHMC6vj93-xLLZ_7RGJxOysAxlBxRyt9uCErxfO -d "メモ"
```

- ログインは **社用** `r-kusaka@okamoto-group.co.jp`（okamoto-group.co.jp）。個人 Gmail ではスプシに書けない
- アカウント選択では「別のアカウントを使用」
- ログイン画面が `clasp.ps1` で落ちたら、上のとおり `clasp.cmd login`

コードは `gas/Code.js`。`op=upsert-extra-machine` が追加マシンの upsert。

## 触ってよいシート / 触らないもの

- 触る: 「追加マシン」（WEB追加の正）
- 読む: 「既存マシン」「新マシン」
- 図面の配置データ自体は今までどおりアプリ保存（部屋の JSON / Blob）。消えるのは **カタログ上のマシン定義** がシートから無くなったとき

## 残件・注意

- 「追加マシン」に試験行（サンプル、接続確認など）が残っていれば手動削除してよい
- 新マシンシートの POWER MAX などが「旧案保留」だと新規リストには出ない。WEB追加のパワーマックス V3 は extra_ ID で「追加マシン」側
- clasp の認証が切れたら、シート書き込みが失敗し、マシン追加も失敗する（仕様）
