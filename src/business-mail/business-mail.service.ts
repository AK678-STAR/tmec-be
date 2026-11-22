import { Injectable, Logger } from '@nestjs/common';
import { MailingStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

export interface BusinessMailBody {
  subject: string;
  text: string;
  html?: string;
  /** Mốc nhắc (due-3d, task-overdue…) — cùng sự kiện + người nhận + mốc chỉ gửi 1 lần. */
  milestone?: string;
}

export interface BusinessMailEvent {
  eventCode: string;
  recipients: Array<{ userId: string; body: BusinessMailBody }>;
}

/** Kết quả emit cho 1 người nhận (bản ghi BusinessMailing đã tạo hoặc tồn tại). */
export interface EmittedMailing {
  id: string;
  eventCode: string;
  userId: string;
  toEmail: string;
  dedupeKey: string;
  status: MailingStatus;
  accepted: boolean;
}

/**
 * Gửi mail nghiệp vụ (nhắc nợ, cảnh báo, chứng từ) — SAU khi ghi DB thành công.
 * - Mỗi người nhận được gửi RIÊNG (không CC) và ghi 1 bản BusinessMailing (chống trùng theo mốc).
 * - Lỗi gửi KHÔNG throw: ghi log, status=FAILED để retryFailed() chạy lại (≤ 3 lần).
 */
@Injectable()
export class BusinessMailService {
  private readonly logger = new Logger(BusinessMailService.name);
  private readonly maxAttempts = 3;

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  async emit(event: BusinessMailEvent): Promise<EmittedMailing[]> {
    if (!event.recipients?.length) return [];
    const emitted: EmittedMailing[] = [];

    // Lấy email + trạng thái người nhận (bỏ người dùng không có email hoặc không ACTIVE).
    const userIds = [...new Set(event.recipients.map((r) => r.userId).filter(Boolean))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, status: true },
    });
    const emailOf = new Map(users.map((u) => [u.id, u]));

    for (const recipient of event.recipients) {
      const user = emailOf.get(recipient.userId);
      if (!user || !user.email || user.status !== UserStatus.ACTIVE) continue;

      const milestone = recipient.body.milestone ?? null;
      const dedupeKey = this.dedupeKey(event.eventCode, milestone, recipient.userId);

      // Chống trùng: đã gửi sự kiện + mốc này cho người nhận thì bỏ qua.
      const existing = await this.prisma.businessMailing.findUnique({
        where: { dedupeKey },
        select: { id: true, status: true, accepted: true, toEmail: true },
      });
      if (existing) {
        emitted.push({
          id: existing.id,
          eventCode: event.eventCode,
          userId: recipient.userId,
          toEmail: existing.toEmail,
          dedupeKey,
          status: existing.status,
          accepted: existing.accepted,
        });
        continue;
      }

      let status: MailingStatus = MailingStatus.SENT;
      let accepted = false;
      let lastError: string | null = null;
      try {
        accepted = await this.mail.sendBusiness(
          user.email,
          recipient.body.subject,
          recipient.body.text,
          recipient.body.html,
        );
        if (!accepted) {
          status = MailingStatus.FAILED;
          lastError = 'provider did not accept (mock or error)';
        }
      } catch (err) {
        status = MailingStatus.FAILED;
        lastError = (err as Error).message;
        this.logger.warn(`business-mail send failed ${event.eventCode} -> ${user.email}: ${lastError}`);
      }

      const record = await this.prisma.businessMailing.create({
        data: {
          eventCode: event.eventCode,
          milestone,
          userId: recipient.userId,
          toEmail: user.email,
          subject: recipient.body.subject,
          bodyText: recipient.body.text,
          dedupeKey,
          status,
          accepted,
          attempts: 1,
          lastError,
        },
      });
      emitted.push({
        id: record.id,
        eventCode: record.eventCode,
        userId: record.userId,
        toEmail: record.toEmail,
        dedupeKey,
        status: record.status,
        accepted: record.accepted,
      });
    }

    return emitted;
  }

  /** Chạy lại các mail FAILED chưa đến ngưỡng; tăng attempts. Không tạo thêm giao dịch/task. */
  async retryFailed(): Promise<number> {
    const failed = await this.prisma.businessMailing.findMany({
      where: {
        status: MailingStatus.FAILED,
        attempts: { lt: this.maxAttempts },
      },
    });
    let retried = 0;
    for (const m of failed) {
      let accepted = false;
      let lastError: string | null = null;
      try {
        accepted = await this.mail.sendBusiness(m.toEmail, m.subject, m.bodyText);
        if (!accepted) lastError = 'provider did not accept (mock or error)';
      } catch (err) {
        lastError = (err as Error).message;
      }
      await this.prisma.businessMailing.update({
        where: { id: m.id },
        data: {
          accepted,
          status: accepted ? MailingStatus.SENT : MailingStatus.FAILED,
          attempts: m.attempts + 1,
          lastError,
        },
      });
      if (accepted) retried += 1;
    }
    return retried;
  }

  private dedupeKey(eventCode: string, milestone: string | null, userId: string): string {
    return `${eventCode}:${milestone ?? 'once'}:${userId}`;
  }
}
