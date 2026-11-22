import { Test, TestingModule } from '@nestjs/testing';
import { BusinessMailService, BusinessMailEvent } from './business-mail.service';
import { MailService } from '../mail/mail.service';

describe('BusinessMailService', () => {
  let service: BusinessMailService;
  // `any` on purpose: the Prisma delegate type carries no jest mock API, and the
  // tests only need to set expectations on the plain mock functions.
  let prisma: any;
  let mail: any;

  const activeUser = (id: string, email: string | null) => ({ id, email, status: 'ACTIVE' });

  beforeEach(async () => {
    const prismaMock: any = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: 'a@x.com', status: 'ACTIVE', role: 'HORSE_OWNER' }),
      },
      financialInvoice: {
        findUnique: jest.fn().mockResolvedValue({
          ownerId: 'u1',
          status: 'SENT',
          netAmount: 100,
          dueAt: new Date(Date.now() + 86400000),
        }),
      },
      complaint: { findUnique: jest.fn() },
      dailyCareTask: { findUnique: jest.fn() },
      shiftRoster: { findFirst: jest.fn() },
      businessMailing: {
        // findUnique: undefined = chưa có bản ghi nào (lần đầu gửi).
        findUnique: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'm-new', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(async ({ where, data }) => ({
          id: where.id,
          ...prismaMock.businessMailing.create.mock.calls.at(-1)?.[0]?.data,
          ...data,
        })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const mailMock: any = { sendBusiness: jest.fn().mockResolvedValue(true) };

    const { PrismaService } = await import('../prisma/prisma.service');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessMailService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MailService, useValue: mailMock },
      ],
    }).compile();

    service = module.get(BusinessMailService);
    prisma = prismaMock;
    mail = mailMock;
  });

  it('emits one BusinessMailing per recipient, calls sendBusiness for each', async () => {
    prisma.user.findMany.mockResolvedValue([
      activeUser('u1', 'a@x.com'),
      activeUser('u2', 'b@x.com'),
    ]);

    const event: BusinessMailEvent = {
      eventCode: 'INVOICE_ISSUED',
      recipients: [
        { userId: 'u1', body: { subject: 'S', text: 'T' } },
        { userId: 'u2', body: { subject: 'S', text: 'T' } },
      ],
    };

    const created = await service.emit(event);
    expect(created).toHaveLength(2);
    expect(mail.sendBusiness).toHaveBeenCalledTimes(2);
    expect(mail.sendBusiness).toHaveBeenCalledWith('a@x.com', 'S', 'T', undefined);
    expect(created[0].dedupeKey).not.toEqual(created[1].dedupeKey);
  });

  it('skips re-sending when same eventCode+user+milestone already recorded (dedupe)', async () => {
    prisma.user.findMany.mockResolvedValue([activeUser('u1', 'a@x.com')]);
    const event: BusinessMailEvent = {
      eventCode: 'DUE_SOON',
      recipients: [
        { userId: 'u1', body: { subject: 'S', text: 'T', milestone: 'due-3d', refId: 'inv-1' } },
      ],
    };

    // Lần 1: chưa có bản ghi -> tạo mới.
    prisma.businessMailing.findUnique.mockResolvedValueOnce(undefined);
    const first = await service.emit(event);
    expect(first).toHaveLength(1);
    expect(prisma.businessMailing.create).toHaveBeenCalledTimes(1);

    // Lần 2: bản ghi cùng dedupeKey đã tồn tại -> không gửi lại.
    prisma.businessMailing.findUnique.mockResolvedValue({
      id: 'm-exist',
      toEmail: 'a@x.com',
      status: 'SENT',
      accepted: true,
    });
    const second = await service.emit(event);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe('m-exist');
    expect(prisma.businessMailing.create).toHaveBeenCalledTimes(1); // không tạo thêm
    expect(mail.sendBusiness).toHaveBeenCalledTimes(1); // không gửi lại
  });

  it('does not call sendBusiness for recipients without an email', async () => {
    prisma.user.findMany.mockResolvedValue([activeUser('u1', null)]);
    const out = await service.emit({
      eventCode: 'INVOICE_ISSUED',
      recipients: [{ userId: 'u1', body: { subject: 'S', text: 'T' } }],
    });
    expect(out).toHaveLength(0);
    expect(mail.sendBusiness).not.toHaveBeenCalled();
  });

  it('records accepted=false when sendBusiness reports false, and retryFailed re-sends failed mailings', async () => {
    mail.sendBusiness.mockResolvedValue(false);
    prisma.user.findMany.mockResolvedValue([activeUser('u1', 'a@x.com')]);

    const out = await service.emit({
      eventCode: 'PAYMENT_FAILED',
      recipients: [{ userId: 'u1', body: { subject: 'S', text: 'T' } }],
    });
    expect(out[0].accepted).toBe(false);
    expect(out[0].status).toBe('FAILED');

    // retryFailed: lấy các mail FAILED (attempts < 3) và gửi lại.
    prisma.businessMailing.findMany.mockResolvedValue([
      {
        id: 'm1',
        eventCode: 'PAYMENT_FAILED',
        userId: 'u1',
        toEmail: 'a@x.com',
        subject: 'S',
        bodyText: 'T',
        attempts: 1,
      },
    ]);
    mail.sendBusiness.mockResolvedValue(true);
    const retried = await service.retryFailed();
    expect(retried).toBe(1);
    // retry gọi sendBusiness(to, subject, text) — 3 tham số (không có html từ snapshot).
    expect(mail.sendBusiness).toHaveBeenLastCalledWith('a@x.com', 'S', 'T', undefined);
    expect(prisma.businessMailing.update).toHaveBeenCalled();
  });
  it('keeps the existing key format when an event has no object reference', async () => {
    prisma.user.findMany.mockResolvedValue([activeUser('u1', 'qa@example.test')]);
    const result = await service.emit({
      eventCode: 'EVENT',
      recipients: [{ userId: 'u1', body: { subject: 'S', text: 'T' } }],
    });
    expect(result[0].dedupeKey).toBe('EVENT:once:u1');
  });

  it('distinguishes two invoices belonging to the same recipient', async () => {
    prisma.user.findMany.mockResolvedValue([activeUser('u1', 'qa@example.test')]);
    const result = await service.emit({
      eventCode: 'INVOICE_ISSUED',
      recipients: [
        { userId: 'u1', body: { subject: 'S', text: 'T', refId: 'inv-1' } },
        { userId: 'u1', body: { subject: 'S', text: 'T', refId: 'inv-2' } },
      ],
    });
    expect(new Set(result.map((item) => item.dedupeKey)).size).toBe(2);
    expect(mail.sendBusiness).toHaveBeenCalledTimes(2);
  });
  it('reserves the unique record before SMTP and skips a concurrent loser', async () => {
    prisma.user.findMany.mockResolvedValue([activeUser('u1', 'a@x.com')]);
    prisma.businessMailing.create.mockRejectedValueOnce({ code: 'P2002' });
    await service.emit({
      eventCode: 'INVOICE_ISSUED',
      recipients: [{ userId: 'u1', body: { subject: 'S', text: 'T', refId: 'invoice' } }],
    });
    expect(mail.sendBusiness).not.toHaveBeenCalled();
  });

  it('never sends a reminder for an already-paid invoice', async () => {
    prisma.user.findMany.mockResolvedValue([activeUser('u1', 'a@x.com')]);
    prisma.financialInvoice.findUnique.mockResolvedValue({
      ownerId: 'u1',
      status: 'PAID',
      netAmount: 100,
    });
    await service.emit({
      eventCode: 'MANUAL_REMIND',
      recipients: [{ userId: 'u1', body: { subject: 'Reminder', text: 'Pay', refId: 'invoice' } }],
    });
    expect(prisma.businessMailing.create).not.toHaveBeenCalled();
    expect(mail.sendBusiness).not.toHaveBeenCalled();
  });

  it('does not send a failed reminder after its invoice was cancelled', async () => {
    prisma.businessMailing.findMany.mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        eventCode: 'MANUAL_REMIND',
        refId: 'invoice',
        toEmail: 'a@x.com',
        status: 'FAILED',
        attempts: 1,
      },
    ]);
    prisma.financialInvoice.findUnique.mockResolvedValue({
      ownerId: 'u1',
      status: 'CANCELLED',
      netAmount: 100,
    });
    expect(await service.retryFailed()).toBe(0);
    expect(mail.sendBusiness).not.toHaveBeenCalled();
  });

  it('only the retry worker that wins the conditional claim sends', async () => {
    prisma.businessMailing.findMany.mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        eventCode: 'PAYMENT_FAILED',
        toEmail: 'a@x.com',
        attempts: 1,
      },
    ]);
    prisma.businessMailing.updateMany.mockResolvedValue({ count: 0 });
    await service.retryFailed();
    expect(mail.sendBusiness).not.toHaveBeenCalled();
  });
  it('suppresses a private complaint retry after the handler loses authority', async () => {
    prisma.businessMailing.findMany.mockResolvedValue([
      {
        id: 'complaint-mail',
        userId: 'handler',
        eventCode: 'COMPLAINT_FILED',
        refId: 'complaint',
        toEmail: 'a@x.com',
        attempts: 1,
      },
    ]);
    prisma.complaint.findUnique.mockResolvedValue({
      reporterId: 'reporter',
      subjectUserId: 'subject',
      status: 'OPEN',
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'a@x.com', status: 'ACTIVE', role: 'GROOM' });
    await service.retryFailed();
    expect(mail.sendBusiness).not.toHaveBeenCalled();
  });

  it('keeps vets in uncovered medical-task alerts without blaming a worker', async () => {
    prisma.user.findMany.mockResolvedValue([activeUser('vet', 'vet@example.test')]);
    prisma.user.findUnique.mockResolvedValue({ role: 'VETERINARIAN', status: 'ACTIVE' });
    prisma.dailyCareTask.findUnique.mockResolvedValue({
      id: 'task',
      date: new Date('2020-01-01'),
      taskType: 'MEDICATION',
      isCompleted: false,
      horse: { deletedAt: null, status: 'RESTING', stallAllocations: [] },
    });
    await service.emit({
      eventCode: 'TASK_UNASSIGNED_OVERDUE',
      recipients: [
        {
          userId: 'vet',
          body: { subject: 'Coverage needed', text: 'No assigned worker', refId: 'task' },
        },
      ],
    });
    expect(mail.sendBusiness).toHaveBeenCalledTimes(1);
  });
});
