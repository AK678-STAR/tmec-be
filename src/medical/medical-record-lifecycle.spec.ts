import { MedicalRecordsService } from './medical-records.service';

describe('record closure and lock sources', () => {
  const vet = { userId: 'vet', fullName: 'Vet', role: 'VETERINARIAN' } as any;
  let db: any;
  let rows: any[];
  let record: any;
  let service: MedicalRecordsService;
  beforeEach(() => {
    record = {
      id: 'rec',
      horseId: 'h',
      status: 'OPEN',
      treatmentProtocol: '',
      prescriptions: '[]',
      horse: { id: 'h', status: 'INJURED', isMedicalLocked: true },
    };
    rows = [{ id: 'own', medicalRecordId: 'rec', horseId: 'h', isLocked: true }];
    db = {
      $queryRaw: jest.fn(),
      medicalRecord: {
        findUnique: jest.fn(async () => record),
        update: jest.fn(async ({ data }) => ({ ...record, ...data })),
      },
      horse: {
        findUnique: jest.fn(async () => record.horse),
        update: jest.fn(async ({ data }) => ({ ...record.horse, ...data })),
      },
      medicalLock: {
        findMany: jest.fn(async ({ where }) =>
          rows.filter(
            (r) =>
              r.isLocked && (!where.medicalRecordId || r.medicalRecordId === where.medicalRecordId),
          ),
        ),
        updateMany: jest.fn(async ({ where, data }) => {
          const matches = rows.filter(
            (r) => r.isLocked && r.medicalRecordId === where.medicalRecordId,
          );
          matches.forEach((r) => Object.assign(r, data));
          return { count: matches.length };
        }),
      },
      incidentReport: { updateMany: jest.fn() },
    };
    db.$transaction = jest.fn((fn) => fn(db));
    service = new MedicalRecordsService(
      db,
      { record: jest.fn() } as any,
      { assertVet: jest.fn() } as any,
      {} as any,
      { notifyHorse: jest.fn().mockResolvedValue(true) } as any,
    );
  });
  it('releases only this record and restores the chosen discharge status', async () => {
    const result = await service.closeMedicalRecord('rec', vet, {
      conclusion: 'Recovered after follow-up examination',
      treatmentResult: 'RECOVERED',
      recoveryConfirmed: true,
      postTreatmentStatus: 'RESTING',
    } as any);
    expect(rows[0].isLocked).toBe(false);
    expect(db.horse.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isMedicalLocked: false, status: 'RESTING' } }),
    );
    expect(result).toMatchObject({ isMedicalLocked: false, horseStatus: 'RESTING' });
  });
  it('keeps protection from a different record', async () => {
    rows.push({ id: 'other', medicalRecordId: 'other-record', horseId: 'h', isLocked: true });
    const result = await service.closeMedicalRecord('rec', vet, {
      conclusion: 'Recovered after follow-up examination',
      treatmentResult: 'RECOVERED',
      recoveryConfirmed: true,
      postTreatmentStatus: 'ACTIVE',
    } as any);
    expect(rows[0].isLocked).toBe(false);
    expect(rows[1].isLocked).toBe(true);
    expect(result).toMatchObject({ isMedicalLocked: true, horseStatus: 'INJURED' });
  });
  it('does not release protection for partial recovery', async () => {
    await service.closeMedicalRecord('rec', vet, {
      conclusion: 'Requires further veterinary care',
      treatmentResult: 'PARTIAL',
    });
    expect(rows[0].isLocked).toBe(true);
  });
  it('rejects an unconfirmed recovery rather than silently lifting a lock', async () => {
    await expect(
      service.closeMedicalRecord('rec', vet, {
        conclusion: 'Recovered after follow-up examination',
        treatmentResult: 'RECOVERED',
      }),
    ).rejects.toThrow();
    expect(db.medicalRecord.update).not.toHaveBeenCalled();
  });
});
