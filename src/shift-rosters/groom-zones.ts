import { Prisma } from '@prisma/client';
import { clubDate } from '../training/training-rules';

type RosterDelegate = {
  findMany(args: {
    where: Prisma.ShiftRosterWhereInput;
    select: { zoneId: true; groomUserId?: true };
  }): Promise<{ zoneId: string; groomUserId?: string }[]>;
};

type RosterReader = {
  shiftRoster?: RosterDelegate;
  groomAssignment?: RosterDelegate;
};

/** Ngày CLB (UTC+7) dạng cột @db.Date của ShiftRoster. */
export function rosterDay(at = new Date()): Date {
  return new Date(`${clubDate(at)}T00:00:00.000Z`);
}

/**
 * #1: Groom chỉ quản lý khu chuồng mình được phân ca trong ngày (mọi ca của hôm nay).
 * Không có ca hôm nay thì không thấy ngựa nào.
 */
export async function groomZoneIds(
  prisma: RosterReader | any,
  groomUserId: string,
  at = new Date(),
): Promise<string[]> {
  const delegate: RosterDelegate | undefined = prisma?.shiftRoster ?? prisma?.groomAssignment;
  if (!delegate?.findMany || typeof delegate.findMany !== 'function') {
    return [];
  }
  const rows = await delegate.findMany({
    where: { groomUserId, date: rosterDay(at) },
    select: { zoneId: true },
  });
  return [...new Set((rows || []).map((r: any) => r.zoneId))];
}

/** Điều kiện lọc ngựa đang ở một trong các khu. */
export function horsesInZones(zoneIds: string[]): Prisma.HorseWhereInput {
  return { stallAllocations: { some: { isActive: true, stall: { zoneId: { in: zoneIds } } } } };
}

/** Groom đang trực hôm nay ở khu của ngựa (người nhận thông báo về ngựa). */
export async function zoneGroomIds(
  prisma: RosterReader | any,
  zoneId: string | null | undefined,
  at = new Date(),
): Promise<string[]> {
  if (!zoneId) return [];
  const delegate: RosterDelegate | undefined = prisma?.shiftRoster ?? prisma?.groomAssignment;
  if (!delegate?.findMany || typeof delegate.findMany !== 'function') {
    return [];
  }
  const rows = await delegate.findMany({
    where: { zoneId, date: rosterDay(at) },
    select: { zoneId: true, groomUserId: true },
  });
  return [...new Set((rows || []).map((r: any) => r.groomUserId as string))];
}
