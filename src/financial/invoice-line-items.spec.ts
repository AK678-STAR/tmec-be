import { Prisma } from '@prisma/client';
import { invoiceUsageSnapshot } from './invoice-line-items.service';
describe('immutable usage invoice lines', () => {
  it('totals actual usage without adding the legacy medical package', () => {
    const entries = [600000, 90000, 100000, 500000].map((amount, i) => ({
      id: `entry-${i}`,
      amount: new Prisma.Decimal(amount),
      quantity: new Prisma.Decimal(i === 3 ? 1 : 2),
      unitPriceSnapshot: new Prisma.Decimal(amount / (i === 3 ? 1 : 2)),
      entryType: i === 3 ? 'EXAM' : 'CONSUMPTION',
      performedAt: new Date('2026-11-01T01:00Z'),
      prescribedAt: new Date('2026-10-31T01:00Z'),
      supplyName: 'QA medicine',
      unit: 'PILL',
      medicalRecordId: 'record',
      recordNumber: 'BA-QA',
      veterinarianName: 'QA Vet',
    }));
    const result = invoiceUsageSnapshot(entries as any);
    expect(result.medicalFee.toString()).toBe('1290000');
    expect(result.lines).toHaveLength(4);
    expect(result.lines[0].prescribedAt).not.toEqual(result.lines[0].performedAt);
    entries[0].amount = new Prisma.Decimal(0);
    expect(result.lines[0].amount.toString()).toBe('600000');
  });
  it('retains negative adjustment lines and original source references', () => {
    const result = invoiceUsageSnapshot([
      {
        id: 'reversal',
        amount: new Prisma.Decimal(-90000),
        quantity: new Prisma.Decimal(-1),
        unitPriceSnapshot: new Prisma.Decimal(90000),
        entryType: 'REVERSAL',
        performedAt: new Date(),
        supplyName: 'Corrected accidental completion',
        unit: 'PILL',
      },
    ] as any);
    expect(result.medicalFee.toString()).toBe('-90000');
    expect(result.lines[0].careCostEntryId).toBe('reversal');
  });
});
