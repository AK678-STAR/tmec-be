import { rosterDay } from '../shift-rosters/groom-zones';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DailyTaskType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryService } from '../inventory/inventory.service';
import { DailyTasksService } from './daily-tasks.service';

describe('DailyTasksService', () => {
  let service: DailyTasksService;
  let prisma: any;
  let auditService: any;
  let notifications: any;
  let inventoryService: any;

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((fn: any) => fn(prisma)),
      horse: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      stallAllocation: { findFirst: jest.fn().mockResolvedValue({ id: 'alloc' }) },
      shiftRoster: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      dailyCareTask: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn(),
      },
    };

    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      notifyHorse: jest.fn().mockResolvedValue(true),
      notifyRoles: jest.fn().mockResolvedValue(undefined),
      notifyUsers: jest.fn().mockResolvedValue(undefined),
    };
    inventoryService = {
      deductStockForFeeding: jest.fn().mockResolvedValue(undefined),
      deductStockForFeedingTask: jest.fn().mockResolvedValue(undefined),
      restoreStockForFeeding: jest.fn().mockResolvedValue(undefined),
      restoreStockForFeedingTask: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyTasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationsService, useValue: notifications },
        { provide: InventoryService, useValue: inventoryService },
      ],
    }).compile();

    service = module.get<DailyTasksService>(DailyTasksService);
  });

  describe('generateDailyTasksForDate', () => {
    it('preserves a completed legacy medication dose when RX source keys are introduced', async () => {
      prisma.horse.findMany.mockResolvedValue([
        {
          id: 'horse-1',
          name: 'QA',
          stallAllocations: [],
          medicalLocks: [],
          nutritionPlans: [],
          medicalRecords: [
            {
              id: 'record',
              prescriptions: JSON.stringify([
                {
                  id: 'rx',
                  status: 'ACTIVE',
                  supplyId: 'supply',
                  medicationName: 'QA medicine',
                  dosage: '1',
                  unit: 'tablets',
                  frequencyPerDay: 1,
                },
              ]),
            },
          ],
        },
      ]);
      prisma.dailyCareTask.findFirst.mockImplementation(async (args: any) =>
        typeof args.where?.taskCode === 'string' && args.where.taskCode.startsWith('RX-')
          ? null
          : { id: 'legacy', isCompleted: true, title: 'Cho uống thuốc: QA medicine' },
      );
      prisma.dailyCareTask.upsert = jest.fn().mockResolvedValue({ id: 'new-dose' });
      await service.generateDailyTasksForDate(new Date('2026-10-18'));
      expect(prisma.dailyCareTask.upsert).not.toHaveBeenCalled();
    });
    it('cancels discontinued medication tasks without deleting ledger source history', async () => {
      prisma.dailyCareTask.findMany
        .mockResolvedValueOnce([{ id: 'stopped', horseId: 'horse-1', title: 'Stopped medicine' }])
        .mockResolvedValue([]);
      await service.generateDailyTasksForDate(new Date('2026-10-18'));
      expect(prisma.dailyCareTask.delete).not.toHaveBeenCalled();
      expect(prisma.dailyCareTask.update).toHaveBeenCalledWith({
        where: { id: 'stopped', isCompleted: false },
        data: { cancelledAt: expect.any(Date) },
      });
    });
    it('generates standard cleaning, feeding, grooming and walking tasks for healthy horses', async () => {
      const mockHorse = {
        id: 'horse-1',
        name: 'Flash',
        deletedAt: null,
        isMedicalLocked: false,
        stallAllocations: [
          {
            isActive: true,
            assignedGroomUserId: 'groom-1',
            stall: { id: 'stall-1', zoneId: 'zone-1' },
          },
        ],
        medicalLocks: [],
        nutritionPlans: [
          {
            id: 'plan-1',
            status: 'APPROVED',
            mealsJson: [
              {
                mealType: 'MORNING',
                time: '06:00',
                items: [{ supplyName: 'Cỏ khô', amount: 3, unit: 'KG' }],
              },
            ],
          },
        ],
      };

      prisma.horse.findMany.mockResolvedValue([mockHorse]);
      prisma.shiftRoster.findMany.mockResolvedValue([]);
      prisma.dailyCareTask.findFirst.mockResolvedValue(null);
      prisma.dailyCareTask.create.mockResolvedValue({ id: 'task-new' });

      const result = await service.generateDailyTasksForDate(new Date('2026-10-18'));
      expect(result.horsesProcessed).toBe(1);
      expect(result.totalGenerated).toBeGreaterThanOrEqual(3);
      expect(prisma.dailyCareTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            horseId: 'horse-1',
            taskType: DailyTaskType.CLEANING,
          }),
        }),
      );
    });

    it('generates ICE_BOOT_REST tasks when specified in treatment phase care instructions', async () => {
      const mockLockedHorse = {
        id: 'horse-locked',
        name: 'Thunder',
        deletedAt: null,
        isMedicalLocked: true,
        stallAllocations: [],
        medicalLocks: [{ isLocked: true, lockReason: 'Vết thương cổ chân trái' }],
        nutritionPlans: [],
        medicalRecords: [
          {
            treatmentPhases: JSON.stringify([
              {
                startDate: '2026-10-10',
                endDate: '2026-10-25',
                careInstructions: [{ activity: 'Ngâm chân nước đá phục hồi', frequencyPerDay: 2 }],
              },
            ]),
          },
        ],
      };

      prisma.horse.findMany.mockResolvedValue([mockLockedHorse]);
      prisma.shiftRoster.findMany.mockResolvedValue([]);
      prisma.dailyCareTask.findFirst.mockResolvedValue(null);
      prisma.dailyCareTask.create.mockResolvedValue({ id: 'task-lock' });

      await service.generateDailyTasksForDate(new Date('2026-10-18'));

      expect(prisma.dailyCareTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            taskType: DailyTaskType.PHYSICAL_THERAPY,
            isMedicalLocked: true,
          }),
        }),
      );
    });

    it('guarantees idempotency by not recreating already existing tasks', async () => {
      const mockHorse = {
        id: 'horse-1',
        name: 'Flash',
        deletedAt: null,
        isMedicalLocked: false,
        stallAllocations: [],
        medicalLocks: [],
        nutritionPlans: [],
      };

      prisma.horse.findMany.mockResolvedValue([mockHorse]);
      prisma.shiftRoster.findMany.mockResolvedValue([]);
      // Giả lập tất cả task đã tồn tại
      prisma.dailyCareTask.findFirst.mockResolvedValue({ id: 'existing-task' });

      const result = await service.generateDailyTasksForDate(new Date('2026-10-18'));
      expect(result.totalGenerated).toBe(0);
      expect(prisma.dailyCareTask.create).not.toHaveBeenCalled();
    });
  });

  describe('completeTask & uncompleteTask (15-minute undo window)', () => {
    it('completes a task and sets undoUntil to 15 minutes in the future', async () => {
      const mockTask = {
        assignedGroomUserId: 'groom-1',
        date: rosterDay(),
        shiftId: 'shift-1',
        stallId: 'stall-1',
        stallZoneId: 'zone-1',
        id: 'task-1',
        taskCode: 'TSK-001',
        isCompleted: false,
        horse: { name: 'Flash' },
      };

      prisma.shiftRoster.findMany.mockResolvedValue([
        {
          date: rosterDay(),
          groomUserId: 'groom-1',
          shiftId: 'shift-1',
          dutyTypes: ['CLEANING', 'HORSE_CARE'],
          shift: { startTime: '00:00', endTime: '00:00', isOvernight: true },
        },
      ]);
      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);
      prisma.dailyCareTask.update.mockResolvedValue({ ...mockTask, isCompleted: true });

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom Nam' } as any;
      const res = await service.completeTask('task-1', { notes: 'Đã ăn hết khẩu phần' }, user);

      expect(res.isCompleted).toBe(true);
      expect(prisma.dailyCareTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCompleted: true,
            completedById: 'groom-1',
            undoUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('allows undo within the 15-minute window', async () => {
      const futureUndo = new Date(Date.now() + 10 * 60 * 1000); // còn 10 phút
      const mockTask = {
        id: 'task-1',
        taskCode: 'TSK-001',
        isCompleted: true,
        completedById: 'groom-1',
        completedAt: new Date(),
        undoUntil: futureUndo,
        horse: { name: 'Flash' },
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);
      prisma.dailyCareTask.update.mockResolvedValue({ ...mockTask, isCompleted: false });

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom Nam' } as any;
      const res = await service.uncompleteTask('task-1', user);

      expect(res.isCompleted).toBe(false);
      expect(prisma.dailyCareTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCompleted: false,
            completedAt: null,
            completedById: null,
          }),
        }),
      );
    });

    it('rejects legacy medication with no record/prescription provenance', async () => {
      const mockTask = {
        assignedGroomUserId: 'groom-1',
        date: rosterDay(),
        shiftId: 'shift-1',
        stallId: 'stall-1',
        stallZoneId: 'zone-1',
        id: 'task-med-1',
        taskCode: 'TSK-MED-001',
        taskType: DailyTaskType.MEDICATION,
        isCompleted: false,

        horseId: 'horse-1',
        horse: { name: 'Thunder' },
        itemsSnapshotJson: [
          {
            supplyId: 'sup-anti-inflam',
            supplyName: 'Thuốc chống viêm thú y',
            amount: 2,
            unit: 'VIAL',
            isMedicine: true,
          },
        ],
      };

      prisma.shiftRoster.findMany.mockResolvedValue([
        {
          date: rosterDay(),
          groomUserId: 'groom-1',
          shiftId: 'shift-1',
          dutyTypes: ['CLEANING', 'HORSE_CARE'],
          shift: { startTime: '00:00', endTime: '00:00', isOvernight: true },
        },
      ]);
      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);
      prisma.dailyCareTask.update.mockResolvedValue({ ...mockTask, isCompleted: true });

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom Nam' } as any;
      await expect(service.completeTask('task-med-1', {}, user)).rejects.toMatchObject({
        status: 409,
      });
      expect(inventoryService.deductStockForFeeding).not.toHaveBeenCalled();
    });

    it('rejects legacy medication undo without an immutable consumption snapshot', async () => {
      const mockTask = {
        id: 'task-med-1',
        taskCode: 'TSK-MED-001',
        taskType: DailyTaskType.MEDICATION,
        isCompleted: true,
        completedById: 'groom-1',
        completedAt: new Date(),
        undoUntil: new Date(Date.now() + 10 * 60 * 1000),
        stallZoneId: 'zone-c',
        horseId: 'horse-1',
        horse: { name: 'Thunder' },
        itemsSnapshotJson: [
          {
            supplyId: 'sup-anti-inflam',
            supplyName: 'Thuốc chống viêm thú y',
            amount: 2,
            unit: 'VIAL',
            isMedicine: true,
          },
        ],
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);
      prisma.dailyCareTask.update.mockResolvedValue({ ...mockTask, isCompleted: false });

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom Nam' } as any;
      prisma.careCostEntry = { findMany: jest.fn().mockResolvedValue([]) };
      await expect(
        service.uncompleteTask('task-med-1', user, undefined, { administrationNotPerformed: true }),
      ).rejects.toMatchObject({ status: 409 });
      expect(inventoryService.restoreStockForFeeding).not.toHaveBeenCalled();
    });

    it('rejects undo after the 15-minute window expires for groom', async () => {
      const pastUndo = new Date(Date.now() - 5 * 60 * 1000); // đã quá hạn 5 phút
      const mockTask = {
        id: 'task-1',
        isCompleted: true,
        completedById: 'groom-1',
        completedAt: new Date(Date.now() - 20 * 60 * 1000),
        undoUntil: pastUndo,
        horse: { name: 'Flash' },
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom Nam' } as any;
      await expect(service.uncompleteTask('task-1', user)).rejects.toThrow(BadRequestException);
    });

    it('prevents another groom from undoing someone else task', async () => {
      const mockTask = {
        id: 'task-1',
        isCompleted: true,
        completedById: 'groom-original',
        undoUntil: new Date(Date.now() + 10 * 60 * 1000),
        horse: { name: 'Flash' },
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);

      const anotherGroom = {
        userId: 'groom-other',
        role: Role.GROOM,
        fullName: 'Other Groom',
      } as any;
      await expect(service.uncompleteTask('task-1', anotherGroom)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows Club Manager to uncomplete task even after 15 minutes window', async () => {
      const pastUndo = new Date(Date.now() - 30 * 60 * 1000);
      const mockTask = {
        id: 'task-feed',
        taskCode: 'TSK-002',
        isCompleted: true,
        taskType: DailyTaskType.FEEDING,
        stallZoneId: 'zone-1',
        itemsSnapshotJson: [{ supplyId: 's1', amount: 2 }],
        completedById: 'groom-1',
        undoUntil: pastUndo,
        horse: { name: 'Flash' },
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);
      prisma.dailyCareTask.update.mockResolvedValue({ ...mockTask, isCompleted: false });

      const manager = { userId: 'mgr-1', role: Role.CLUB_MANAGER, fullName: 'Manager' } as any;
      const res = await service.uncompleteTask('task-feed', manager);

      expect(res.isCompleted).toBe(false);
      expect(inventoryService.restoreStockForFeeding).toHaveBeenCalledWith(
        'zone-1',
        mockTask.itemsSnapshotJson,
        prisma,
      );
    });

    it('returns task directly if already not completed', async () => {
      const mockTask = { id: 'task-incomplete', isCompleted: false };
      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);

      const res = await service.uncompleteTask('task-incomplete', {
        userId: 'u1',
        role: Role.CLUB_MANAGER,
      } as any);
      expect(res).toBe(mockTask);
    });

    it('throws NotFoundException if task does not exist on uncompleteTask', async () => {
      prisma.dailyCareTask.findUnique.mockResolvedValue(null);
      await expect(
        service.uncompleteTask('not-found', { userId: 'u1', role: Role.CLUB_MANAGER } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('ad-hoc task shift assignment', () => {
    const manager = { userId: 'manager', role: Role.CLUB_MANAGER, fullName: 'Quản lý' } as any;
    it('stores the real roster and receiving Groom for an ad-hoc task', async () => {
      prisma.horse.findUnique.mockResolvedValue({ id: 'horse', name: 'Atlas', stallAllocations: [{ assignedGroomUserId: 'groom', stall: { id: 'stall', zoneId: 'zone' } }] });
      prisma.user = { findUnique: jest.fn().mockResolvedValue({ role: Role.GROOM, status: 'ACTIVE' }) };
      prisma.shiftRoster.findMany.mockResolvedValue([{ date: rosterDay(), groomUserId: 'groom', shiftId: 'shift', dutyTypes: ['HORSE_CARE'], shift: { startTime: '00:00', endTime: '00:00', isOvernight: true } }]);
      prisma.dailyCareTask.create.mockImplementation(({ data }) => ({ id: 'adhoc', ...data, horse: { name: 'Atlas' } }));
      const task = await service.createAdHocTask({ horseId: 'horse', title: 'Kiểm tra móng', taskType: DailyTaskType.OTHER, scheduledTime: '14:00' }, manager);
      expect(task).toMatchObject({ assignedGroomUserId: 'groom', shiftId: 'shift', stallId: 'stall', stallZoneId: 'zone' });
    });
    it('rejects an off-duty Groom before creating the task', async () => {
      prisma.horse.findUnique.mockResolvedValue({ id: 'horse', name: 'Atlas', stallAllocations: [{ assignedGroomUserId: 'groom', stall: { id: 'stall', zoneId: 'zone' } }] });
      prisma.user = { findUnique: jest.fn().mockResolvedValue({ role: Role.GROOM, status: 'ACTIVE' }) };
      await expect(service.createAdHocTask({ horseId: 'horse', title: 'Kiểm tra móng', taskType: DailyTaskType.OTHER }, manager)).rejects.toMatchObject({ response: { code: 'GROOM_NOT_ON_DUTY' } });
      expect(prisma.dailyCareTask.create).not.toHaveBeenCalled();
    });
  });

  describe('completeTask', () => {
    it('returns task directly if already completed', async () => {
      const mockTask = {
        id: 'task-completed',
        isCompleted: true,
        assignedGroomUserId: 'u1',
        completedById: 'u1',
      };
      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);

      const res = await service.completeTask('task-completed', {}, {
        userId: 'u1',
        role: Role.GROOM,
      } as any);
      expect(res).toBe(mockTask);
    });

    it('throws NotFoundException if task does not exist on completeTask', async () => {
      prisma.dailyCareTask.findUnique.mockResolvedValue(null);
      await expect(
        service.completeTask('not-found', {}, { userId: 'u1', role: Role.GROOM } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a teammate task even when the Groom is rostered in the same zone', async () => {
      prisma.dailyCareTask.findUnique.mockResolvedValue({
        id: 'task',
        assignedGroomUserId: 'other',
        stallZoneId: 'zone',
        isCompleted: false,
      });
      prisma.shiftRoster.findMany.mockResolvedValue([{ groomUserId: 'groom-current' }]);
      await expect(
        service.completeTask('task', {}, { userId: 'groom-current', role: Role.GROOM } as any),
      ).rejects.toMatchObject({ response: { code: 'TASK_NOT_ASSIGNED_TO_YOU' } });
      expect(prisma.dailyCareTask.update).not.toHaveBeenCalled();
    });

    it('throws TASK_NOT_ASSIGNED_TO_YOU when groom is neither assigned nor rostered in the zone', async () => {
      const mockTask = {
        id: 'task-other-zone',
        date: new Date('2026-10-18T00:00:00.000Z'),
        stallZoneId: 'zone-2',
        assignedGroomUserId: 'groom-other',
        isCompleted: false,
        horse: { name: 'Thunder' },
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);
      prisma.shiftRoster.findFirst.mockResolvedValue(null);

      await expect(
        service.completeTask('task-other-zone', {}, {
          userId: 'groom-current',
          role: Role.GROOM,
          fullName: 'Groom Current',
        } as any),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TASK_NOT_ASSIGNED_TO_YOU' }),
      });
    });
  });

  describe('findAll', () => {
    it('queries tasks for a date with filtering and groom shift zones', async () => {
      prisma.dailyCareTask.count.mockResolvedValueOnce(5); // existing count > 0
      prisma.shiftRoster.findMany.mockResolvedValue([{ zoneId: 'zone-1' }]);

      const mockTasks = [
        { id: 't1', isCompleted: true, isMedicalLocked: false, scheduledTime: '07:00' },
        { id: 't2', isCompleted: false, isMedicalLocked: true, scheduledTime: '09:00' },
      ];
      prisma.dailyCareTask.findMany.mockResolvedValue(mockTasks);
      prisma.dailyCareTask.count.mockResolvedValueOnce(2);

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom 1' } as any;
      const res = await service.findAll(
        {
          date: '2026-10-18',
          zoneId: 'zone-1',
          horseId: 'horse-1',
          taskType: DailyTaskType.CLEANING,
          isCompleted: false,
          onlyMine: true,
        },
        user,
      );

      expect(res.stats.total).toBe(2);
      expect(res.stats.completed).toBe(1);
      expect(res.stats.pending).toBe(1);
      expect(res.stats.medicalLockedCount).toBe(1);
    });
  });

  describe('generateDailyTasksForDate edge cases', () => {
    it('generates recovery ice boot tasks for medical locked horse and fallback feeding meals', async () => {
      const mockHorse = {
        id: 'horse-med',
        name: 'Injured Star',
        deletedAt: null,
        isMedicalLocked: true,
        stallAllocations: [
          {
            isActive: true,
            assignedGroomUserId: 'groom-2',
            stall: { id: 'stall-2', zoneId: 'zone-2' },
          },
        ],
        medicalLocks: [{ reason: 'Khớp gối sưng phù, cần chườm đá' }],
        nutritionPlans: [], // Không có kế hoạch dinh dưỡng chi tiết -> fallback tiêu chuẩn
      };

      prisma.horse.findMany.mockResolvedValue([mockHorse]);
      prisma.dailyCareTask.findFirst.mockResolvedValue(null);
      prisma.dailyCareTask.create.mockResolvedValue({ id: 'task-created' });

      const res = await service.generateDailyTasksForDate(
        new Date('2026-10-18T00:00:00Z'),
        'zone-2',
      );
      expect(res.horsesProcessed).toBe(1);
      expect(res.totalGenerated).toBeGreaterThanOrEqual(4);
    });

    it('updates shiftId and assignedGroomUserId on existing uncompleted tasks when roster changes or clears', async () => {
      const mockHorse = {
        id: 'horse-1',
        name: 'Flash',
        deletedAt: null,
        isMedicalLocked: false,
        stallAllocations: [
          {
            isActive: true,
            assignedGroomUserId: null,
            stall: { id: 'stall-1', zoneId: 'zone-1' },
          },
        ],
        medicalLocks: [],
        nutritionPlans: [],
        medicalRecords: [],
      };

      prisma.horse.findMany.mockResolvedValue([mockHorse]);
      prisma.shiftRoster.findMany.mockResolvedValue([]); // Roster cleared by CM
      prisma.dailyCareTask.findFirst.mockResolvedValue({
        id: 'existing-task',
        isCompleted: false,
        stallZoneId: 'zone-1',
        stallId: 'stall-1',
        scheduledTime: '07:00',
        description: 'old',
        shiftId: 'shift-old',
        assignedGroomUserId: 'groom-old',
        isMedicalLocked: false,
        medicalLockNotes: null,
      });
      prisma.dailyCareTask.update.mockResolvedValue({ id: 'existing-task' });

      await service.generateDailyTasksForDate(new Date('2026-10-18T00:00:00Z'));

      expect(prisma.dailyCareTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-task', isCompleted: false },
          data: expect.objectContaining({
            shiftId: null,
            assignedGroomUserId: null,
          }),
        }),
      );
    });

    it('includes shift and stallZone relations when completing a task', async () => {
      const mockTask = {
        assignedGroomUserId: 'groom-1',
        date: rosterDay(),
        shiftId: 'shift-1',
        stallId: 'stall-1',
        stallZoneId: 'zone-1',
        id: 'task-1',
        taskCode: 'TSK-001',
        isCompleted: false,
        horse: { name: 'Flash' },
      };

      prisma.shiftRoster.findMany.mockResolvedValue([
        {
          date: rosterDay(),
          groomUserId: 'groom-1',
          shiftId: 'shift-1',
          dutyTypes: ['CLEANING', 'HORSE_CARE'],
          shift: { startTime: '00:00', endTime: '00:00', isOvernight: true },
        },
      ]);
      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);
      prisma.dailyCareTask.update.mockResolvedValue({
        ...mockTask,
        isCompleted: true,
        shift: { id: 'shift-1', name: 'Ca Sáng' },
      });

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom Nam' } as any;
      const res = await service.completeTask('task-1', {}, user);

      expect(res.shift).toEqual({ id: 'shift-1', name: 'Ca Sáng' });
      expect(prisma.dailyCareTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            shift: expect.any(Object),
            stallZone: expect.any(Object),
            stall: expect.any(Object),
            assignedGroom: expect.any(Object),
          }),
        }),
      );
    });

    it('formats VIAL unit in Vietnamese and syncs today even when existingCount is 0', async () => {
      prisma.horse.findUnique.mockResolvedValue({
        stallAllocations: [{ stall: { zoneId: 'zone-1' } }],
      });
      prisma.dailyCareTask.count.mockResolvedValue(0);
      prisma.horse.findMany.mockResolvedValue([
        {
          id: 'horse-med',
          name: 'Flash',
          deletedAt: null,
          isMedicalLocked: false,
          stallAllocations: [{ isActive: true, stall: { id: 'stall-1', zoneId: 'zone-1' } }],
          medicalLocks: [],
          nutritionPlans: [],
          medicalRecords: [
            {
              prescriptions: JSON.stringify([
                {
                  status: 'ACTIVE',
                  medicationName: 'Thuốc chống viêm',
                  dosage: '1',
                  unit: 'VIAL',
                  route: 'Tiêm bắp',
                  frequencyPerDay: 1,
                },
              ]),
            },
          ],
        },
      ]);
      prisma.shiftRoster.findMany.mockResolvedValue([]);
      prisma.dailyCareTask.findFirst.mockResolvedValue(null);
      prisma.dailyCareTask.create.mockResolvedValue({ id: 't-med' });

      await service.syncMedicalTasksForHorse('horse-med');

      expect(prisma.dailyCareTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            taskType: DailyTaskType.MEDICATION,
            description: expect.stringContaining('Liều lượng: 1 lọ.'),
          }),
        }),
      );
    });
  });
  describe('care email events', () => {
    const manager = { userId: 'manager', role: Role.CLUB_MANAGER, fullName: 'QA Manager' } as any;

    it('sends handover completion after the task transaction commits', async () => {
      const task = {
        id: 'task-h',
        taskCode: 'STALL-HANDOVER:allocation',
        title: 'Handover',
        taskType: DailyTaskType.OTHER,
        horseId: 'horse',
        date: new Date('2026-01-01'),
        isCompleted: false,
        assignedGroomUserId: 'groom',
        horse: { id: 'horse', name: 'QA' },
        itemsSnapshotJson: { toStallCode: 'B01' },
      };
      // Use the production handover prefix.
      const { STALL_HANDOVER_PREFIX } = await import('./daily-schedule');
      task.taskCode = STALL_HANDOVER_PREFIX + 'allocation';
      prisma.dailyCareTask.findUnique.mockResolvedValue(task);
      prisma.dailyCareTask.update.mockResolvedValue({ ...task, isCompleted: true });
      await service.completeTask(task.id, { notes: 'Destination checked' }, manager);
      expect(notifications.notifyHorse).toHaveBeenCalledWith(
        'horse',
        expect.objectContaining({ owner: true, trainer: true, groom: true }),
        expect.objectContaining({
          email: expect.objectContaining({
            eventCode: 'STALL_HANDOVER_DONE',
            body: expect.objectContaining({ refId: task.id, text: expect.stringContaining('B01') }),
          }),
        }),
      );
    });

    it('a rejected non-consumable task sends a reason to its original worker', async () => {
      const task = {
        id: 'task-r',
        taskCode: 'QA',
        title: 'Clean stall',
        date: new Date('2026-01-01'),
        taskType: DailyTaskType.CLEANING,
        completedById: 'groom',
        isCompleted: true,
        horse: { name: 'QA' },
      };
      prisma.dailyCareTask.findUnique.mockResolvedValue(task);
      prisma.dailyCareTask.update.mockResolvedValue({ ...task, isCompleted: false });
      await service.uncompleteTask(task.id, manager, { reason: 'Please check bedding again' });
      expect(notifications.notifyUsers).toHaveBeenCalledWith(
        ['groom'],
        expect.objectContaining({ email: expect.objectContaining({ eventCode: 'TASK_REJECTED' }) }),
      );
    });

    it('does not turn an administered medicine into a repeat dose when reviewed', async () => {
      prisma.dailyCareTask.findUnique.mockResolvedValue({
        id: 'med',
        taskType: DailyTaskType.MEDICATION,
        isCompleted: true,
      });
      await expect(
        service.uncompleteTask('med', manager, { reason: 'Wrong dose' }),
      ).rejects.toThrow();
      expect(prisma.dailyCareTask.update).not.toHaveBeenCalled();
      expect(inventoryService.restoreStockForFeeding).not.toHaveBeenCalled();
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });
  });
});
