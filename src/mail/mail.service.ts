import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { buildOtpEmail, OtpEmailOptions } from './templates/otp-email.template';

/**
 * Gửi email (mã OTP, lời mời, kết quả duyệt tài khoản) qua Resend, HTTPS Webhook hoặc SMTP.
 * - EMAIL_PROVIDER=webhook => gửi qua HTTPS Webhook (vd Google Apps Script Gmail Bridge — miễn phí, chạy mượt trên Render Free).
 * - EMAIL_PROVIDER=resend  => gửi qua Resend HTTP API (cần RESEND_API_KEY); nếu có thêm MAIL_WEBHOOK_URL thì tự động fallback sang webhook khi Resend lỗi / 429 hết quota 100 mail/ngày.
 * - EMAIL_PROVIDER=smtp    => gửi qua SMTP (Gmail, Mailpit, v.v.).
 * - EMAIL_PROVIDER=mock    hoặc chưa cấu hình credentials => chỉ in log (tiện dev/test).
 * Lỗi gửi mail KHÔNG làm hỏng request: ghi log, người dùng có thể bấm "Resend".
 */
const MAIL_TIMEOUT_MS = 10_000;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly provider: 'webhook' | 'resend' | 'smtp' | 'mock';
  private readonly webhookUrl: string | null = null;
  private readonly webhookSecret: string = '';
  private readonly resend: Resend | null = null;
  private readonly transporter: nodemailer.Transporter | null = null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const provider = (config.get<string>('EMAIL_PROVIDER') || 'mock').toLowerCase();
    const webhookUrl = (config.get<string>('MAIL_WEBHOOK_URL') || '').trim();
    const webhookSecret = (config.get<string>('MAIL_WEBHOOK_SECRET') || '').trim();
    const resendApiKey = (config.get<string>('RESEND_API_KEY') || '').trim();
    const smtpUser = (config.get<string>('SMTP_USER') || '').trim();

    if (webhookUrl) {
      this.webhookUrl = webhookUrl;
      this.webhookSecret = webhookSecret;
    }

    if (provider === 'webhook') {
      if (!webhookUrl) {
        this.logger.warn(
          'EMAIL_PROVIDER=webhook nhưng MAIL_WEBHOOK_URL đang trống. Chuyển sang chế độ MOCK (in log).',
        );
        this.provider = 'mock';
      } else {
        this.provider = 'webhook';
      }
    } else if (provider === 'resend') {
      if (!resendApiKey) {
        if (webhookUrl) {
          this.logger.warn(
            'EMAIL_PROVIDER=resend nhưng RESEND_API_KEY đang trống. Chuyển sang WEBHOOK dự phòng.',
          );
          this.provider = 'webhook';
        } else {
          this.logger.warn(
            'EMAIL_PROVIDER=resend nhưng RESEND_API_KEY đang trống. Chuyển sang chế độ MOCK (in log).',
          );
          this.provider = 'mock';
        }
      } else {
        this.provider = 'resend';
        this.resend = new Resend(resendApiKey);
      }
    } else if (provider === 'smtp') {
      const mailHost = config.get<string>('MAIL_HOST') || config.get<string>('SMTP_HOST') || '';
      const mailPort = Number(
        config.get<string>('MAIL_PORT') || config.get<string>('SMTP_PORT') || 587,
      );
      if (smtpUser) {
        this.provider = 'smtp';
        this.transporter = nodemailer.createTransport({
          host: mailHost,
          port: mailPort,
          connectionTimeout: MAIL_TIMEOUT_MS,
          greetingTimeout: MAIL_TIMEOUT_MS,
          socketTimeout: 20000,
          auth: { user: smtpUser, pass: config.get<string>('SMTP_PASS') || '' },
        });
      } else if (mailHost) {
        // Mailpit / SMTP nội bộ không xác thực (NOTE.md §6.1): có host, không user/pass.
        this.provider = 'smtp';
        this.transporter = nodemailer.createTransport({
          host: mailHost,
          port: mailPort,
          connectionTimeout: MAIL_TIMEOUT_MS,
          greetingTimeout: MAIL_TIMEOUT_MS,
          socketTimeout: 20000,
          secure: false,
        });
      } else {
        this.logger.warn(
          'EMAIL_PROVIDER=smtp nhưng SMTP_USER và MAIL_HOST đang trống. Chuyển sang chế độ MOCK (in log).',
        );
        this.provider = 'mock';
      }
    } else {
      this.provider = 'mock';
    }

    const defaultFrom =
      this.provider === 'resend'
        ? 'TMEC System <noreply@tmec.site>'
        : smtpUser || 'TMEC System <noreply@tmec.site>';

    this.from = config.get<string>('EMAIL_FROM') || defaultFrom;

    if (this.provider === 'mock') {
      this.logger.warn(
        'Email is NOT sent (EMAIL_PROVIDER=mock or credentials empty): OTP codes are printed to this log. See .env.example.',
      );
    } else {
      this.logger.log(
        `MailService initialized with provider: ${this.provider.toUpperCase()} (From: ${this.from}${this.provider === 'resend' && this.webhookUrl ? ', fallback: WEBHOOK' : ''})`,
      );
    }
  }

  private parseSender(from: string): { name: string; email: string } {
    const match = from.match(/^\s*(?:"?([^"<]+?)"?\s*)?<([^>]+)>\s*$/);
    if (match) {
      return {
        name: (match[1] || 'TMEC System').trim(),
        email: match[2].trim(),
      };
    }
    return { name: 'TMEC System', email: from.trim() };
  }

  private async sendViaWebhook(
    to: string,
    subject: string,
    text: string,
    renderedHtml: string,
  ): Promise<boolean> {
    if (!this.webhookUrl) return false;
    try {
      const sender = this.parseSender(this.from);
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        redirect: 'follow',
        body: JSON.stringify({
          secret: this.webhookSecret,
          senderName: sender.name,
          to,
          subject,
          text,
          html: renderedHtml,
        }),
        signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
      });
      const raw = await res.text().catch(() => '');
      let parsed: { ok?: boolean; error?: string } | null = null;
      try {
        parsed = JSON.parse(raw) as { ok?: boolean; error?: string };
      } catch {
        parsed = null;
      }
      if (!res.ok || (parsed && parsed.ok === false)) {
        this.logger.error(
          `[mail:webhook] HTTP ${res.status} sending "${subject}" to ${to}: ${parsed?.error || raw.slice(0, 200)}`,
        );
        return false;
      }
      this.logger.log(`[mail:webhook] sent to ${to} | ${subject.replace(/\d{6}/, '******')}`);
      return true;
    } catch (err) {
      this.logger.error(`[mail:webhook] failed to send "${subject}" to ${to}: ${String(err)}`);
      return false;
    }
  }

  /**
   * Gửi OTP với cấu trúc chuẩn hoá để kích hoạt tính năng thông minh của Gmail (nút "Sao chép mã" native).
   */
  async sendOtp(to: string, options: OtpEmailOptions): Promise<void> {
    const { subject, text, html } = buildOtpEmail(options);
    await this.send(to, subject, text, html);
  }

  /**
   * Gửi mail nghiệp vụ (nhắc nợ, cảnh báo, chứng từ). Trả boolean để người gọi
   * ghi nhận trạng thái "SMTP accept" (không đồng nghĩa thư đã vào inbox):
   * - true: provider thật (webhook/resend/smtp) đã chấp nhận thư.
   * - false: chế độ mock (chỉ in log) hoặc lỗi gửi.
   * Không bao giờ throw — lỗi được ghi log, giao dịch chính không bị ảnh hưởng.
   */
  async sendBusiness(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    if (this.provider === 'mock') {
      this.logger.log(`[mail:console] to=${to} | ${subject}\n${text}`);
      return false;
    }

    const renderedHtml = html || this.wrapDefaultHtml(subject, text);

    if (this.provider === 'webhook') {
      return this.sendViaWebhook(to, subject, text, renderedHtml);
    }

    if (this.provider === 'resend' && this.resend) {
      try {
        const { data, error } = await this.resend.emails.send({
          from: this.from,
          to,
          subject,
          text,
          html: renderedHtml,
        });
        if (!error) {
          this.logger.log(
            `[mail:resend] sent to ${to} (id: ${data?.id}) | ${subject.replace(/\d{6}/, '******')}`,
          );
          return true;
        }
        this.logger.error(`[mail:resend] error sending "${subject}" to ${to}: ${error.message}`);
      } catch (err) {
        this.logger.error(`[mail:resend] failed to send "${subject}" to ${to}: ${String(err)}`);
      }
      if (this.webhookUrl) {
        this.logger.warn(`[mail:fallback] Resend failed -> falling back to WEBHOOK for ${to}`);
        return this.sendViaWebhook(to, subject, text, renderedHtml);
      }
      return false;
    }

    if (this.provider === 'smtp' && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.from,
          to,
          subject,
          text,
          html: renderedHtml,
        });
        this.logger.log(`[mail:smtp] sent to ${to} | ${subject.replace(/\d{6}/, '******')}`);
        return true;
      } catch (err) {
        this.logger.error(`[mail:smtp] failed to send "${subject}" to ${to}: ${String(err)}`);
        return false;
      }
    }

    return false;
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    await this.sendBusiness(to, subject, text, html);
  }

  private wrapDefaultHtml(subject: string, text: string): string {
    const formattedBody = text
      .split('\n\n')
      .map(
        (p) =>
          `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #cbd5e1;">${p.replace(/\n/g, '<br/>')}</p>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #0a161c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="520" style="max-width: 520px; width: 100%; background-color: #13262d; border-radius: 12px; border: 1px solid #1e3a45; overflow: hidden;">
          <tr>
            <td height="4" style="background-color: #f4b942; font-size: 1px; line-height: 1px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding: 32px; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
              <div style="margin-bottom: 24px;">
                <span style="font-size: 18px; font-weight: 800; letter-spacing: 1px; color: #f4b942;">EQUIFLOW</span>
                <span style="display: block; font-size: 11px; color: #94a3b8; letter-spacing: 0.5px;">Hệ thống Quản lý Huấn luyện Ngựa đua</span>
              </div>
              <h3 style="color: #ffffff; margin-top: 0; margin-bottom: 16px; font-size: 17px;">${subject}</h3>
              <div>
                ${formattedBody}
              </div>
              <div style="border-top: 1px solid #1e3a45; margin-top: 28px; padding-top: 16px; font-size: 12px; color: #64748b;">
                © ${new Date().getFullYear()} EquiFlow System. Bản quyền thuộc Ban Quản lý Câu lạc bộ.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
