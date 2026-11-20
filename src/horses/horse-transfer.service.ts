import { HttpStatus, Injectable } from '@nestjs/common';
import { HorseStatus, HorseTransferStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransferHorseOwnerDto } from './dto/transfer-owner.dto';

const person = { select: { id: true, fullName: true, email: true } };
const REQUEST_INCLUDE = {
  // Tóm tắt tình trạng + vòng đời để chủ mới biết mình sắp nhận con ngựa thế nào.
  horse: {
    select: {
      id: true,
      name: true,
      horseCode: true,
      breed: true,
      gender: true,
      dob: true,
      color: true,
      avatarUrl: true,
      status: true,
      isMedicalLocked: true,
      isDebtImpounded: true,
      createdAt: true,
      _count: {
        select: {
          medicalRecords: true,
          injuryLogs: true,
          workoutSessions: true,
          tournamentRegistrations: true,
          incidents: true,
        },
      },
    },
  },
  fromOwner: person,
  toOwner: person,
  requestedBy: person,
} satisfies Prisma.HorseTransferRequestInclude;

type Tx = Prisma.TransactionClient | PrismaService;

/**
 * Chuyển nhượng ngựa có xác nhận: Club Manager tạo yêu cầu, chủ hiện tại và chủ mới
 * cùng đồng ý thì mới đổi chủ. Một bên từ chối là yêu cầu bị hủy.
 */
