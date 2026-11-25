import { randomInt } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/exceptions/api-error';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { DemoArgs } from '../demo-data.catalog';

export async function createDemoHorse(
  tx: Prisma.TransactionClient,
  args: DemoArgs,
  id: string,
  now: Date,
) {
  const owner = await tx.user.findUnique({ where: { id: args.ownerId } });
  if (
    !owner ||
    owner.role !== 'HORSE_OWNER' ||
    owner.status !== 'ACTIVE' ||
    owner.isBadDebtFlagged
  ) {
    throw apiError(
      HttpStatus.CONFLICT,
      'RESOURCE_UNAVAILABLE',
      'Chủ ngựa không còn đủ điều kiện đăng ký. Hãy chọn lại.',
    );
  }
  const [breed, color] = await Promise.all([
    tx.horseCatalogItem.findFirst({
      where: { type: 'BREED', isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    tx.horseCatalogItem.findFirst({
      where: { type: 'COLOR', isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);
  if (!breed || !color)
    throw apiError(
      HttpStatus.CONFLICT,
      'RESOURCE_UNAVAILABLE',
      'Thiếu danh mục giống hoặc màu lông hợp lệ.',
    );
  const dob = new Date(now);
  dob.setUTCFullYear(dob.getUTCFullYear() - 5);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const counter = await tx.counter.upsert({
      where: { name: 'horse_code' },
      create: { name: 'horse_code', value: 1 },
      update: { value: { increment: 1 } },
    });
    const horseCode = `HR-${String(counter.value).padStart(6, '0')}`;
    if (await tx.horse.findUnique({ where: { horseCode } })) continue;
    const microchip = `985${String(randomInt(0, 1_000_000_000_000)).padStart(12, '0')}`;
    if (await tx.horse.findFirst({ where: { OR: [{ microchip }, { microchipRfid: microchip }] } }))
      continue;
    return tx.horse.create({
      data: {
        id,
        horseCode,
        name: `DEMO ${args.horseName}`,
        microchip,
        microchipRfid: microchip,
        breed: breed.name,
        color: color.name,
        dob,
        gender: 'Stallion',
        weightKg: 490,
        ownerId: args.ownerId,
        status: 'PENDING_ADMISSION',
      },
    });
  }
  throw apiError(
    HttpStatus.CONFLICT,
    'DEMO_GENERATION_CONFLICT',
    'Chưa sinh được mã ngựa duy nhất. Vui lòng thử lại sau.',
  );
}

export async function createDemoAdmission(
  tx: Prisma.TransactionClient,
  args: DemoArgs,
  horse: { id: string; microchip: string | null },
  actor: CurrentUserPayload,
  now: Date,
) {
  const year = new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCFullYear();
  const name = `admission_code_${year}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const counter = await tx.counter.upsert({
      where: { name },
      create: { name, value: 1 },
      update: { value: { increment: 1 } },
    });
    const admissionCode = `ADM-${year}-${String(counter.value).padStart(3, '0')}`;
    if (await tx.horseAdmissionRecord.findUnique({ where: { admissionCode } })) continue;
    return tx.horseAdmissionRecord.create({
      data: {
        admissionCode,
        horseId: horse.id,
        ownerId: args.ownerId,
        declaredMicrochip: horse.microchip,
        status: 'PENDING_VERIFICATION',
        legalDocumentsNote: '[DEMO] Dữ liệu mẫu, chưa xác minh giấy tờ.',
        history: {
          create: {
            toStatus: 'PENDING_VERIFICATION',
            actorUserId: actor.userId,
            actorName: actor.fullName,
            note: '[DEMO] Quản lý chuẩn bị hồ sơ mẫu; chưa đặt lịch hoặc duyệt tiếp nhận.',
          },
        },
      },
      include: { history: true },
    });
  }
  throw apiError(
    HttpStatus.CONFLICT,
    'DEMO_GENERATION_CONFLICT',
    'Chưa sinh được mã tiếp nhận duy nhất.',
  );
}

export async function createAdmissionPending(
  tx: Prisma.TransactionClient,
  args: DemoArgs,
  id: string,
  actor: CurrentUserPayload,
  now: Date,
) {
  const horse = await createDemoHorse(tx, args, id, now);
  const admission = await createDemoAdmission(tx, args, horse, actor, now);
  return {
    horseId: horse.id,
    records: [
      { entity: 'Horse', ids: [horse.id] },
      { entity: 'HorseAdmissionRecord', ids: [admission.id] },
      { entity: 'AdmissionHistoryLog', ids: admission.history.map((log) => log.id) },
    ],
    links: [{ label: 'Xem ngựa vừa tạo', path: `/horses/${horse.id}` }],
    warnings: ['[DEMO] Hồ sơ chưa thẩm định; không có giấy tờ pháp lý thật.'],
  };
}
