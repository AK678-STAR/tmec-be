import { HttpStatus, Injectable } from '@nestjs/common';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { groomZoneIds } from '../shift-rosters/groom-zones';

/** Kiểm tra dùng chung của Flow 3: chỉ VET được ghi; OWNER/GROOM chỉ xem ngựa trong phạm vi. */
@Injectable()
export class MedicalAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Chỉ Bác sĩ thú y được ghi dữ liệu y tế (đã chốt: Club Manager chỉ xem). */
  assertVet(actor: CurrentUserPayload, action: string): void {
    if (actor.role !== Role.VETERINARIAN) {
      throw apiError(HttpStatus.FORBIDDEN, 'VET_ONLY', `Only a Veterinarian can ${action}.`);
    }
  }

  /**
   * Helper: verify horse access permissions based on role
   */
  async checkHorseAccess(horseId: string, currentUser: CurrentUserPayload): Promise<void> {
    if (
      currentUser.role === Role.CLUB_MANAGER ||
      currentUser.role === Role.HEAD_TRAINER ||
      currentUser.role === Role.VETERINARIAN
    ) {
      return;
    }

    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId, deletedAt: null },
      include: {
        stallAllocations: {
          where: { isActive: true },
          include: { stall: { select: { zoneId: true } } },
        },
      },
    });

    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse not found.');
    }

    if (currentUser.role === Role.HORSE_OWNER) {
      if (horse.ownerId !== currentUser.userId) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'HORSE_OUT_OF_SCOPE',
          'You can only view the medical file of your own horses.',
        );
      }
      return;
    }

    if (currentUser.role === Role.GROOM) {
      const zones = await groomZoneIds(this.prisma, currentUser.userId);
      const isAssigned = horse.stallAllocations.some(
        (allocation) => !!allocation.stall?.zoneId && zones.includes(allocation.stall.zoneId),
      );
      if (!isAssigned) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'HORSE_OUT_OF_SCOPE',
          'You can only view the medical file of horses in the zone you are on duty in.',
        );
      }
      return;
    }

    throw apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Access denied.');
  }
}
