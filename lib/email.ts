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

function codeEmail(code: string, purpose: "verify" | "reset") {
  const title =
    purpose === "verify" ? "Подтверждение почты" : "Восстановление пароля";
  const intro =
    purpose === "verify"
      ? "Спасибо за регистрацию в sapkeflykino! Введите этот код, чтобы подтвердить почту:"
      : "Вы запросили смену пароля. Введите этот код, чтобы задать новый пароль:";
  const subject =
    purpose === "verify"
      ? `Код подтверждения: ${code} — sapkeflykino`
      : `Код для смены пароля: ${code} — sapkeflykino`;

  const text = `${title}\n\n${intro}\n\n${code}\n\nКод действует 15 минут. Если вы это не запрашивали — просто проигнорируйте письмо.\n\nsapkeflykino`;

  const html = `<!doctype html><html><body style="margin:0;background:#0b0b0c;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:440px;background:#141416;border:1px solid #ffffff14;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;">
          <div style="font-size:20px;font-weight:800;color:#a3e635;letter-spacing:.3px;">sapkeflykino</div>
        </td></tr>
        <tr><td style="padding:8px 28px 0;">
          <div style="font-size:17px;font-weight:700;color:#fff;">${title}</div>
          <p style="font-size:14px;line-height:1.55;color:#b8b8bd;margin:10px 0 18px;">${intro}</p>
          <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#fff;background:#0b0b0c;border:1px solid #ffffff1a;border-radius:12px;padding:16px 0;text-align:center;">${code}</div>
          <p style="font-size:12.5px;line-height:1.5;color:#7c7c83;margin:18px 0 4px;">Код действует 15 минут. Если вы это не запрашивали — просто проигнорируйте письмо.</p>
        </td></tr>
        <tr><td style="padding:18px 28px 26px;">
          <div style="border-top:1px solid #ffffff10;padding-top:14px;font-size:11.5px;color:#5e5e64;">© sapkeflykino · онлайн-кинотеатр</div>
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
