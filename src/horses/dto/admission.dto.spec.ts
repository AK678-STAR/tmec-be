import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ScheduleAdmissionDto,
  InspectAdmissionDto,
  RejectAdmissionDto,
  CancelAdmissionDto,
  QueryAdmissionDto,
} from './admission.dto';
import { AdmissionStatus } from '@prisma/client';

describe('Admission DTO Validation', () => {
  describe('ScheduleAdmissionDto', () => {
    it('rejects appointmentNotes when supplied as null', async () => {
      const dto = plainToInstance(ScheduleAdmissionDto, {
        appointmentDate: '2026-11-25T09:00:00Z',
        appointmentNotes: null,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const noteError = errors.find((e) => e.property === 'appointmentNotes');
      expect(noteError).toBeDefined();
    });

    it('accepts appointmentNotes when string or omitted (undefined)', async () => {
      const valid1 = plainToInstance(ScheduleAdmissionDto, {
        appointmentDate: '2026-11-25T09:00:00Z',
        appointmentNotes: 'Cổng A tiếp nhận',
      });
      expect(await validate(valid1)).toHaveLength(0);

      const valid2 = plainToInstance(ScheduleAdmissionDto, {
        appointmentDate: '2026-11-25T09:00:00Z',
      });
      expect(await validate(valid2)).toHaveLength(0);
    });

    it('rejects invalid appointmentDate', async () => {
      const dto = plainToInstance(ScheduleAdmissionDto, {
        appointmentDate: 'not-a-valid-date',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'appointmentDate')).toBe(true);
    });
  });

  describe('InspectAdmissionDto', () => {
    it('rejects null string fields (scannedMicrochip, legalDocumentsNote, documentsUrl, healthCheckNotes)', async () => {
      const dto = plainToInstance(InspectAdmissionDto, {
        scannedMicrochip: null,
        legalDocumentsNote: null,
        documentsUrl: null,
        healthCheckNotes: null,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const propNames = errors.map((e) => e.property);
      expect(propNames).toContain('scannedMicrochip');
      expect(propNames).toContain('legalDocumentsNote');
      expect(propNames).toContain('documentsUrl');
      expect(propNames).toContain('healthCheckNotes');
    });

    it('rejects null boolean fields (legalVerified, isHealthEligible)', async () => {
      const dto = plainToInstance(InspectAdmissionDto, {
        legalVerified: null,
        isHealthEligible: null,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const propNames = errors.map((e) => e.property);
      expect(propNames).toContain('legalVerified');
      expect(propNames).toContain('isHealthEligible');
    });

    it('accepts valid string and boolean values', async () => {
      const dto = plainToInstance(InspectAdmissionDto, {
        scannedMicrochip: '985123456789012',
        legalVerified: true,
        legalDocumentsNote: 'Đầy đủ sổ tiêm',
        documentsUrl: 'https://cdn.example.com/doc.pdf',
        isHealthEligible: true,
        healthCheckNotes: 'Ngựa khỏe mạnh bình thường',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts empty object (all optional fields omitted)', async () => {
      const dto = plainToInstance(InspectAdmissionDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('RejectAdmissionDto and CancelAdmissionDto', () => {
    it('rejects rejectionReason under 10 chars or empty', async () => {
      const dto1 = plainToInstance(RejectAdmissionDto, { rejectionReason: '' });
      expect((await validate(dto1)).length).toBeGreaterThan(0);

      const dto2 = plainToInstance(RejectAdmissionDto, { rejectionReason: 'Ngắn' });
      expect((await validate(dto2)).length).toBeGreaterThan(0);
    });

    it('rejects cancel reason when supplied as null', async () => {
      const dto = plainToInstance(CancelAdmissionDto, { reason: null });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'reason')).toBe(true);
    });
  });

  describe('QueryAdmissionDto', () => {
    it('rejects invalid non-boolean strings for recent7Days', async () => {
      const dto1 = plainToInstance(QueryAdmissionDto, { recent7Days: 'invalid-string' });
      const errors1 = await validate(dto1);
      expect(errors1.some((e) => e.property === 'recent7Days')).toBe(true);

      const dto2 = plainToInstance(QueryAdmissionDto, { recent7Days: 'foo' });
      const errors2 = await validate(dto2);
      expect(errors2.some((e) => e.property === 'recent7Days')).toBe(true);

      const dto3 = plainToInstance(QueryAdmissionDto, { recent7Days: null });
      const errors3 = await validate(dto3);
      expect(errors3.some((e) => e.property === 'recent7Days')).toBe(true);
    });

    it('correctly transforms and accepts valid recent7Days inputs', async () => {
      const d1 = plainToInstance(QueryAdmissionDto, { recent7Days: 'true' });
      expect(await validate(d1)).toHaveLength(0);
      expect(d1.recent7Days).toBe(true);

      const d2 = plainToInstance(QueryAdmissionDto, { recent7Days: '1' });
      expect(await validate(d2)).toHaveLength(0);
      expect(d2.recent7Days).toBe(true);

      const d3 = plainToInstance(QueryAdmissionDto, { recent7Days: true });
      expect(await validate(d3)).toHaveLength(0);
      expect(d3.recent7Days).toBe(true);

      const d4 = plainToInstance(QueryAdmissionDto, { recent7Days: 'false' });
      expect(await validate(d4)).toHaveLength(0);
      expect(d4.recent7Days).toBe(false);

      const d5 = plainToInstance(QueryAdmissionDto, { recent7Days: '0' });
      expect(await validate(d5)).toHaveLength(0);
      expect(d5.recent7Days).toBe(false);

      const d6 = plainToInstance(QueryAdmissionDto, { recent7Days: false });
      expect(await validate(d6)).toHaveLength(0);
      expect(d6.recent7Days).toBe(false);

      const d7 = plainToInstance(QueryAdmissionDto, {});
      expect(await validate(d7)).toHaveLength(0);
      expect(d7.recent7Days).toBeUndefined();
    });

    it('rejects search and status when supplied as null', async () => {
      const dto = plainToInstance(QueryAdmissionDto, {
        search: null,
        status: null,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const propNames = errors.map((e) => e.property);
      expect(propNames).toContain('search');
      expect(propNames).toContain('status');
    });

    it('accepts valid status enum and pagination numbers', async () => {
      const dto = plainToInstance(QueryAdmissionDto, {
        status: AdmissionStatus.APPROVED,
        page: '2',
        pageSize: '25',
        search: 'Thunder',
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.page).toBe(2);
      expect(dto.pageSize).toBe(25);
    });
  });
});
