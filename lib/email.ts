// Transactional email for auth (verification + password reset).
//
// The web-VPS that runs this Next app CANNOT egress SMTP — its host blocks ports
// 25/465/587 (anti-spam). So instead of talking to Beget directly (nodemailer
// just hung), we POST the rendered email to a small secret-gated relay on the
// LeadSeek box (kino-api `/api/send-mail`), which CAN reach smtp.beget.com:465
// and sends it as noreply@sapkeflykino.ru.
//   MAIL_RELAY_URL  e.g. https://kino.lead-seek.ru/hdrezka/api/send-mail
//   MAIL_SECRET     shared secret, must match the relay's .mailenv
// Deliverability (not spam) relies on the DOMAIN having SPF + DKIM + DMARC.
// sapkeflykino.ru is on Beget (SPF set); enable DKIM in the Beget panel + add a
// DMARC record for best inbox placement.

const RELAY_URL = process.env.MAIL_RELAY_URL || "";
const RELAY_SECRET = process.env.MAIL_SECRET || "";

export function isEmailConfigured(): boolean {
  return !!(RELAY_URL && RELAY_SECRET);
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sapkeflykino.ru";

function codeEmail(code: string, purpose: "verify" | "reset") {
  const title =
    purpose === "verify" ? "Подтвердите свой email" : "Восстановление пароля";
  const intro =
    purpose === "verify"
      ? "Спасибо за регистрацию! Чтобы завершить создание аккаунта, введите код ниже:"
      : "Вы запросили смену пароля. Введите код ниже, чтобы задать новый пароль:";
  const subject =
    purpose === "verify"
      ? `Код подтверждения: ${code} — sapkeflykino`
      : `Код для смены пароля: ${code} — sapkeflykino`;

  const text = `${title}\n\n${intro}\n\n${code}\n\nКод действует 15 минут. Если вы это не запрашивали — просто проигнорируйте письмо.\n\nsapkeflykino`;

  // Cinematic dark theme, green (#a3e635) accent, code as flip-card digits,
  // cinema-hall hero. Email-safe: tables + inline styles, hosted hero image.
  const digits = code
    .split("")
    .map(
      (d) =>
        `<td style="padding:0 4px;"><div style="width:42px;height:54px;line-height:54px;background:#050506;border:1px solid #26262b;border-radius:10px;color:#ffffff;font-size:25px;font-weight:800;text-align:center;font-family:'Courier New',monospace;box-shadow:inset 0 -8px 16px #00000066;">${d}</div></td>`
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0a0a0b;border:1px solid #ffffff10;border-radius:18px;overflow:hidden;">
        <!-- logo (transparent png) -->
        <tr><td align="center" style="padding:30px 28px 4px;">
          <img src="${SITE_URL}/email-logo.png" width="230" alt="SAPKEFLY KINO" style="display:block;width:230px;max-width:70%;height:auto;border:0;margin:0 auto;" />
        </td></tr>
        <!-- title + intro -->
        <tr><td align="center" style="padding:16px 34px 0;">
          <div style="font-size:23px;font-weight:800;color:#ffffff;line-height:1.25;">${title}</div>
          <p style="font-size:13.5px;line-height:1.6;color:#9a9aa0;margin:12px 0 22px;">${intro}</p>
        </td></tr>
        <!-- code digits -->
        <tr><td align="center" style="padding:0 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
        </td></tr>
        <tr><td align="center" style="padding:16px 20px 6px;">
          <span style="font-size:12.5px;color:#8a8a90;"><span style="color:#a3e635;">&#9679;</span>&nbsp; Код действует 15 минут</span>
        </td></tr>
        <!-- cinematic hero (fades into the bg) -->
        <tr><td style="padding:6px 0 0;">
          <img src="${SITE_URL}/email-cinema.jpg" width="480" alt="" style="display:block;width:100%;max-width:480px;height:auto;border:0;" />
        </td></tr>
        <!-- security note: green accent bar, no icon -->
        <tr><td style="padding:6px 26px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111113;border-radius:12px;">
            <tr>
              <td style="width:3px;background:#a3e635;"></td>
              <td style="padding:15px 18px;">
                <div style="font-size:13.5px;font-weight:700;color:#ededf0;">Безопасность прежде всего</div>
                <div style="font-size:12px;line-height:1.55;color:#86868c;margin-top:4px;">Если вы не создавали аккаунт на SAPKEFLY KINO, просто проигнорируйте это письмо — ваши данные в безопасности.</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:16px 28px 28px;">
          <div style="font-size:11px;color:#55555b;">© 2026 SAPKEFLY KINO · смотреть онлайн без рекламы</div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  return { subject, text, html };
}

/** Send a verification / reset code via the LeadSeek relay. Returns true if the
 *  relay accepted it, false if not configured / it failed (caller decides how to
 *  surface the code — e.g. AUTH_DEV_CODES shows it on screen as a fallback). */
export async function sendCode(
  to: string,
  code: string,
  purpose: "verify" | "reset"
): Promise<boolean> {
  const { subject, text, html } = codeEmail(code, purpose);
  if (!isEmailConfigured()) {
    console.log(`[email:NOT-CONFIGURED] would send ${purpose} code ${code} to ${to}`);
    return false;
  }
  try {
    const r = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, text, html, secret: RELAY_SECRET }),
      signal: AbortSignal.timeout(25_000),
    });
    const data = await r.json().catch(() => ({}));
    if (data?.ok) return true;
    console.error(`[email:RELAY-FAIL] ${purpose} to ${to}:`, data?.error || r.status);
    return false;
  } catch (e: any) {
    console.error(`[email:RELAY-ERR] ${purpose} to ${to}:`, e?.message || e);
    return false;
  }
}
