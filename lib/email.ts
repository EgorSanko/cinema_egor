import nodemailer from "nodemailer";

// Transactional email for auth (verification + password reset).
// Configured entirely via env so creds never live in the repo:
//   SMTP_HOST   e.g. smtp.beget.com
//   SMTP_PORT   465
//   SMTP_SECURE "true" for 465 (SSL), "false" for 587 (STARTTLS)
//   SMTP_USER   e.g. noreply@sapkeflykino.ru
//   SMTP_PASS   mailbox password
//   MAIL_FROM   e.g. "sapkeflykino <noreply@sapkeflykino.ru>"
// Deliverability (not spam) relies on the sending DOMAIN having SPF + DKIM +
// DMARC. sapkeflykino.ru is on Beget (SPF already set); enable DKIM in the
// Beget panel and add a DMARC record — see the setup notes shipped with this.

const HOST = process.env.SMTP_HOST || "";
const PORT = parseInt(process.env.SMTP_PORT || "465", 10);
const SECURE = (process.env.SMTP_SECURE ?? "true") === "true";
const USER = process.env.SMTP_USER || "";
const PASS = process.env.SMTP_PASS || "";
const FROM = process.env.MAIL_FROM || "sapkeflykino <noreply@sapkeflykino.ru>";

let _transport: nodemailer.Transporter | null = null;
function transport(): nodemailer.Transporter | null {
  if (!HOST || !USER || !PASS) return null; // not configured → caller logs instead
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,
      auth: { user: USER, pass: PASS },
    });
  }
  return _transport;
}

export function isEmailConfigured(): boolean {
  return !!(HOST && USER && PASS);
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
        `<td style="padding:0 4px;"><div style="width:40px;height:52px;line-height:52px;background:#0b0b0c;border:1px solid #2c2c30;border-radius:9px;color:#ffffff;font-size:24px;font-weight:800;text-align:center;font-family:'Courier New',monospace;box-shadow:inset 0 -8px 16px #00000055;">${d}</div></td>`
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#080809;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080809;padding:28px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#121214;border:1px solid #ffffff12;border-radius:18px;overflow:hidden;">
        <!-- logo -->
        <tr><td align="center" style="padding:26px 28px 6px;">
          <div style="font-size:22px;line-height:1;">🎬</div>
          <div style="margin-top:6px;font-size:15px;font-weight:800;letter-spacing:3px;color:#a3e635;">SAPKEFLY<span style="color:#ffffff;"> KINO</span></div>
        </td></tr>
        <!-- title + intro -->
        <tr><td align="center" style="padding:14px 30px 0;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;line-height:1.25;">${title}</div>
          <p style="font-size:13.5px;line-height:1.55;color:#9b9ba1;margin:12px 0 20px;">${intro}</p>
        </td></tr>
        <!-- code digits -->
        <tr><td align="center" style="padding:0 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
        </td></tr>
        <tr><td align="center" style="padding:14px 20px 4px;">
          <span style="font-size:12.5px;color:#7c7c83;">⏱ Код действует 15 минут</span>
        </td></tr>
        <!-- hero -->
        <tr><td style="padding:22px 0 0;">
          <img src="${SITE_URL}/email-cinema.jpg" width="460" alt="" style="display:block;width:100%;max-width:460px;height:auto;border:0;" />
        </td></tr>
        <!-- security footer -->
        <tr><td style="padding:18px 28px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c;border:1px solid #ffffff10;border-radius:12px;">
            <tr>
              <td style="padding:14px 16px;vertical-align:top;width:34px;"><div style="font-size:18px;">🛡️</div></td>
              <td style="padding:14px 14px 14px 0;">
                <div style="font-size:13px;font-weight:700;color:#e6e6ea;">Безопасность прежде всего</div>
                <div style="font-size:12px;line-height:1.5;color:#85858c;margin-top:3px;">Если вы не создавали аккаунт на SAPKEFLY KINO, просто проигнорируйте это письмо. Ваши данные в безопасности.</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:14px 28px 26px;">
          <div style="font-size:11px;color:#55555b;">© 2026 sapkeflykino · смотреть онлайн без рекламы</div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  return { subject, text, html };
}

/** Send a verification / reset code. Returns true if actually emailed,
 *  false if SMTP isn't configured (caller decides how to surface the code). */
export async function sendCode(
  to: string,
  code: string,
  purpose: "verify" | "reset"
): Promise<boolean> {
  const t = transport();
  const { subject, text, html } = codeEmail(code, purpose);
  if (!t) {
    console.log(`[email:NOT-CONFIGURED] would send ${purpose} code ${code} to ${to}`);
    return false;
  }
  await t.sendMail({ from: FROM, to, subject, text, html });
  return true;
}
