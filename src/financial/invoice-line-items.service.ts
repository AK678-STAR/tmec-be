import { CareCostEntry, Prisma } from '@prisma/client';

export function invoiceUsageSnapshot(entries: CareCostEntry[]) {
  const medicalFee = entries.reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
  if (medicalFee.abs().gt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Invoice usage total exceeds the supported exact monetary range.');
  const lines = entries.map((entry) => ({
    careCostEntryId: entry.id,
    entryType: entry.entryType,
    recordNumber: entry.recordNumber,
    medicalRecordId: entry.medicalRecordId,
    prescribedAt: entry.prescribedAt,
    performedAt: entry.performedAt,
    veterinarianName: entry.veterinarianName,
    supplyName: entry.supplyName,
    quantity: new Prisma.Decimal(entry.quantity),
    unit: entry.unit,
    unitPrice: new Prisma.Decimal(entry.unitPriceSnapshot),
    amount: new Prisma.Decimal(entry.amount),
  }));
  return { medicalFee, lines };
}

export class InvoiceLineItemsService {
  /** Caller holds Horse FOR UPDATE; only unclaimed entries can enter a new invoice. */
  async available(
    tx: Prisma.TransactionClient,
    horseId: string,
    start: Date,
    end: Date,
    cutoverPeriod: string,
  ) {
    const entries = await tx.careCostEntry.findMany({
      where: {
        horseId,
        claim: { is: null },
        performedAt: { gte: new Date(`${cutoverPeriod}-01T00:00:00+07:00`), lt: end },
        OR: [
          { performedAt: { gte: start } },
          { entryType: 'REVERSAL', reversesEntry: { claim: { isNot: null } } },
        ],
      },
      orderBy: [{ performedAt: 'asc' }, { id: 'asc' }],
    });
    return { ...invoiceUsageSnapshot(entries), entries };
  }
  async claim(tx: Prisma.TransactionClient, invoiceId: string, entries: CareCostEntry[]) {
    if (entries.length)
      await tx.careCostClaim.createMany({
        data: entries.map((entry) => ({ invoiceId, careCostEntryId: entry.id })),
      });
  }
}
