import { IncidentsService } from './incidents.service';

describe('selected incident resolution', () => {
  const vet = { userId: 'v', fullName: 'Vet', role: 'VETERINARIAN' } as any;
  let db: any;
  let service: IncidentsService;
  beforeEach(() => {
    db = {
      $queryRaw: jest.fn(),
      incidentReport: {
        findUnique: jest.fn(async ({ where }) => ({
          id: where.id,
          horseId: 'h',
          status: 'REPORTED',
          createdAt: new Date(),
          reportedById: 'g',
          parentIncidentId: null,
        })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
      medicalRecord: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rec',
          horseId: 'h',
          status: 'CLOSED',
          treatmentResult: 'RECOVERED',
        }),
      },
      horse: {
        findUnique: jest.fn().mockResolvedValue({ id: 'h', status: 'INJURED' }),
        update: jest.fn(),
      },
      medicalLock: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    db.$transaction = jest.fn((fn) => fn(db));
    service = new IncidentsService(
      db,
      { record: jest.fn() } as any,
      { notifyUsers: jest.fn(), notifyHorse: jest.fn() } as any,
    );
  });
  it('requires confirmed recovery in a closed record before batch resolution', async () => {
    db.medicalRecord.findUnique.mockResolvedValue({ id: 'rec', horseId: 'h', status: 'OPEN' });
    await expect(
      (service as any).resolve(
        'main',
        { medicalRecordId: 'rec', duplicateIncidentIds: ['child'], recoveryConfirmed: true },
        vet,
      ),
    ).rejects.toThrow();
    expect(db.incidentReport.update).not.toHaveBeenCalled();
  });
  it('rejects a different horse rather than trusting client selected IDs', async () => {
    db.incidentReport.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      horseId: where.id === 'child' ? 'other' : 'h',
      status: 'REPORTED',
      createdAt: new Date(),
    }));
    await expect(
      (service as any).resolve(
        'main',
        { medicalRecordId: 'rec', duplicateIncidentIds: ['child'], recoveryConfirmed: true },
        vet,
      ),
    ).rejects.toThrow();
    expect(db.incidentReport.update).not.toHaveBeenCalled();
  });
  it('only merges selected reports and preserves their parent link', async () => {
    await (service as any).resolve(
      'main',
      { medicalRecordId: 'rec', duplicateIncidentIds: ['child'], recoveryConfirmed: true },
      vet,
    );
    expect(db.incidentReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'child' },
        data: expect.objectContaining({
          status: 'MERGED_INTO_TREATMENT',
          parentIncidentId: 'main',
          medicalRecordId: 'rec',
        }),
      }),
    );
    expect(db.incidentReport.update.mock.calls.map((c) => c[0].where.id)).toEqual([
      'main',
      'child',
    ]);
  });
});
