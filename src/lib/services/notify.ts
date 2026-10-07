import type { DailyDigest } from "../db/schema";
import { getSecret } from "./settings";
import { env } from "../env";
import { logger, errMsg } from "../logger";
import { truncate } from "../pipeline/normalize";

/**
 * Push the daily digest to chat apps. Channels are enabled by configuring their secrets
 * (env or Settings → Secrets). Each channel is isolated: one failing never blocks the others.
 *  - Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (Bot API sendMessage)
 *  - LINE:     LINE_CHANNEL_ACCESS_TOKEN + LINE_TO (Messaging API push; user, group or room id)
 *  - Webhook:  NOTIFY_WEBHOOK_URL (POST JSON with `text` and `content`: works for Slack and Discord incoming webhooks)
 */
export type Channel = "telegram" | "line" | "webhook";

export interface ChannelResult {
  channel: Channel;
  ok: boolean;
  error?: string;
}

const LIMITS: Record<Channel, number> = { telegram: 4096, line: 5000, webhook: 2000 };

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Plain-text summary of a digest (no markup, so no per-app escaping is needed). */
export function digestToText(d: Pick<DailyDigest, "title" | "contentMd" | "digestDate">, appUrl = env.appUrl): string {
  const md = d.contentMd;
  const section = (name: string, max: number) => {
    const m = md.match(new RegExp(`## ${name}\\n\\n([\\s\\S]*?)(?=\\n## |$)`));
    if (!m || /_Nothing today\._|_None\._/.test(m[1])) return [];
    return m[1].trim().split("\n").filter((l) => /^(\d+\.|-) /.test(l)).slice(0, max);
  };
  const plain = (line: string) =>
    line
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/\*\*/g, "")
      .replace(/ · score \d+/g, "");
  const intro = md.split("\n").slice(2).find((l) => l.trim() && !l.startsWith("#")) ?? "";
  const exp = md.match(/## Recommended Experiment Today\n\n\*\*(.+?)\*\*/)?.[1];
  const parts = [
    `📰 ${d.title}`,
    intro,
    ...[["🔝 Top findings", section("Top Findings", 3)], ["🎓 Must learn", section("Must Learn", 3)], ["🧪 Worth testing", section("Worth Testing", 3)]]
      .filter(([, lines]) => lines.length)
      .map(([h, lines]) => `${h}\n${(lines as string[]).map((l) => truncate(plain(l), 300)).join("\n")}`),
    exp ? `🔬 Experiment today: ${exp}` : "",
    `Full digest: ${appUrl.replace(/\/$/, "")}/digest?date=${d.digestDate}`,
  ];
  return parts.filter(Boolean).join("\n\n");
}

async function configured() {
  const [tgToken, tgChat, lineToken, lineTo, webhook] = await Promise.all([
    getSecret("TELEGRAM_BOT_TOKEN"), getSecret("TELEGRAM_CHAT_ID"),
    getSecret("LINE_CHANNEL_ACCESS_TOKEN"), getSecret("LINE_TO"), getSecret("NOTIFY_WEBHOOK_URL"),
  ]);
  return { tgToken, tgChat, lineToken, lineTo, webhook };
}

/** Which channels are fully configured (safe for the UI: no secret values). */
export async function notificationChannels(): Promise<Record<Channel, boolean>> {
  const c = await configured();
  return { telegram: !!(c.tgToken && c.tgChat), line: !!(c.lineToken && c.lineTo), webhook: !!c.webhook };
}

/** Send a text message to every configured channel. */
export async function sendNotification(text: string): Promise<ChannelResult[]> {
  const c = await configured();
  const jobs: [Channel, (t: string) => Promise<void>][] = [];
  if (c.tgToken && c.tgChat) {
    jobs.push(["telegram", (t) => post(`https://api.telegram.org/bot${c.tgToken}/sendMessage`, {
      chat_id: c.tgChat, text: t, disable_web_page_preview: true,
    })]);
  }
  if (c.lineToken && c.lineTo) {
    jobs.push(["line", (t) => post("https://api.line.me/v2/bot/message/push", {
      to: c.lineTo, messages: [{ type: "text", text: t }],
    }, { authorization: `Bearer ${c.lineToken}` })]);
  }
  if (c.webhook) {
    if (!/^https?:\/\//.test(c.webhook)) throw new Error("NOTIFY_WEBHOOK_URL must be an http(s) URL");
    jobs.push(["webhook", (t) => post(c.webhook, { text: t, content: t })]);
  }
  return Promise.all(
    jobs.map(async ([channel, send]) => {
      try {
        await send(truncate(text, LIMITS[channel]));
        return { channel, ok: true };
      } catch (e) {
        // Never log the URL: it may embed the bot token or webhook secret.
        logger.warn("notification failed", { channel, error: errMsg(e).replace(/bot\d+:[\w-]+/g, "bot***") });
        return { channel, ok: false, error: errMsg(e).replace(/bot\d+:[\w-]+/g, "bot***").slice(0, 300) };
      }
    }),
  );
}

export async function notifyDigest(d: DailyDigest): Promise<ChannelResult[]> {
  return sendNotification(digestToText(d));
}
