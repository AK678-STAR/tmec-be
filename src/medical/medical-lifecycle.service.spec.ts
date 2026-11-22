import { MedicalLifecycleService } from './medical-lifecycle.service';

describe('automatic incident protection', () => {
  const actor = { userId: 'groom', fullName: 'Groom', role: 'GROOM' } as any;
  let tx: any;
  let audit: any;
  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(),
      incidentReport: {
        findUnique: jest.fn().mockResolvedValue({ id: 'inc', horseId: 'h', severity: 'SEVERE' }),
      },
      horse: {
        findUnique: jest.fn().mockResolvedValue({ id: 'h', status: 'ACTIVE' }),
        update: jest.fn(),
      },
      medicalLock: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'lock' }) },
      workoutSession: { updateMany: jest.fn() },
      tournamentRegistration: { updateMany: jest.fn() },
    };
    audit = { record: jest.fn() };
  });
  it('protects severe incidents without claiming a vet diagnosis', async () => {
    await new MedicalLifecycleService(audit).placeIncidentLock(tx, 'inc', actor);
    expect(tx.medicalLock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          veterinarianUserId: null,
          sourceIncidentId: 'inc',
          issuedByUserId: 'groom',
          source: 'INCIDENT_AUTO',
        }),
      }),
    );
    expect(tx.horse.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isMedicalLocked: true, status: 'UNDER_OBSERVATION' } }),
    );
    expect(tx.workoutSession.updateMany).toHaveBeenCalled();
    expect(tx.tournamentRegistration.updateMany).toHaveBeenCalled();
    expect(audit.record.mock.calls[0].at(-1)).toBe(tx);
  });
  it('does not create a second lock for a retried incident', async () => {
    tx.medicalLock.findUnique.mockResolvedValue({ id: 'already' });
    await new MedicalLifecycleService(audit).placeIncidentLock(tx, 'inc', actor);
    expect(tx.medicalLock.create).not.toHaveBeenCalled();
  });
  it('does not automatically lock mild or moderate reports', async () => {
    tx.incidentReport.findUnique.mockResolvedValue({
      id: 'inc',
      horseId: 'h',
      severity: 'MODERATE',
    });
    await new MedicalLifecycleService(audit).placeIncidentLock(tx, 'inc', actor);
    expect(tx.medicalLock.create).not.toHaveBeenCalled();
  });
  it('propagates a storage failure for the caller transaction to roll back', async () => {
    tx.medicalLock.create.mockRejectedValue(new Error('DB down'));
    await expect(
      new MedicalLifecycleService(audit).placeIncidentLock(tx, 'inc', actor),
    ).rejects.toThrow('DB down');
    expect(tx.horse.update).not.toHaveBeenCalled();
  });
});
