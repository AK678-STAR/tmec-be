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
      },
      businessMailing: {
        // findUnique: undefined = chưa có bản ghi nào (lần đầu gửi).
        findUnique: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'm-new', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
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
    prisma.user.findMany.mockResolvedValue([activeUser('u1', 'a@x.com'), activeUser('u2', 'b@x.com')]);

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
      recipients: [{ userId: 'u1', body: { subject: 'S', text: 'T', milestone: 'due-3d' } }],
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
      { id: 'm1', eventCode: 'PAYMENT_FAILED', toEmail: 'a@x.com', subject: 'S', bodyText: 'T', attempts: 1 },
    ]);
    mail.sendBusiness.mockResolvedValue(true);
    const retried = await service.retryFailed();
    expect(retried).toBe(1);
    // retry gọi sendBusiness(to, subject, text) — 3 tham số (không có html từ snapshot).
    expect(mail.sendBusiness).toHaveBeenLastCalledWith('a@x.com', 'S', 'T');
    expect(prisma.businessMailing.update).toHaveBeenCalled();
  });
});
