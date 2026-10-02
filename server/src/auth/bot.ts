import { env } from "../env.js";
import { issueLoginCode } from "./login-codes.js";

type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TelegramUpdate = { update_id: number; message?: { from?: TelegramUser; text?: string } };

export async function sendMessage(chatId: number | string, text: string) {
  if (!env.telegramBotToken) return;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!resp.ok) console.warn(`[telegram] sendMessage ${resp.status}`);
  } catch (e) {
    console.warn("[telegram] sendMessage fehlgeschlagen:", (e as Error).message);
  }
}

function nameOf(user: TelegramUser): string | null {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || null;
}

async function handleUpdate(update: TelegramUpdate) {
  const from = update.message?.from;
  const text = update.message?.text?.trim() ?? "";
  if (!from) return;

  if (text === "/start" || text.startsWith("/login") || text === "/code") {
    const code = await issueLoginCode(from.id, nameOf(from));
    await sendMessage(
      from.id,
      `🎲 ${env.appName} – Login-Code / login code:\n\n${code}\n\n` +
        `Der Code ist 5 Minuten gültig. Gib ihn auf der Website ein.\n` +
        `Valid for 5 minutes. Enter it on the website to sign in.`
    );
  } else if (text === "/id") {
    await sendMessage(from.id, `Deine Telegram-ID / your Telegram ID: ${from.id}`);
  } else {
    await sendMessage(from.id, `Sende /login, um einen Login-Code zu erhalten.\nSend /login to receive a login code.`);
  }
}

let running = false;

/**
 * Long-Polling des Telegram-Bots. Läuft nur mit gesetztem TELEGRAM_BOT_TOKEN.
 * Eingehende Nachrichten werden nicht gespeichert – nur der daraus erzeugte,
 * kurzlebige Login-Code.
 */
export function startTelegramBot() {
  if (!env.telegramBotToken) {
    console.log("[telegram] Kein TELEGRAM_BOT_TOKEN gesetzt – Bot deaktiviert.");
    return;
  }
  if (running) return;
  running = true;
  let offset = 0;

  const poll = async () => {
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${env.telegramBotToken}/getUpdates?offset=${offset}&timeout=25&allowed_updates=%5B%22message%22%5D`
      );
      if (resp.ok) {
        const data = (await resp.json()) as { result?: TelegramUpdate[] };
        for (const update of data.result ?? []) {
          offset = update.update_id + 1;
          await handleUpdate(update).catch(e => console.warn("[telegram] Update-Fehler:", e));
        }
      } else {
        console.warn(`[telegram] getUpdates ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
        await new Promise(r => setTimeout(r, 10_000));
      }
    } catch (e) {
      console.warn("[telegram] Polling-Fehler:", (e as Error).message);
      await new Promise(r => setTimeout(r, 10_000));
    }
    setTimeout(poll, 0);
  };
  void poll();
  console.log(`[telegram] Bot-Polling gestartet (@${env.telegramBotUsername || "?"})`);
}
