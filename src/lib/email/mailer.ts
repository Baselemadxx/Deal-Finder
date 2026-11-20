import nodemailer from 'nodemailer';
import { logger } from '../logger';

export interface EmailMessage {
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const provider = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
  const to = process.env.ALERT_EMAIL_TO;
  const from =
    process.env.ALERT_EMAIL_FROM ||
    process.env.GMAIL_USER ||
    'Distress Deal Finder <alerts@distress-deal-finder.local>';

  if (process.env.DRY_RUN === 'true' || provider === 'console') {
    logger.info('Email (console/dry-run preview)', {
      source: 'mailer',
      to: to ?? 'unset',
      subject: msg.subject,
    });
    console.log('\n================ EMAIL PREVIEW ================');
    console.log(`TO:      ${to ?? '(ALERT_EMAIL_TO not set)'}`);
    console.log(`FROM:    ${from}`);
    console.log(`SUBJECT: ${msg.subject}`);
    console.log('-----------------------------------------------');
    console.log(msg.text);
    console.log('===============================================\n');
    return;
  }

  if (!to) {
    throw new Error('ALERT_EMAIL_TO environment variable is required to send emails');
  }

  if (provider === 'gmail') {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD are required when EMAIL_PROVIDER=gmail');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    logger.info('Email sent via Gmail SMTP', { source: 'mailer', to, subject: msg.subject });
    return;
  }

  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Resend API error ${res.status}: ${errBody}`);
    }
    logger.info('Email sent via Resend', { source: 'mailer', to, subject: msg.subject });
    return;
  }

  throw new Error(`Unsupported EMAIL_PROVIDER: "${provider}". Use gmail, resend, or console.`);
}
