import "server-only";
import fs from "fs";
import path from "path";

// Уведомления админам в Telegram (новая оплата / проблема с оплатой). Конфиг в
// файле рядом с users.json: notify.json = {botToken, chatIds:[...]}. Токен НЕ в
// git/бандле.
const CFG = path.join(process.cwd(), "notify.json");

function cfg(): { botToken?: string; chatIds?: number[] } | null {
  try {
    return JSON.parse(fs.readFileSync(CFG, "utf-8"));
  } catch {
    return null;
  }
}

export async function notifyAdmins(text: string): Promise<void> {
  const c = cfg();
  if (!c?.botToken || !Array.isArray(c.chatIds) || !c.chatIds.length) return;
  await Promise.all(
    c.chatIds.map((id) =>
      fetch(`https://api.telegram.org/bot${c.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id, text, parse_mode: "HTML", disable_web_page_preview: true }),
      }).catch(() => {})
    )
  );
}
