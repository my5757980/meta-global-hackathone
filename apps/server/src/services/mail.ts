import nodemailer from "nodemailer";
import { env } from "../env";

/** Optional: set SMTP_URL (smtp://user:pass@host:587) and the customer's reset link goes by e-mail. */
export const mailConfigured = () => Boolean(env.SMTP_URL);

export async function sendMail(m: { to: string; subject: string; text: string }) {
  if (!env.SMTP_URL) return false;
  await nodemailer.createTransport(env.SMTP_URL).sendMail({ from: env.MAIL_FROM, ...m });
  return true;
}
