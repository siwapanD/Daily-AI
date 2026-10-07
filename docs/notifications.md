# Notifications (Daily Digest to chat)

The daily job (`fetch → analyze → digest → notify`) pushes a short plain-text version of the digest to every configured channel. Each channel is independent, so one failing channel doesn't stop the others. If no channel is configured, the notify step is skipped.

You can configure everything in **Settings → Secrets** (stored encrypted) or as environment variables. Environment values take precedence.

| Channel | Variables | How to get them |
|---|---|---|
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Create a bot with [@BotFather](https://t.me/BotFather) and send it a message. Then open `https://api.telegram.org/bot<TOKEN>/getUpdates`; the chat id is `message.chat.id` (negative numbers are groups) |
| LINE | `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_TO` | Create a Messaging API channel in the [LINE Developers console](https://developers.line.biz/) and issue a long-lived channel access token. `LINE_TO` is your user id (shown under *Basic settings → Your user ID*) or a group id. LINE Notify was discontinued in 2025, so this uses the Messaging API push endpoint |
| Slack / Discord / other | `NOTIFY_WEBHOOK_URL` | A Slack incoming-webhook URL or a Discord channel webhook URL. The app POSTs JSON `{ "text": …, "content": … }` |

Message length is capped per channel: Telegram 4096 characters, LINE 5000, webhook 2000.

## Sending manually
- **Settings → Notifications → Send test message** checks every configured channel.
- **Digest → Send to chat** sends the digest you're viewing.
- API: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/notify` sends the latest digest.

## Example message
```
📰 DAILY AI — 7 October 2026

24 relevant discoveries in the last 48 hours. 1 must-learn, 2 worth testing.

🔝 Top findings
1. Claude Code v9 (https://github.com/…) — Adds planning mode…

🎓 Must learn
- MCP spec update (https://…) · Simon Willison — Changes how tools authenticate…

🔬 Experiment today: Planning-first workflow

Full digest: https://daily.example.com/digest?date=2026-10-07
```

## Troubleshooting
| Symptom | Fix |
|---|---|
| `telegram: failed (HTTP 400: chat not found)` | Send the bot a message first; check the chat id (group ids start with `-`) |
| `telegram: failed (HTTP 401)` | Wrong bot token |
| `line: failed (HTTP 400)` | `LINE_TO` must be a user/group id from the same channel, and the user must have added the bot as a friend |
| `webhook: failed (HTTP 404)` | The webhook URL was revoked; create a new one |

Error messages never include the bot token.
