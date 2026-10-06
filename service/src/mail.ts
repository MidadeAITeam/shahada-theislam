// Sign-in links, next-lesson reminders and "the team replied to you" notices. Provider by configuration: an existing SMTP server,
// Resend, Cloudflare Email Sending, or (development) the server log.
import nodemailer from "nodemailer";
import { config } from "./config.ts";

const smtp = config.smtpHost
  ? nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465, auth: { user: config.smtpUser, pass: config.smtpPass } })
  : null;

export async function sendMail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  try {
    if (smtp) {
      await smtp.sendMail({ from: config.mailFrom, to, subject, html, text });
      return true;
    }
    if (config.resendKey) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.mailFrom, to: [to], subject, html, text }),
      });
      return r.ok;
    }
    if (config.cfEmailToken && config.cfAccountId) {
      const from = config.mailFrom.match(/<(.+)>/)?.[1] ?? config.mailFrom;
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/email/sending/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.cfEmailToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, html, text }),
      });
      return r.ok;
    }
    console.log(`[mail:dev] to=${to} subject=${subject}\n${text}`);
    return true;
  } catch (e) {
    console.error("mail failed", e);
    return false;
  }
}

const T: Record<string, { signinSubject: string; signin: string; remindSubject: string; remind: string; open: string; replySubject: string; reply: string; openReply: string }> = {
  en: {
    signinSubject: "Your sign-in link — theislam.chat",
    signin: "Open this link to save your lessons and continue on any device:",
    remindSubject: "Your next lesson: {TITLE}",
    remind: "As-salamu alaykum. Your next lesson from Al-Wajeez is ready: {TITLE}. It takes a few minutes.",
    open: "Open the lesson",
    replySubject: "The Osoul team replied to you — theislam.chat",
    reply: "As-salamu alaykum. A mentor from the Osoul team has replied to your message. Open your learning space to read the reply and answer it:",
    openReply: "Read the reply",
  },
  ar: {
    signinSubject: "رابط الدخول — theislam.chat",
    signin: "افتح هذا الرابط لحفظ دروسك ومتابعتها من أي جهاز:",
    remindSubject: "درسك التالي: {TITLE}",
    remind: "السلام عليكم. درسك التالي من «الوجيز» جاهز: {TITLE}، ولا يستغرق إلا دقائق.",
    open: "افتح الدرس",
    replySubject: "ردّ عليك فريق أصول — theislam.chat",
    reply: "السلام عليكم. ردّ مرشد من فريق أصول على رسالتك. افتح مساحة التعلم لتقرأ الرد وتجيب عنه:",
    openReply: "اقرأ الرد",
  },
};
export const mailText = (lang: string) => T[lang] ?? T.en;

export function layout(lang: string, body: string, link: string, label: string) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  return `<div dir="${dir}" style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#12183F">
<p style="font-size:16px;line-height:1.6">${body}</p>
<p><a href="${link}" style="display:inline-block;background:#6150EA;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">${label}</a></p>
<p style="font-size:12px;color:#667">theislam.chat · Osoul Association</p></div>`;
}
