import { planDailyTasks, shiftCovers, toMinutes } from './daily-schedule';

const rosters = [
  {
    zoneId: 'A',
    groomUserId: 'g1',
    shiftId: 'M',
    startTime: '05:00',
    endTime: '13:00',
    isOvernight: false,
  },
  {
    zoneId: 'B',
    groomUserId: 'g3',
    shiftId: 'M',
    startTime: '05:00',
    endTime: '13:00',
    isOvernight: false,
  },
  {
    zoneId: 'A',
    groomUserId: 'g2',
    shiftId: 'P',
    startTime: '13:00',
    endTime: '21:00',
    isOvernight: false,
  },
];

describe('planDailyTasks', () => {
  const horses = Array.from({ length: 6 }, (_, i) => ({
    id: `h${i}`,
    zoneId: i < 4 ? 'A' : 'B',
    stallCode: `S${i}`,
    isLocked: i === 0,
    careInstructions: i === 0 ? [{ activity: 'Ngâm chân nước đá', frequencyPerDay: 2 }] : undefined,
  }));
  const tasks = planDailyTasks(horses, rosters);

  it('never gives one groom two tasks at the same minute', () => {
    const seen = new Set<string>();
    // Việc ở khu không có ai trực (khu B buổi chiều) chưa giao cho Groom nào – không tính là trùng giờ của một Groom.
    const assigned = tasks.filter((t) => t.assignedGroomUserId);
    expect(assigned.length).toBeGreaterThan(0);
    for (const t of assigned) {
      const key = `${t.assignedGroomUserId}|${t.scheduledTime}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('assigns each task to the groom whose shift covers it', () => {
    const afternoon = tasks.filter(
      (t) => t.zoneId === 'A' && toMinutes(t.scheduledTime) >= 13 * 60 && t.mealType !== 'EVENING',
    );
    expect(afternoon.length).toBeGreaterThan(0);
    expect(afternoon.every((t) => t.assignedGroomUserId === 'g2' && t.shiftId === 'P')).toBe(true);
  });

  it('leaves tasks unassigned if the horse’s groom is rostered only in another zone', () => {
    const tasks = planDailyTasks([{ ...horses[0], zoneId: 'C', allocationGroomId: 'g1' }], rosters);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => task.assignedGroomUserId === undefined)).toBe(true);
  });

  it('prepares a scheduled horse in its zone and suppresses preparation under a lock', () => {
    const horse = { ...horses[1], workouts: [{ id: 'workout-1', time: '12:00' }] };
    expect(planDailyTasks([horse], rosters)).toContainEqual(
      expect.objectContaining({
        taskCode: 'WORKOUT-PREP-workout-1',
        assignedGroomUserId: 'g1',
        scheduledTime: '11:45',
      }),
    );
    expect(
      planDailyTasks([{ ...horse, isLocked: true }], rosters).some((task) => task.taskCode),
    ).toBe(false);
  });

  it('gives a locked horse physical therapy from careInstructions and skips walking', () => {
    const types = tasks.filter((t) => t.horseId === 'h0').map((t) => t.taskType);
    expect(types).toContain('PHYSICAL_THERAPY');
    expect(types).toContain('GROOMING');
    expect(types).not.toContain('WALKING');
  });
});

describe('shiftCovers', () => {
  it('handles overnight shifts', () => {
    const night = { startTime: '21:00', endTime: '05:00', isOvernight: true };
    expect(shiftCovers(night, toMinutes('23:30'))).toBe(true);
    expect(shiftCovers(night, toMinutes('04:59'))).toBe(true);
    expect(shiftCovers(night, toMinutes('12:00'))).toBe(false);
  });
});
