import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';

export const availableAdmissionStalls: Prisma.StallWhereInput = {
  status: 'AVAILABLE',
  allocations: { none: { isActive: true } },
  OR: [{ zoneId: null }, { zoneRef: { isActive: true } }],
};

export async function assertAdmissionCapacity(tx: Prisma.TransactionClient) {
  if (!(await tx.stall.count({ where: availableAdmissionStalls }))) {
    throw apiError(
      HttpStatus.CONFLICT,
      'ADMISSION_NO_STALL',
      'CLB hiện đã hết chuồng trống. Vui lòng hoãn thẩm định và liên hệ chủ ngựa để hẹn lại.',
    );
  }
}

export async function lockAdmissionStall(tx: Prisma.TransactionClient, stallId?: string) {
  // Lock Stall before Horse, matching the existing stall-assignment transaction.
  const stalls = await tx.$queryRaw<Array<{ id: string; code: string }>>`
    SELECT s."id", s."code" FROM "Stall" s
    LEFT JOIN "StallZone" z ON z."id" = s."zoneId"
    WHERE s."status" = 'AVAILABLE' AND (${stallId ?? null}::text IS NULL OR s."id" = ${stallId ?? null}) AND (s."zoneId" IS NULL OR z."isActive" = true)
      AND NOT EXISTS (SELECT 1 FROM "StallAllocation" a WHERE a."stallId" = s."id" AND a."isActive" = true)
    ORDER BY s."code" LIMIT 1 FOR UPDATE OF s SKIP LOCKED`;
  if (!stalls.length) {
    throw apiError(
      HttpStatus.CONFLICT,
      'ADMISSION_NO_STALL',
      'Không còn ô chuồng có thể tiếp nhận. Vui lòng tải lại và hẹn chủ ngựa vào ngày khác.',
    );
  }
  return stalls[0];
}
