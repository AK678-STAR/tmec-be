import { Prisma } from '@prisma/client';
import { usageSnapshot, CareCostLedgerService } from './care-cost-ledger.service';

describe('actual medical usage ledger', () => {
  const supply = {
    id: 'supply',
    name: 'Medicine',
    unit: 'PILL' as const,
    unitPrice: new Prisma.Decimal('90000'),
    isActive: true,
  };
  it('uses Decimal fractions and rounds VND once per line without changing catalog pricing', () => {
    const line = usageSnapshot({ supplyId: 'supply', amount: '0.125', unit: 'tablet' }, supply);
    expect(line.quantity.toString()).toBe('0.125');
    expect(line.amount.toString()).toBe('11250');
    expect(line.unitPriceSnapshot.toString()).toBe('90000');
    supply.unitPrice = new Prisma.Decimal('180000');
    expect(line.amount.toString()).toBe('11250');
    supply.unitPrice = new Prisma.Decimal('90000');
  });
  it.each([
    { amount: 1, unit: 'PILL' },
    { supplyId: 'supply', amount: 0, unit: 'PILL' },
    { supplyId: 'supply', amount: '0.0000001', unit: 'PILL' },
    { supplyId: 'supply', amount: 1, unit: 'mg' },
    { supplyId: 'supply', amount: 1, unit: 'VIAL' },
  ])('rejects unresolved, invalid or incompatible units: %j', (line) => {
    expect(() => usageSnapshot(line, supply)).toThrow();
  });
  it('requires task source provenance and never silently writes zero-priced history', async () => {
    const ledger = new CareCostLedgerService();
    await expect(
      ledger.consumeMedication(
        {} as any,
        {
          id: 'task',
          horseId: 'horse',
          completionVersion: 1,
          itemsSnapshotJson: [{ supplyName: 'Medicine', amount: 1, unit: 'PILL' }],
        } as any,
        'zone',
        'actor',
        new Date(),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
