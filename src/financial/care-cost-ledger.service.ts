import { HttpStatus, Injectable } from '@nestjs/common';
import { DailyCareTask, Prisma, SupplyCatalog } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';

const aliases: Record<string, string> = {
  KG: 'KG',
  G: 'G',
  L: 'LITER',
  LITER: 'LITER',
  ML: 'ML',
  PILL: 'PILL',
  TABLET: 'PILL',
  TABLETS: 'PILL',
  PACKET: 'PACKET',
  SACHET: 'PACKET',
  SACHETS: 'PACKET',
  BOTTLE: 'BOTTLE',
  BOTTLES: 'BOTTLE',
  VIAL: 'VIAL',
  VIALS: 'VIAL',
  PIECE: 'PIECE',
  PIECES: 'PIECE',
  SET: 'SET',
  SETS: 'SET',
};
const reconcile = (message: string) =>
  apiError(HttpStatus.CONFLICT, 'MEDICAL_USAGE_RECONCILIATION_REQUIRED', message);
export function usageSnapshot(
  item: { supplyId?: unknown; amount?: unknown; unit?: unknown },
  supply: Pick<SupplyCatalog, 'id' | 'name' | 'unit' | 'unitPrice' | 'isActive'>,
) {
  if (!item.supplyId || item.supplyId !== supply.id || !supply.isActive)
    throw reconcile('Select a verified active supply before recording actual usage.');
  let quantity: Prisma.Decimal;
  try {
    quantity = new Prisma.Decimal(String(item.amount));
  } catch {
    throw reconcile('Actual usage quantity is invalid.');
  }
  if (
    !quantity.isFinite() ||
    quantity.lte(0) ||
    quantity.decimalPlaces() > 6 ||
    quantity.gte('1000000000000')
  )
    throw reconcile('Actual usage must be positive and have at most six decimal places.');
  const unit =
    aliases[
      String(item.unit ?? '')
        .trim()
        .toUpperCase()
    ];
  if (!unit || unit !== supply.unit)
    throw reconcile(
      'Prescription and inventory units must match. No dose-to-vial conversion is configured.',
    );
  const price = new Prisma.Decimal(supply.unitPrice);
  if (!price.isFinite() || price.lte(0))
    throw reconcile('The manager must configure a positive unit price for this supply.');
  const amount = quantity.mul(price).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  if (amount.gt(Number.MAX_SAFE_INTEGER))
    throw reconcile('Usage amount exceeds the supported invoice limit.');
  return { quantity, unit, unitPriceSnapshot: price, amount, supplyName: supply.name };
}

