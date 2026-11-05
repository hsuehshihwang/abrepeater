# AB 複讀練習器：上傳到 GitHub Pages 步驟（新手版）

完成後你會得到一個免費網址：`https://<你的帳號>.github.io/<儲存庫名稱>/`，手機和電腦都能打開使用。

## 1. 建立 GitHub 帳號
1. 打開 https://github.com ，按右上角 **Sign up**。
2. 輸入 Email、密碼、使用者名稱（username，之後會出現在網址裡，建議用英文小寫，例如 `siyuan-dad`）。
3. 完成驗證，到信箱收驗證碼並輸入。

## 2. 建立儲存庫（repository）
1. 登入後按右上角 **＋** → **New repository**。
2. **Repository name** 填 `abrepeater`（網址會用到，建議英文小寫）。
3. 選 **Public**（免費帳號的 Pages 需要公開）。
4. 勾選 **Add a README file**（這樣會自動建立 `main` 分支）。
5. 按 **Create repository**。

## 3. 上傳 index.html
1. 在儲存庫頁面按 **Add file** → **Upload files**。
2. 把 `index.html` 拖進頁面（檔名必須是 `index.html`，放在最上層，不要放在資料夾裡）。
3. 下方 **Commit changes** 直接按綠色按鈕。

## 4. 開啟 GitHub Pages
1. 在儲存庫頁面上方點 **Settings**。
2. 左側選單點 **Pages**。
3. **Build and deployment** → **Source** 選 **Deploy from a branch**。
4. **Branch** 選 **main**，資料夾選 **/ (root)**，按 **Save**。
5. 等 1～3 分鐘，重新整理此頁，上方會出現「Your site is live at …」。

## 5. 你的網址
```
https://<你的帳號>.github.io/<儲存庫名稱>/
```
例如帳號 `siyuan-dad`、儲存庫 `abrepeater` → `https://siyuan-dad.github.io/abrepeater/`

小技巧：網址後面加 `?v=影片ID` 可直接開啟 YouTube 影片，例如
`https://siyuan-dad.github.io/abrepeater/?v=dQw4w9WgXcQ`

## 6. 之後要更新
再做一次第 3 步，上傳新的 `index.html` 覆蓋即可，約 1 分鐘後生效（看不到更新就強制重新整理）。

## 使用提醒
- 段落存在「這台裝置、這個瀏覽器」的 localStorage；換手機或清除瀏覽資料會不見，請用「匯出 JSON」備份。
- 本機檔案不會上傳到任何地方，只在你的瀏覽器裡播放與分析；重開網頁後需重新選檔（段落會自動帶回）。
- YouTube 的速度只能用它提供的選項（通常 0.25、0.5、0.75、1、1.25…），部分影片作者禁止嵌入播放則無法使用。
- YouTube 無法做靜音自動分段，請用「貼上字幕」或「每 N 秒等分」。