@Injectable()
export class HorseTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Kiểm điều kiện chuyển nhượng; gọi cả lúc tạo yêu cầu và lúc chốt (trạng thái có thể đã đổi). */
  private async assertTransferable(db: Tx, horseId: string, newOwnerId: string) {
    const horse = await db.horse.findUnique({ where: { id: horseId, deletedAt: null } });
    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse profile not found.');
    }
    if (horse.status === HorseStatus.RETIRED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HORSE_RETIRED',
        'Cannot transfer ownership of a retired horse. Please reactivate the horse profile first.',
      );
    }
    if (horse.isDebtImpounded) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DEBT_IMPOUNDED',
        'Ngựa đang bị lưu giữ do nợ phí quá hạn. Không thể chuyển nhượng hoặc xuất chuồng.',
      );
    }
    if (horse.ownerId === newOwnerId) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ALREADY_OWNED',
        'Horse is already assigned to this owner.',
      );
    }
    const newOwner = await db.user.findUnique({
      where: { id: newOwnerId },
      select: { id: true, fullName: true, role: true, status: true, isBadDebtFlagged: true },
    });
    if (!newOwner || newOwner.role !== Role.HORSE_OWNER) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_NEW_OWNER',
        'The specified account does not exist or is not registered as a Horse Owner.',
      );
    }
    if (newOwner.isBadDebtFlagged) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'OWNER_BAD_DEBT',
        'Chủ ngựa mới đang bị đánh dấu nợ xấu. Không thể tiếp nhận chuyển nhượng.',
      );
    }
    if (newOwner.status !== UserStatus.ACTIVE) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INACTIVE_OWNER',
        'New owner account is not currently active.',
      );
    }
    return { horse, newOwner };
  }

  /** Club Manager tạo yêu cầu chuyển nhượng và báo cho hai chủ ngựa. */
  async requestTransfer(horseId: string, dto: TransferHorseOwnerDto, user: CurrentUserPayload) {
    const { horse, newOwner } = await this.assertTransferable(this.prisma, horseId, dto.newOwnerId);
    const open = await this.prisma.horseTransferRequest.findFirst({
      where: { horseId, status: HorseTransferStatus.PENDING },
    });
    if (open) {
      throw apiError(
        HttpStatus.CONFLICT,
        'TRANSFER_PENDING',
        'This horse already has a transfer request waiting for confirmation.',
      );
    }

    const request = await this.prisma.horseTransferRequest.create({
      data: {
        horseId,
        fromOwnerId: horse.ownerId,
        toOwnerId: newOwner.id,
        requestedById: user.userId,
        reason: dto.reason?.trim() || null,
      },
      include: REQUEST_INCLUDE,
    });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_TRANSFER_REQUESTED',
      `Requested transfer of horse ${horse.name} (${horse.horseCode || horse.id}) to ${newOwner.fullName}. Reason: ${dto.reason || 'None specified'}`,
      horse.id,
      {
        entityName: 'Horse',
        newValues: { transferRequestId: request.id, toOwnerId: newOwner.id, reason: dto.reason },
      },
    );
    await this.notifications.notifyUsers([horse.ownerId, newOwner.id], {
      type: 'HORSE_TRANSFER_REQUESTED',
      category: 'HORSE',
      title: 'Horse transfer needs your confirmation',
      message: `The club requested to transfer ${horse.name} to ${newOwner.fullName}. Please confirm or decline.`,
      params: { horse: horse.name, owner: newOwner.fullName },
      link: '/horse-transfers',
      senderName: user.fullName,
    });
    return request;
  }

  /** Danh sách yêu cầu: Club Manager thấy tất cả, chủ ngựa chỉ thấy yêu cầu liên quan đến mình. */
  async list(user: CurrentUserPayload, status?: HorseTransferStatus) {
    const where: Prisma.HorseTransferRequestWhereInput = status ? { status } : {};
    if (user.role === UserRole.HORSE_OWNER) {
      where.OR = [{ fromOwnerId: user.userId }, { toOwnerId: user.userId }];
    } else if (user.role !== UserRole.CLUB_MANAGER) {
      throw apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Not allowed');
    }
    return this.prisma.horseTransferRequest.findMany({
      where,
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async loadPending(id: string) {
    const request = await this.prisma.horseTransferRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) {
      throw apiError(HttpStatus.NOT_FOUND, 'TRANSFER_NOT_FOUND', 'Transfer request not found.');
    }
    if (request.status !== HorseTransferStatus.PENDING) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'TRANSFER_CLOSED',
        'This transfer request is no longer waiting for confirmation.',
      );
    }
    return request;
  }

  /** Chủ cũ hoặc chủ mới đồng ý / từ chối. Đủ hai bên đồng ý thì đổi chủ ngay. */
  async respond(id: string, accept: boolean, note: string | undefined, user: CurrentUserPayload) {
    const request = await this.loadPending(id);
    const isFrom = request.fromOwnerId === user.userId;
    const isTo = request.toOwnerId === user.userId;
    if (!isFrom && !isTo) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'NOT_TRANSFER_PARTY',
        'Only the current or the new owner can respond to this transfer.',
      );
    }
    const horseName = request.horse.name;

    if (!accept) {
      const rejected = await this.prisma.horseTransferRequest.update({
        where: { id },
        data: {
          status: HorseTransferStatus.REJECTED,
          rejectedById: user.userId,
          rejectReason: note?.trim() || null,
          decidedAt: new Date(),
        },
        include: REQUEST_INCLUDE,
      });
      await this.auditService.record(
        { id: user.userId, name: user.fullName || user.email },
        'HORSE_TRANSFER_REJECTED',
        `Declined transfer of horse ${horseName}. Reason: ${note || 'None specified'}`,
        request.horseId,
        { entityName: 'Horse', newValues: { transferRequestId: id } },
      );
      await this.notifications.notifyUsers(
        [request.requestedById, request.fromOwnerId, request.toOwnerId],
        {
          type: 'HORSE_TRANSFER_REJECTED',
          category: 'HORSE',
          title: 'Horse transfer declined',
          message: `${user.fullName || user.email} declined the transfer of ${horseName}.`,
          params: { horse: horseName, name: user.fullName || user.email },
          link: '/horse-transfers',
        },
        user.userId,
      );
      return rejected;
    }

    const now = new Date();
    const fromConfirmedAt = isFrom ? (request.fromConfirmedAt ?? now) : request.fromConfirmedAt;
    const toConfirmedAt = isTo ? (request.toConfirmedAt ?? now) : request.toConfirmedAt;
    // Ngựa chưa có chủ thì chỉ cần chủ mới đồng ý.
    const complete = (!request.fromOwnerId || fromConfirmedAt) && toConfirmedAt;

    if (!complete) {
      return this.prisma.horseTransferRequest.update({
        where: { id },
        data: { fromConfirmedAt, toConfirmedAt },
        include: REQUEST_INCLUDE,
      });
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      // Khóa dòng ngựa để hai lần xác nhận cùng lúc không chốt hai lần.
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${request.horseId} FOR UPDATE`;
      const fresh = await tx.horseTransferRequest.findUnique({ where: { id } });
      if (fresh?.status !== HorseTransferStatus.PENDING) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'TRANSFER_CLOSED',
          'This transfer request is no longer waiting for confirmation.',
        );
      }
      const { horse } = await this.assertTransferable(tx, request.horseId, request.toOwnerId);
      if (horse.ownerId !== request.fromOwnerId) {
        throw apiError(
          HttpStatus.CONFLICT,
          'OWNER_CHANGED',
          'The horse owner changed after this request was created. Please create a new request.',
        );
      }
      await tx.horse.update({
        where: { id: request.horseId },
        data: { ownerId: request.toOwnerId },
      });
      return tx.horseTransferRequest.update({
        where: { id },
        data: {
          fromConfirmedAt,
          toConfirmedAt,
          status: HorseTransferStatus.APPROVED,
          decidedAt: now,
        },
        include: REQUEST_INCLUDE,
      });
    });

    const previousOwnerName = request.fromOwner?.fullName ?? 'Unassigned';
    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_OWNERSHIP_TRANSFERRED',
      `Transferred ownership of horse ${horseName} (${request.horse.horseCode || request.horseId}) from ${previousOwnerName} to ${request.toOwner.fullName} after both owners confirmed. Reason: ${request.reason || 'None specified'}`,
      request.horseId,
      {
        entityName: 'Horse',
        oldValues: { ownerId: request.fromOwnerId, ownerName: previousOwnerName },
        newValues: {
          ownerId: request.toOwnerId,
          ownerName: request.toOwner.fullName,
          reason: request.reason,
          transferRequestId: id,
        },
      },
    );
    await this.notifications.notifyUsers([request.toOwnerId], {
      type: 'HORSE_OWNER_ASSIGNED',
      category: 'HORSE',
      title: 'A horse was assigned to you',
      message: `You are now the registered owner of ${horseName}.`,
      params: { horse: horseName },
      link: `/horses/${request.horseId}`,
    });
    await this.notifications.notifyUsers([request.requestedById, request.fromOwnerId], {
      type: 'HORSE_TRANSFER_APPROVED',
      category: 'HORSE',
      title: 'Horse transfer completed',
      message: `${horseName} now belongs to ${request.toOwner.fullName}.`,
      params: { horse: horseName, owner: request.toOwner.fullName },
      link: '/horse-transfers',
    });
    return approved;
  }

  /** Club Manager rút lại yêu cầu chưa được chốt. */
  async cancel(id: string, user: CurrentUserPayload) {
    const request = await this.loadPending(id);
    const cancelled = await this.prisma.horseTransferRequest.update({
      where: { id },
      data: { status: HorseTransferStatus.CANCELLED, decidedAt: new Date() },
      include: REQUEST_INCLUDE,
    });
    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_TRANSFER_CANCELLED',
      `Cancelled transfer request of horse ${request.horse.name}.`,
      request.horseId,
      { entityName: 'Horse', newValues: { transferRequestId: id } },
    );
    await this.notifications.notifyUsers([request.fromOwnerId, request.toOwnerId], {
      type: 'HORSE_TRANSFER_CANCELLED',
      category: 'HORSE',
      title: 'Horse transfer cancelled',
      message: `The club cancelled the transfer request for ${request.horse.name}.`,
      params: { horse: request.horse.name },
      link: '/horse-transfers',
    });
    return cancelled;
  }
}
