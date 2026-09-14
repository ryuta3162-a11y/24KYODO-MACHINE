# Apps Script（clasp）

経堂アイデアプールの「既存マシン」を JSON で返す Web App。
WEB追加マシンは `?op=upsert-extra-machine` で「追加マシン」へ upsert。セル再読込で確認してから成功を返す。図面側はシート成功後にだけ反映する。

## 操作（このPCでログイン済みの clasp）

```powershell
cd C:\Users\r-kus\Github\24KYODO-MACHINE
clasp push
clasp version "メモ"
clasp deploy -i AKfycbw7L7epmdDMcrY2PooWjq3EUAkELSHMC6vj93-xLLZ_7RGJxOysAxlBxRyt9uCErxfO -d "更新メモ"
```

新規デプロイURLが欲しいときだけ `clasp deploy -d "..."`（IDが変わる）。

## URL

https://script.google.com/macros/s/AKfycbw7L7epmdDMcrY2PooWjq3EUAkELSHMC6vj93-xLLZ_7RGJxOysAxlBxRyt9uCErxfO/exec

## スクリプト編集

https://script.google.com/d/1tGVgPsLYLPnllQqWRLX_jpgMlwDTplvC0-yyfL7k83BAB3_0cUWNYvh2/edit

配置Web本体のデプロイはこれまで通り `vercel --prod`（マシン一覧は `/api/machines` がスプシCSVも参照）。
