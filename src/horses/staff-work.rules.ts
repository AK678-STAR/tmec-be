import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';

export function workInterval(start: string | Date, end: string | Date) {
  const startsAt = new Date(start);
  const endsAt = new Date(end);
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    endsAt <= startsAt ||
    endsAt.getTime() - startsAt.getTime() > 24 * 3600000
  ) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'INVALID_WORK_INTERVAL',
      'Giờ kết thúc phải sau giờ bắt đầu và công việc không được dài quá 24 giờ.',
    );
  }
  return { startsAt, endsAt };
}

export async function assertStaffAvailable(
  tx: Prisma.TransactionClient,
  userIds: string[],
  startsAt: Date,
  endsAt: Date,
  ignore: { admissionId?: string; workId?: string } = {},
) {
  const ids = [...new Set(userIds)].sort();
  // Every writer locks the same staff rows before checking overlapping appointments.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  const [work, admissions] = await Promise.all([
    tx.staffWorkItem.findFirst({
      where: {
        ...(ignore.workId && { id: { not: ignore.workId } }),
        userId: { in: ids },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    }),
    tx.horseAdmissionRecord.findMany({
      where: {
        ...(ignore.admissionId && { id: { not: ignore.admissionId } }),
        status: { in: ['APPOINTED', 'INSPECTION_IN_PROGRESS'] },
        appointmentDate: { lt: endsAt },
        OR: [{ managerUserId: { in: ids } }, { veterinarianUserId: { in: ids } }],
      },
      select: { appointmentDate: true, appointmentEndDate: true },
    }),
  ]);
  if (
    work ||
    admissions.some(
      (a) =>
        a.appointmentDate &&
        (a.appointmentEndDate ?? new Date(a.appointmentDate.getTime() + 3600000)) > startsAt,
    )
  ) {
    throw apiError(
      HttpStatus.CONFLICT,
      'STAFF_SCHEDULE_CONFLICT',
      'Người tham gia đã có công việc trong khoảng giờ này. Vui lòng chọn giờ hoặc người phụ trách khác.',
    );
  }
}
