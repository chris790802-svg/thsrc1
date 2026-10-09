# 高鐵列車即時位置

## 部署（公開 repo 也安全）
1. 建立 GitHub repo，上傳本資料夾所有檔案（含隱藏的 `.github`）。
2. Settings → Secrets and variables → Actions → **Secrets** 新增 `TDX_CLIENT_ID`、`TDX_CLIENT_SECRET`（金鑰只存在這裡，不會出現在程式碼或網頁）。
3. （選用）Variables 新增 `FREE_SEAT_PATH`：TDX swagger 自由座 API 的 Request URL 中 `/api/basic/` 之後的路徑，前面補上 `/api/basic/`。
4. Settings → Pages → Source 選 **GitHub Actions**。
5. Actions 分頁手動執行一次 `Update THSR data and deploy`，之後每 10 分鐘自動更新。

## 注意
- 公開 repo 若 60 天沒有任何活動，GitHub 會自動停用排程，需到 Actions 手動重新啟用。
- 在 Actions 執行紀錄裡可看到「自由座原始資料範例」，欄位對不上時以它為準修改 `scripts/fetch-tdx.mjs` 的 `parseCars`。
- 本機直接開 `index.html` 讀不到 `data/`，會顯示示範資料。
