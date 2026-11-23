import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateTrainingTrackDto, UpdateTrainingTrackDto } from './dto/training-track.dto';
import { lockWorkoutSchedule, WorkoutAvailabilityService } from './workout-availability.service';

@Injectable()
export class TracksService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}
  list(includeInactive: boolean, actor: CurrentUserPayload) {
    if (!['CLUB_MANAGER', 'HEAD_TRAINER', 'VETERINARIAN', 'GROOM'].includes(actor.role))
      throw new ForbiddenException();
    return this.db.trainingTrack.findMany({
      where: includeInactive && actor.role === 'CLUB_MANAGER' ? {} : { isActive: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
  }
  async save(
    id: string | null,
    dto: CreateTrainingTrackDto | UpdateTrainingTrackDto,
    actor: CurrentUserPayload,
  ) {
    if (actor.role !== 'CLUB_MANAGER') throw new ForbiddenException();
    return this.db.$transaction(async (tx) => {
      await lockWorkoutSchedule(tx);
      if (id) {
        const track = await tx.trainingTrack.findUnique({ where: { id } });
        if (!track) throw new NotFoundException('TRACK_NOT_FOUND');
        if (
          (dto.surface !== undefined && dto.surface !== track.surface) ||
          (dto.capacity !== undefined && dto.capacity !== track.capacity) ||
          dto.isActive === false
        ) {
          if (
            await tx.workoutSession.count({
              where: { trackId: id, status: 'SCHEDULED', scheduledDate: { gte: new Date() } },
            })
          )
            throw new ConflictException(
              'TRACK_HAS_FUTURE_WORKOUTS: move or cancel its scheduled workouts before changing track safety settings.',
            );
        }
      }
      let track;
      try {
        track = id
          ? await tx.trainingTrack.update({ where: { id }, data: dto })
          : await tx.trainingTrack.create({ data: dto as CreateTrainingTrackDto });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002')
          throw new ConflictException('TRACK_CODE_EXISTS');
        throw error;
      }
      await this.audit.record(
        { id: actor.userId, name: actor.fullName },
        id ? 'UPDATE_TRAINING_TRACK' : 'CREATE_TRAINING_TRACK',
        `Track ${track.code}`,
        track.id,
        { entityName: 'TrainingTrack' },
        tx,
      );
      return track;
    });
  }
  async mapLegacy(id: string, workoutIds: string[], actor: CurrentUserPayload) {
    if (actor.role !== 'CLUB_MANAGER') throw new ForbiddenException();
    return this.db.$transaction(async (tx) => {
      await lockWorkoutSchedule(tx);
      const track = await tx.trainingTrack.findUnique({ where: { id } });
      if (!track?.isActive) throw new ConflictException('TRAINING_TRACK_UNAVAILABLE');
      const rows = await tx.workoutSession.findMany({
        where: { id: { in: workoutIds } },
        include: { trainingPlan: true },
      });
      if (
        rows.length !== workoutIds.length ||
        rows.some(
          (row) =>
            row.trackId ||
            !['SCHEDULED', 'BLOCKED'].includes(row.status) ||
            row.scheduledDate <= new Date() ||
            row.trackSurface !== track.surface,
        )
      )
        throw new ConflictException('INVALID_LEGACY_TRACK_MAPPING');
      await tx.workoutSession.updateMany({
        where: { id: { in: workoutIds }, trackId: null },
        data: { trackId: id },
      });
      for (const row of rows.filter((row) => row.status === 'SCHEDULED'))
        await new WorkoutAvailabilityService().validate(
          tx,
          {
            horseId: row.horseId,
            trainerUserId: row.trainingPlan.trainerUserId,
            scheduledDate: row.scheduledDate,
            workoutType: row.workoutType ?? 'TROT',
            intensity: row.intensity ?? 'MEDIUM',
            trackSurface: track.surface,
            trackId: id,
          },
          row.id,
        );
      await this.audit.record(
        { id: actor.userId, name: actor.fullName },
        'MAP_LEGACY_WORKOUT_TRACK',
        `Verified track ${track.code} for ${rows.length} future workouts`,
        id,
        { entityName: 'TrainingTrack', newValues: { workoutIds } },
        tx,
      );
      return { mapped: rows.length };
    });
  }
}