@Injectable()
export class CareCostLedgerService {
  /** Caller holds Horse and DailyCareTask row locks. Stock, task and entry commit together. */
  async consumeMedication(
    tx: Prisma.TransactionClient,
    task: Pick<DailyCareTask, 'id' | 'horseId' | 'itemsSnapshotJson' | 'completionVersion'>,
    zoneId: string | null,
    actorId: string,
    performedAt: Date,
  ) {
    const items = Array.isArray(task.itemsSnapshotJson) ? task.itemsSnapshotJson : [];
    if (!zoneId || !items.length)
      throw reconcile(
        'This medication task requires a verified stock zone and prescription source.',
      );
    const lines: Array<{
      item: Record<string, unknown>;
      record: Prisma.MedicalRecordGetPayload<{
        include: { veterinarian: { select: { fullName: true } } };
      }>;
      snapshot: ReturnType<typeof usageSnapshot>;
    }> = [];
    for (const raw of items) {
      const item = raw as Record<string, unknown>;
      if (
        !item ||
        typeof item.supplyId !== 'string' ||
        typeof item.medicalRecordId !== 'string' ||
        typeof item.prescriptionId !== 'string'
      )
        throw reconcile(
          'Legacy medication task has no verified supply/record/prescription IDs. Ask the veterinarian to reconcile it.',
        );
      await tx.$queryRaw`SELECT "id" FROM "MedicalRecord" WHERE "id" = ${item.medicalRecordId} FOR SHARE`;
      const record = await tx.medicalRecord.findUnique({
        where: { id: item.medicalRecordId },
        include: { veterinarian: { select: { fullName: true } } },
      });
      if (!record || record.horseId !== task.horseId || record.status !== 'OPEN')
        throw reconcile('The medication record is no longer open for this horse.');
      let prescriptions: Record<string, unknown>[];
      try {
        prescriptions = JSON.parse(record.prescriptions ?? '[]');
      } catch {
        throw reconcile('Prescription source is malformed.');
      }
      const prescription = Array.isArray(prescriptions)
        ? prescriptions.find((rx) => rx.id === item.prescriptionId)
        : undefined;
      if (
        !prescription ||
        prescription.status !== 'ACTIVE' ||
        prescription.supplyId !== item.supplyId ||
        String(prescription.dosage) !== String(item.amount) ||
        aliases[String(prescription.unit ?? '').toUpperCase()] !==
          aliases[String(item.unit ?? '').toUpperCase()]
      )
        throw reconcile(
          'The prescription changed. Refresh the task before recording administration.',
        );
      const date = new Date(+performedAt + 7 * 3600000).toISOString().slice(0, 10);
      if (
        (prescription.startDate && date < String(prescription.startDate).slice(0, 10)) ||
        (prescription.endDate && date > String(prescription.endDate).slice(0, 10))
      )
        throw reconcile('This prescription is outside its administration dates.');
      const supply = await tx.supplyCatalog.findUnique({ where: { id: item.supplyId } });
      if (!supply) throw reconcile('The prescription supply no longer exists.');
      lines.push({ item, record, snapshot: usageSnapshot(item, supply) });
    }
    // Deterministic stock lock order prevents two multi-supply tasks acquiring opposite rows.
    lines.sort(
      (a, b) =>
        String(a.item.supplyId).localeCompare(String(b.item.supplyId)) ||
        String(a.item.prescriptionId).localeCompare(String(b.item.prescriptionId)),
    );
    const seen = new Set<string>();
    for (const { item, record, snapshot } of lines) {
      const lineId = `${item.medicalRecordId}:${item.prescriptionId}:${item.supplyId}`;
      if (seen.has(lineId)) throw reconcile('Duplicate supply line in medication task.');
      seen.add(lineId);
      const stock = await tx.stockBalance.updateMany({
        where: { zoneId, supplyId: String(item.supplyId), quantity: { gte: snapshot.quantity } },
        data: { quantity: { decrement: snapshot.quantity } },
      });
      if (stock.count !== 1)
        throw apiError(
          HttpStatus.CONFLICT,
          'INSUFFICIENT_STOCK',
          'Insufficient stock. Task and cost entry were not recorded.',
        );
      const prescription = (
        JSON.parse(record.prescriptions ?? '[]') as Array<{ id: string; createdAt?: string }>
      ).find((rx) => rx.id === item.prescriptionId);
      const prescribedAt = prescription?.createdAt
        ? new Date(prescription.createdAt)
        : record.examinationDate;
      if (!Number.isFinite(+prescribedAt)) throw reconcile('Prescription date must be reconciled.');
      await tx.careCostEntry.create({
        data: {
          ...snapshot,
          operationKey: `${task.id}:${task.completionVersion}:${lineId}:CONSUMPTION`,
          horseId: task.horseId,
          medicalRecordId: record.id,
          prescriptionId: String(item.prescriptionId),
          sourceTaskId: task.id,
          completionVersion: task.completionVersion,
          supplyId: String(item.supplyId),
          stockZoneId: zoneId,
          performedAt,
          prescribedAt,
          entryType: 'CONSUMPTION',
          actorId,
          recordNumber: record.recordNumber,
          veterinarianName: record.veterinarian.fullName,
        },
      });
    }
  }

  async reverseMedication(
    tx: Prisma.TransactionClient,
    task: Pick<DailyCareTask, 'id' | 'completionVersion'>,
    actorId: string,
    at: Date,
  ) {
    const entries = await tx.careCostEntry.findMany({
      where: {
        sourceTaskId: task.id,
        completionVersion: task.completionVersion,
        entryType: 'CONSUMPTION',
      },
      orderBy: { supplyId: 'asc' },
    });
    if (!entries.length)
      throw reconcile(
        'Historical medication usage has no stock/price snapshot. Reconcile it instead of guessing a reversal.',
      );
    for (const entry of entries) {
      const { id, ...data } = entry;
      if (!entry.stockZoneId || !entry.supplyId)
        throw reconcile('Original stock source is missing.');
      await tx.careCostEntry.create({
        data: {
          ...data,
          createdAt: at,
          operationKey: `${entry.operationKey}:REVERSAL`,
          entryType: 'REVERSAL',
          reversesEntryId: id,
          actorId,
          performedAt: at,
          quantity: entry.quantity.negated(),
          amount: entry.amount.negated(),
        },
      });
      await tx.stockBalance.update({
        where: { zoneId_supplyId: { zoneId: entry.stockZoneId, supplyId: entry.supplyId } },
        data: { quantity: { increment: entry.quantity } },
      });
    }
  }
}
