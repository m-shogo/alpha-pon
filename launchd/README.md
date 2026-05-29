# launchd設定（macOS自動実行）

## セットアップ

1. `.env` ファイルを作成して認証情報を設定:
   ```bash
   cp .env.example .env
   # JQUANTS_EMAIL / JQUANTS_PASSWORD / LINE_CHANNEL_TOKEN / LINE_USER_ID を設定
   ```

   `launchd` 自体は `.env` を直接読みません。  
   このリポジトリでは `scripts/run-daily.sh` が `.env` を読み込んでから `src/daily.ts` を実行します。

2. logsディレクトリ作成:
   ```bash
   mkdir -p logs
   ```

3. LaunchAgentsにコピーしてロード:
   ```bash
   cp launchd/com.alpha-pon.daily.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.alpha-pon.daily.plist
   ```

4. 動作確認:
   ```bash
   launchctl start com.alpha-pon.daily
   tail -f logs/daily.log
   tail -f logs/daily-error.log
   ```

## 停止

```bash
launchctl unload ~/Library/LaunchAgents/com.alpha-pon.daily.plist
```

## 再読み込み

plistや実行時刻を変更した場合は、unload → load し直します。

```bash
launchctl unload ~/Library/LaunchAgents/com.alpha-pon.daily.plist
launchctl load ~/Library/LaunchAgents/com.alpha-pon.daily.plist
```

## 実行時刻の変更

`launchd/com.alpha-pon.daily.plist` の `StartCalendarInterval` を編集します。  
初期設定では毎朝 7:30 に実行します。
