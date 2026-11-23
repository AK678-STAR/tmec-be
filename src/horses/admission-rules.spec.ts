import { AdmissionStatus } from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';
import {
  assertAdmissionApprovable,
  assertInspectFieldRoles,
  assertNoActiveAdmission,
  assertRejectionReason,
  assertValidCancelTransition,
  assertValidInspectTransition,
  assertValidRejectTransition,
  assertValidScheduleTransition,
  computeMicrochipVerified,
} from './admission-rules';

function errorCode(fn: () => void): string {
  try {
    fn();
    return 'OK';
  } catch (e: any) {
    return e.getResponse ? e.getResponse().code : e.message;
  }
}

describe('admission-rules (ADM-01, ADM-02)', () => {
  describe('assertAdmissionApprovable', () => {
    it('should pass when in inspection and all 3 criteria are met', () => {
      expect(
        errorCode(() =>
          assertAdmissionApprovable({
            status: AdmissionStatus.INSPECTION_IN_PROGRESS,
            microchipVerified: true,
            legalVerified: true,
            isHealthEligible: true,
          }),
        ),
      ).toBe('OK');
    });

    it('should throw ADMISSION_NOT_IN_INSPECTION if not in INSPECTION_IN_PROGRESS', () => {
      expect(
        errorCode(() =>
          assertAdmissionApprovable({
            status: AdmissionStatus.APPOINTED,
            microchipVerified: true,
            legalVerified: true,
            isHealthEligible: true,
          }),
        ),
      ).toBe('ADMISSION_NOT_IN_INSPECTION');

      expect(
        errorCode(() =>
          assertAdmissionApprovable({
            status: AdmissionStatus.PENDING_VERIFICATION,
            microchipVerified: true,
            legalVerified: true,
            isHealthEligible: true,
          }),
        ),
      ).toBe('ADMISSION_NOT_IN_INSPECTION');
    });

    it('should throw ADMISSION_CRITERIA_NOT_MET if microchip is unverified', () => {
      expect(
        errorCode(() =>
          assertAdmissionApprovable({
            status: AdmissionStatus.INSPECTION_IN_PROGRESS,
            microchipVerified: false,
            legalVerified: true,
            isHealthEligible: true,
          }),
        ),
      ).toBe('ADMISSION_CRITERIA_NOT_MET');
    });

    it('should throw ADMISSION_CRITERIA_NOT_MET if legal documents unverified', () => {
      expect(
        errorCode(() =>
          assertAdmissionApprovable({
            status: AdmissionStatus.INSPECTION_IN_PROGRESS,
            microchipVerified: true,
            legalVerified: false,
            isHealthEligible: true,
          }),
        ),
      ).toBe('ADMISSION_CRITERIA_NOT_MET');
    });

    it('should throw ADMISSION_CRITERIA_NOT_MET if health eligibility is false or null', () => {
      expect(
        errorCode(() =>
          assertAdmissionApprovable({
            status: AdmissionStatus.INSPECTION_IN_PROGRESS,
            microchipVerified: true,
            legalVerified: true,
            isHealthEligible: false,
          }),
        ),
      ).toBe('ADMISSION_CRITERIA_NOT_MET');

      expect(
        errorCode(() =>
          assertAdmissionApprovable({
            status: AdmissionStatus.INSPECTION_IN_PROGRESS,
            microchipVerified: true,
            legalVerified: true,
            isHealthEligible: null,
          }),
        ),
      ).toBe('ADMISSION_CRITERIA_NOT_MET');
    });
  });

  describe('assertNoActiveAdmission', () => {
    it('should pass when active count is 0', () => {
      expect(errorCode(() => assertNoActiveAdmission(0))).toBe('OK');
    });

    it('should throw ACTIVE_ADMISSION_EXISTS when active count > 0', () => {
      expect(errorCode(() => assertNoActiveAdmission(1))).toBe('ACTIVE_ADMISSION_EXISTS');
      expect(errorCode(() => assertNoActiveAdmission(3))).toBe('ACTIVE_ADMISSION_EXISTS');
    });
  });

  describe('assertRejectionReason', () => {
    it('should pass for trimmed strings between 10 and 500 characters', () => {
      expect(errorCode(() => assertRejectionReason('Hồ sơ thiếu sổ tiêm phòng vắc-xin gốc.'))).toBe(
        'OK',
      );
      expect(errorCode(() => assertRejectionReason('a'.repeat(10)))).toBe('OK');
      expect(errorCode(() => assertRejectionReason('a'.repeat(500)))).toBe('OK');
    });

    it('should throw REJECTION_REASON_REQUIRED for empty or short strings', () => {
      expect(errorCode(() => assertRejectionReason(undefined))).toBe('REJECTION_REASON_REQUIRED');
      expect(errorCode(() => assertRejectionReason(''))).toBe('REJECTION_REASON_REQUIRED');
      expect(errorCode(() => assertRejectionReason('   '))).toBe('REJECTION_REASON_REQUIRED');
      expect(errorCode(() => assertRejectionReason('Quá ngắn'))).toBe('REJECTION_REASON_REQUIRED');
    });

    it('should throw REJECTION_REASON_REQUIRED for strings exceeding 500 characters', () => {
      expect(errorCode(() => assertRejectionReason('a'.repeat(501)))).toBe(
        'REJECTION_REASON_REQUIRED',
      );
    });
  });

  describe('assertValidScheduleTransition', () => {
    it('should permit scheduling from PENDING_VERIFICATION and APPOINTED (reschedule)', () => {
      expect(
        errorCode(() => assertValidScheduleTransition(AdmissionStatus.PENDING_VERIFICATION)),
      ).toBe('OK');
      expect(errorCode(() => assertValidScheduleTransition(AdmissionStatus.APPOINTED))).toBe('OK');
    });

    it('should throw ADMISSION_TERMINAL for terminal records', () => {
      expect(errorCode(() => assertValidScheduleTransition(AdmissionStatus.APPROVED))).toBe(
        'ADMISSION_TERMINAL',
      );
      expect(errorCode(() => assertValidScheduleTransition(AdmissionStatus.REJECTED))).toBe(
        'ADMISSION_TERMINAL',
      );
      expect(errorCode(() => assertValidScheduleTransition(AdmissionStatus.CANCELLED))).toBe(
        'ADMISSION_TERMINAL',
      );
    });

    it('should throw INVALID_ADMISSION_STATUS if already in inspection', () => {
      expect(
        errorCode(() => assertValidScheduleTransition(AdmissionStatus.INSPECTION_IN_PROGRESS)),
      ).toBe('INVALID_ADMISSION_STATUS');
    });
  });

  describe('assertValidInspectTransition', () => {
    it('should permit inspection from APPOINTED and INSPECTION_IN_PROGRESS', () => {
      expect(errorCode(() => assertValidInspectTransition(AdmissionStatus.APPOINTED))).toBe('OK');
      expect(
        errorCode(() => assertValidInspectTransition(AdmissionStatus.INSPECTION_IN_PROGRESS)),
      ).toBe('OK');
    });

    it('should throw ADMISSION_NOT_SCHEDULED if not yet scheduled', () => {
      expect(
        errorCode(() => assertValidInspectTransition(AdmissionStatus.PENDING_VERIFICATION)),
      ).toBe('ADMISSION_NOT_SCHEDULED');
    });

    it('should throw ADMISSION_TERMINAL for terminal records', () => {
      expect(errorCode(() => assertValidInspectTransition(AdmissionStatus.APPROVED))).toBe(
        'ADMISSION_TERMINAL',
      );
      expect(errorCode(() => assertValidInspectTransition(AdmissionStatus.REJECTED))).toBe(
        'ADMISSION_TERMINAL',
      );
      expect(errorCode(() => assertValidInspectTransition(AdmissionStatus.CANCELLED))).toBe(
        'ADMISSION_TERMINAL',
      );
    });
  });

  describe('assertInspectFieldRoles (RBAC & anti-spoofing)', () => {
    it('should allow CLUB_MANAGER to update microchip and legal fields', () => {
      expect(
        errorCode(() =>
          assertInspectFieldRoles(UserRole.CLUB_MANAGER, {
            scannedMicrochip: '985123456789012',
            legalVerified: true,
            legalDocumentsNote: 'Đã đối soát bản gốc',
            documentsUrl: 'https://example.com/doc.pdf',
          }),
        ),
      ).toBe('OK');
    });

    it('should reject CLUB_MANAGER updating vet fields', () => {
      expect(
        errorCode(() =>
          assertInspectFieldRoles(UserRole.CLUB_MANAGER, {
            isHealthEligible: true,
          }),
        ),
      ).toBe('FORBIDDEN_FIELD_SPOOFING');

      expect(
        errorCode(() =>
          assertInspectFieldRoles(UserRole.CLUB_MANAGER, {
            healthCheckNotes: 'Tim phổi bình thường',
          }),
        ),
      ).toBe('FORBIDDEN_FIELD_SPOOFING');

      expect(
        errorCode(() =>
          assertInspectFieldRoles(UserRole.CLUB_MANAGER, {
            veterinarianUserId: 'vet-123',
          }),
        ),
      ).toBe('FORBIDDEN_FIELD_SPOOFING');
    });

    it('should allow VETERINARIAN to update health eligibility and notes', () => {
      expect(
        errorCode(() =>
          assertInspectFieldRoles(UserRole.VETERINARIAN, {
            isHealthEligible: true,
            healthCheckNotes: 'Thể trạng tốt, không có dấu hiệu bệnh truyền nhiễm',
          }),
        ),
      ).toBe('OK');
    });

    it('should reject VETERINARIAN updating microchip or legal fields', () => {
      expect(
        errorCode(() =>
          assertInspectFieldRoles(UserRole.VETERINARIAN, {
            scannedMicrochip: '985123456789012',
          }),
        ),
      ).toBe('FORBIDDEN_FIELD_SPOOFING');

      expect(
        errorCode(() =>
          assertInspectFieldRoles(UserRole.VETERINARIAN, {
            legalVerified: true,
          }),
        ),
      ).toBe('FORBIDDEN_FIELD_SPOOFING');

      expect(
        errorCode(() =>
          assertInspectFieldRoles(UserRole.VETERINARIAN, {
            legalDocumentsNote: 'Ghi chú pháp lý',
          }),
        ),
      ).toBe('FORBIDDEN_FIELD_SPOOFING');
    });

    it('should reject unauthorized roles from inspecting', () => {
      expect(errorCode(() => assertInspectFieldRoles(UserRole.HORSE_OWNER, {}))).toBe(
        'ROLE_RESTRICTION',
      );
      expect(errorCode(() => assertInspectFieldRoles(UserRole.GROOM, {}))).toBe('ROLE_RESTRICTION');
    });
  });

  describe('computeMicrochipVerified', () => {
    it('should return true on exact matching microchip numbers', () => {
      expect(computeMicrochipVerified('985123456789012', '985123456789012')).toBe(true);
      expect(computeMicrochipVerified(' 985123456789012 ', '985123456789012')).toBe(true);
    });

    it('should return false when scanned does not match declared', () => {
      expect(computeMicrochipVerified('985123456789012', '985999999999999')).toBe(false);
    });

    it('should return false when scanned or declared is empty or null', () => {
      expect(computeMicrochipVerified('', '985123456789012')).toBe(false);
      expect(computeMicrochipVerified(null, '985123456789012')).toBe(false);
      expect(computeMicrochipVerified(undefined, '985123456789012')).toBe(false);
      expect(computeMicrochipVerified('985123456789012', '')).toBe(false);
      expect(computeMicrochipVerified('   ', '   ')).toBe(false);
    });
  });

  describe('assertValidCancelTransition', () => {
    const baseRecord = {
      status: AdmissionStatus.PENDING_VERIFICATION,
      ownerId: 'owner-1',
      appointmentDate: null as Date | null,
    };

    it('should allow owner to cancel own record in PENDING_VERIFICATION or APPOINTED', () => {
      expect(
        errorCode(() =>
          assertValidCancelTransition(baseRecord, {
            role: UserRole.HORSE_OWNER,
            userId: 'owner-1',
          }),
        ),
      ).toBe('OK');

      expect(
        errorCode(() =>
          assertValidCancelTransition(
            { ...baseRecord, status: AdmissionStatus.APPOINTED },
            { role: UserRole.HORSE_OWNER, userId: 'owner-1' },
          ),
        ),
      ).toBe('OK');
    });

    it('should prevent owner from cancelling another owner record', () => {
      expect(
        errorCode(() =>
          assertValidCancelTransition(baseRecord, {
            role: UserRole.HORSE_OWNER,
            userId: 'owner-2',
          }),
        ),
      ).toBe('NOT_ADMISSION_OWNER');
    });

    it('should prevent owner from cancelling once INSPECTION_IN_PROGRESS', () => {
      expect(
        errorCode(() =>
          assertValidCancelTransition(
            { ...baseRecord, status: AdmissionStatus.INSPECTION_IN_PROGRESS },
            { role: UserRole.HORSE_OWNER, userId: 'owner-1' },
          ),
        ),
      ).toBe('CANNOT_CANCEL_IN_INSPECTION');
    });

    it('should prevent manager from cancelling before 3 days overdue', () => {
      const now = new Date('2026-11-25T12:00:00Z');
      const appointmentYesterday = new Date('2026-11-24T12:00:00Z'); // 1 ngày trước

      expect(
        errorCode(() =>
          assertValidCancelTransition(
            {
              status: AdmissionStatus.APPOINTED,
              ownerId: 'owner-1',
              appointmentDate: appointmentYesterday,
            },
            { role: UserRole.CLUB_MANAGER, userId: 'mgr-1' },
            now,
          ),
        ),
      ).toBe('CANCELLATION_NOT_OVERDUE');
    });

    it('should allow manager to cancel when overdue 3 days or more', () => {
      const now = new Date('2026-11-28T12:00:00Z');
      const appointmentThreeDaysAgo = new Date('2026-11-25T11:00:00Z'); // > 3 ngày trước

      expect(
        errorCode(() =>
          assertValidCancelTransition(
            {
              status: AdmissionStatus.APPOINTED,
              ownerId: 'owner-1',
              appointmentDate: appointmentThreeDaysAgo,
            },
            { role: UserRole.CLUB_MANAGER, userId: 'mgr-1' },
            now,
          ),
        ),
      ).toBe('OK');
    });

    it('should throw ADMISSION_TERMINAL if already in terminal status', () => {
      expect(
        errorCode(() =>
          assertValidCancelTransition(
            { ...baseRecord, status: AdmissionStatus.APPROVED },
            { role: UserRole.HORSE_OWNER, userId: 'owner-1' },
          ),
        ),
      ).toBe('ADMISSION_TERMINAL');

      expect(
        errorCode(() =>
          assertValidCancelTransition(
            { ...baseRecord, status: AdmissionStatus.REJECTED },
            { role: UserRole.HORSE_OWNER, userId: 'owner-1' },
          ),
        ),
      ).toBe('ADMISSION_TERMINAL');

      expect(
        errorCode(() =>
          assertValidCancelTransition(
            { ...baseRecord, status: AdmissionStatus.CANCELLED },
            { role: UserRole.HORSE_OWNER, userId: 'owner-1' },
          ),
        ),
      ).toBe('ADMISSION_TERMINAL');
    });
  });

  describe('assertValidRejectTransition', () => {
    it('should allow rejecting active admissions', () => {
      expect(
        errorCode(() => assertValidRejectTransition(AdmissionStatus.PENDING_VERIFICATION)),
      ).toBe('OK');
      expect(errorCode(() => assertValidRejectTransition(AdmissionStatus.APPOINTED))).toBe('OK');
      expect(
        errorCode(() => assertValidRejectTransition(AdmissionStatus.INSPECTION_IN_PROGRESS)),
      ).toBe('OK');
    });

    it('should throw ADMISSION_TERMINAL for already terminated admissions', () => {
      expect(errorCode(() => assertValidRejectTransition(AdmissionStatus.APPROVED))).toBe(
        'ADMISSION_TERMINAL',
      );
      expect(errorCode(() => assertValidRejectTransition(AdmissionStatus.REJECTED))).toBe(
        'ADMISSION_TERMINAL',
      );
      expect(errorCode(() => assertValidRejectTransition(AdmissionStatus.CANCELLED))).toBe(
        'ADMISSION_TERMINAL',
      );
    });
  });
});
