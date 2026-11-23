import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('should initialize in mock mode when EMAIL_PROVIDER is mock', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'EMAIL_PROVIDER') return 'mock';
              return null;
            },
          },
        },
      ],
    }).compile();

    const service = module.get<MailService>(MailService);
    expect(service).toBeDefined();

    // Calling send should not throw
    await expect(service.send('test@example.com', 'Subject', 'Body')).resolves.not.toThrow();
  });

  it('should fall back to mock mode when EMAIL_PROVIDER is resend but RESEND_API_KEY is missing', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'EMAIL_PROVIDER') return 'resend';
              if (key === 'RESEND_API_KEY') return '';
              return null;
            },
          },
        },
      ],
    }).compile();

    const service = module.get<MailService>(MailService);
    expect(service).toBeDefined();
    await expect(service.send('test@example.com', 'Subject', 'Body')).resolves.not.toThrow();
  });

  it('should initialize resend client when RESEND_API_KEY is provided', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'EMAIL_PROVIDER') return 'resend';
              if (key === 'RESEND_API_KEY') return 're_test_key_12345';
              if (key === 'EMAIL_FROM') return 'EquiFlow <onboarding@resend.dev>';
              return null;
            },
          },
        },
      ],
    }).compile();

    const service = module.get<MailService>(MailService);
    expect(service).toBeDefined();
  });

  describe('business send over unauthenticated SMTP (Mailpit)', () => {
    const mailpitConfig = {
      provide: ConfigService,
      useValue: {
        get: (key: string) => {
          if (key === 'EMAIL_PROVIDER') return 'smtp';
          if (key === 'MAIL_HOST') return '127.0.0.1';
          if (key === 'MAIL_PORT') return '1025';
          if (key === 'EMAIL_FROM') return 'EquiFlow <noreply@tmec.site>';
          return null;
        },
      },
    };

    it('uses a real SMTP transporter (not mock) when SMTP_USER is empty but MAIL_HOST is set', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [MailService, mailpitConfig],
      }).compile();
      const service = module.get<MailService>(MailService);
      const transporter = (service as unknown as { transporter: { sendMail: () => unknown } })
        .transporter;
      expect(transporter).toBeDefined();
      const sendMail = jest.fn().mockResolvedValue({ messageId: 'accept' });
      transporter.sendMail = sendMail;
      const accepted = await service.sendBusiness('owner@example.com', 'Nhắc hạn', 'Body');
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(accepted).toBe(true);
    });

    it('returns false (does not throw) when SMTP rejects', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [MailService, mailpitConfig],
      }).compile();
      const service = module.get<MailService>(MailService);
      const transporter = (service as unknown as { transporter: { sendMail: () => unknown } })
        .transporter;
      transporter.sendMail = jest.fn().mockRejectedValue(new Error('connection refused'));
      await expect(service.sendBusiness('owner@example.com', 'Nhắc hạn', 'Body')).resolves.toBe(
        false,
      );
    });
  });

  it('should format and send OTP email without error in mock mode', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'EMAIL_PROVIDER') return 'mock';
              return null;
            },
          },
        },
      ],
    }).compile();

    const service = module.get<MailService>(MailService);
    await expect(
      service.sendOtp('user@gmail.com', {
        code: '654321',
        purposeLabel: 'xác thực tài khoản',
        expiresInMinutes: 10,
      }),
    ).resolves.not.toThrow();
  });
});
