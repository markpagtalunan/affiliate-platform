import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { Config } from '../config/env.js';
import type { Affiliate, Payout } from '../types.js';

export interface MailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

export class SesMailer implements Mailer {
  private client: SESClient;
  constructor(region: string, private from: string) {
    this.client = new SESClient({ region });
  }
  async send(m: MailMessage): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: m.to },
        Message: {
          Subject: { Data: m.subject, Charset: 'UTF-8' },
          Body: { Html: { Data: m.html, Charset: 'UTF-8' }, Text: { Data: m.text, Charset: 'UTF-8' } },
        },
      }),
    );
  }
}

/** Used when SES_FROM is unset: logs recipient + subject only. */
export class LogMailer implements Mailer {
  async send(m: MailMessage): Promise<void> {
    console.log(`[email:not-sent] to=${m.to.join(',')} subject="${m.subject}"`);
  }
}

export function createMailer(config: Config): Mailer {
  return config.sesFrom ? new SesMailer(config.awsRegion, config.sesFrom) : new LogMailer();
}

export const esc = (v: unknown): string =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const peso = (n: number): string => `PHP ${n.toLocaleString('en-US')}`;

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f6;font-family:Arial,Helvetica,sans-serif;color:#1b1f2a">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:100%">
<tr><td style="background:#0E6B63;color:#fff;padding:18px 24px;font-size:18px;font-weight:bold">${esc(title)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">${bodyHtml}</td></tr>
<tr><td style="padding:14px 24px;font-size:12px;color:#7a8588;border-top:1px solid #e6eaea">LakbayHub Affiliate Program</td></tr>
</table></td></tr></table></body></html>`;
}

/** High-level notifications. Never throw; failures are logged without payload details. */
export class Notifier {
  constructor(private mailer: Mailer, private adminEmails: string[], private portalUrl: string) {}

  private fire(m: MailMessage): void {
    if (!m.to.length) return;
    this.mailer.send(m).catch((e: unknown) => console.warn('[email] send failed:', (e as Error)?.name ?? 'error'));
  }

  applicationReceived(a: Affiliate): void {
    const name = esc(a.name);
    this.fire({
      to: [a.email],
      subject: 'We received your affiliate application',
      html: layout('Application received', `<p>Hi ${name},</p><p>Thanks for applying to the LakbayHub Affiliate Program. Our team will review your application and email you once it is approved.</p>`),
      text: `Hi ${a.name},\n\nThanks for applying to the LakbayHub Affiliate Program. Our team will review your application and email you once it is approved.`,
    });
  }

  approved(a: Affiliate, code: string): void {
    this.fire({
      to: [a.email],
      subject: 'Your affiliate account is approved',
      html: layout(
        'You are approved!',
        `<p>Hi ${esc(a.name)},</p><p>Your affiliate account is now active. Your referral code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:2px;color:#0E6B63">${esc(code)}</p><p>Sign in to pick packages and start sharing your links.</p>`,
      ),
      text: `Hi ${a.name},\n\nYour affiliate account is now active. Your referral code is: ${code}\n\nSign in to pick packages and start sharing your links. ${this.portalUrl}`,
    });
  }

  payoutRequested(a: Affiliate, p: Payout): void {
    this.fire({
      to: this.adminEmails,
      subject: `Payout requested: ${peso(p.amount)} by ${a.name}`.replace(/[\r\n]/g, ' '),
      html: layout(
        'Payout requested',
        `<p><b>${esc(a.name)}</b> (${esc(a.email)}) requested a payout.</p><p>Amount: <b>${esc(peso(p.amount))}</b><br>Method: ${esc(p.method)}<br>Commissions: ${esc(p.commissionRefs.length)}</p>`,
      ),
      text: `${a.name} (${a.email}) requested a payout.\nAmount: ${peso(p.amount)}\nMethod: ${p.method}\nCommissions: ${p.commissionRefs.length}`,
    });
  }

  payoutPaid(a: Affiliate, p: Payout): void {
    this.fire({
      to: [a.email],
      subject: 'Your payout has been sent',
      html: layout('Payout sent', `<p>Hi ${esc(a.name)},</p><p>Your payout of <b>${esc(peso(p.amount))}</b> via ${esc(p.method)} has been marked as paid. Thank you for promoting with us!</p>`),
      text: `Hi ${a.name},\n\nYour payout of ${peso(p.amount)} via ${p.method} has been marked as paid. Thank you for promoting with us!`,
    });
  }
}
