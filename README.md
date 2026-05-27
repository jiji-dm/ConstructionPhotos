# 工事写真まとめ（スマホPWA）

現場ごとに工事写真を撮り、場所（グループ）単位で管理するスマホ向けWebアプリ（PWA）です。
撮影すると `状態_場所名_機器名_連番.jpg` で自動命名され、ファイルを開かなくても名前で判別できます。
現場ごとに ZIP（`現場名/場所名/写真.jpg` のフォルダ構造）で書き出せます。

## 構成

ビルド不要・依存ゼロ。静的ファイルをそのまま配置すれば動きます。

```
index.html          画面の入れ物
app.js              画面・ルーティング・カメラ・書き出し
db.js               データ保存（IndexedDB）
zip.js              ZIP生成（無圧縮・日本語名対応）
styles.css          スタイル
manifest.webmanifest / sw.js   PWA設定・オフライン対応
icons/              アプリアイコン
```

データはスマホ（ブラウザ）内の IndexedDB に保存されます。サーバーには何も送りません。

## 使い方

1. **現場**を作る（例：〇〇ホテル）
2. 現場の中に**場所**を追加（候補から選ぶ or 新規入力 → カテゴリとして再利用される）
3. 場所の中で **📷撮影** → 状態・機器を選んでシャッター。連続で撮れる
4. サムネをタップで拡大・左右スワイプ閲覧・削除
5. 現場画面の **⬇ZIP書き出し** で `現場名.zip` を保存
6. 状態・機器・場所カテゴリは右上の ⚙ 設定 で追加・編集

## ローカルで動作確認（PC）

`file://` では動かないため、簡易サーバーで開きます。

```sh
cd ConstructionPhotos
python3 -m http.server 8000
```

ブラウザで <http://localhost:8000> を開く。
※ `localhost` はカメラが使えますが、`http://192.168.x.x` のようなIPアドレスではカメラは起動しません（ブラウザの仕様）。

## GitHub Pages で公開（スマホで使う）

スマホのアプリ内カメラには **https** が必要です。GitHub Pages なら無料でhttps配信できます。

1. GitHub で新しいリポジトリを作成（例：`construction-photos`）
2. このフォルダの中身をすべて push
   ```sh
   cd ConstructionPhotos
   git init
   git add .
   git commit -m "工事写真まとめ PWA"
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/construction-photos.git
   git push -u origin main
   ```
3. GitHub のリポジトリ → **Settings → Pages** → Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にして保存
4. 数分後に `https://<ユーザー名>.github.io/construction-photos/` で開けます
5. スマホでそのURLを開き、ブラウザの「ホーム画面に追加」でアプリのように使えます
   - iPhone：Safariで開く →共有→「ホーム画面に追加」
   - Android：Chromeで開く →メニュー→「アプリをインストール / ホーム画面に追加」

相対パスで作ってあるので、サブパス（`/construction-photos/`）でもそのまま動きます。

## 注意

- 写真は端末内に保存されます。機種変更・ブラウザのデータ削除で消えるため、こまめに ZIP 書き出しでバックアップしてください。
- ZIP は無圧縮（JPEGは元々圧縮済みのため）です。
