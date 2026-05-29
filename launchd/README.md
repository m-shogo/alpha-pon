# launchd設定（macOS自動実行）

## セットアップ

1. `.env` ファイルを作成して認証情報を設定:
   ```
   cp .env.example .env
   # JQUANTS_EMAIL / JQUANTS_PASSWORD / SLACK_WEBHOOK_URL を設定
   ```

2. plistに環境変数を直接書き込む（launchdは.envを読まないため）:
   ```
   # launchd/com.alpha-pon.daily.plist のEnvironmentVariablesに追加
   ```

3. logsディレクトリ作成:
   ```
   mkdir -p logs
   ```

4. LaunchAgentsにコピーしてロード:
   ```bash
   cp launchd/com.alpha-pon.daily.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.alpha-pon.daily.plist
   ```

5. 動作確認:
   ```bash
   launchctl start com.alpha-pon.daily
   tail -f logs/daily.log
   ```

## 停止

```bash
launchctl unload ~/Library/LaunchAgents/com.alpha-pon.daily.plist
```

## 実行時刻の変更

plistの `StartCalendarInterval` を編集後、unload → load し直す。
