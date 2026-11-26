import { ForbiddenException, ConflictException } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BusinessMailService } from '../business-mail/business-mail.service';

describe('ComplaintsService', () => {
  const actor = { userId: 'handler', role: 'VETERINARIAN', fullName: 'Vet', email: 'v@test.com' };
  const row = {
    id: 'case',
    code: 'CMP-1',
    subjectUserId: 'subject',
    reporterId: 'reporter',
    reason: 'confidential account',
    evidenceJson: ['https://example.com/private'],
    status: 'OPEN',
    createdAt: new Date(),
    subject: { id: 'subject', fullName: 'Subject', role: 'GROOM' },
  };
  let db: any;
  let mail: any;
  let audit: any;
  let service: ComplaintsService;
  beforeEach(() => {
    db = {
      user: {
        findFirst: jest.fn().mockResolvedValue(row.subject),
        findMany: jest.fn().mockResolvedValue([{ id: 'handler' }, { id: 'subject' }]),
      },
      complaint: {
        create: jest.fn().mockResolvedValue(row),
        findUnique: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    db.$transaction = jest.fn((fn) => fn(db));
    mail = { emit: jest.fn().mockResolvedValue([]) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ComplaintsService(
      db as PrismaService,
      audit as AuditService,
      mail as BusinessMailService,
    );
  });
  it('combines role filters with independent-handler scope and identical count criteria', async () => {
    await service.list(
      { page: 1, pageSize: 20, reporterRole: 'HEAD_TRAINER', targetRole: 'GROOM' } as any,
      actor,
    );
    const where = db.complaint.findMany.mock.calls[0][0].where;
    expect(where.reporter).toEqual({ role: 'HEAD_TRAINER' });
    expect(where.subject).toEqual({ role: 'GROOM' });
    expect(where.OR).toEqual([
      { reporterId: { not: actor.userId }, subjectUserId: { not: actor.userId } },
    ]);
    expect(db.complaint.count).toHaveBeenCalledWith({ where });
  });
  it('does not let a subject infer the confidential reporter role through filtering', async () => {
    await expect(
      service.list({ page: 1, pageSize: 20, reporterRole: 'HEAD_TRAINER' } as any, {
        ...actor,
        userId: 'subject',
        role: 'GROOM',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.complaint.findMany).not.toHaveBeenCalled();
  });
  it('files with handler and separate reporter receipt, never notifying subject or confirming', async () => {
    await service.create(
      { subjectUserId: 'subject', reason: 'A detailed complaint' },
      { ...actor, userId: 'reporter' },
    );
    expect(mail.emit.mock.calls.map(([event]) => event.eventCode)).toEqual([
      'COMPLAINT_FILED',
      'COMPLAINT_RECEIVED',
    ]);
    expect(mail.emit.mock.calls[0][0].recipients.map((r) => r.userId)).toEqual(['handler']);
    expect(mail.emit.mock.calls[1][0].recipients[0].userId).toBe('reporter');
    expect(audit.record.mock.calls[0][5]).toBe(db);
  });
  it.each(['reporter', 'subject'])('prevents involved handler %s from review', async (userId) => {
    await expect(
      service.review('case', { reviewNote: 'Approved safe summary' }, { ...actor, userId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.complaint.updateMany).not.toHaveBeenCalled();
  });
  it('uses compare-and-set and sends no mail when another handler wins', async () => {
    db.complaint.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.review('case', { reviewNote: 'Approved safe summary' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mail.emit).not.toHaveBeenCalled();
  });
  it('requires review before confirmation', async () => {
    await expect(
      service.confirm(
        'case',
        { conclusion: 'A confirmed finding', regulation: 'Rule 1', measures: 'Training' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('confirms reviewed cases with subject and managers, deduping recipients', async () => {
    db.complaint.findUnique.mockResolvedValue({ ...row, status: 'UNDER_REVIEW' });
    await service.confirm(
      'case',
      { conclusion: 'A confirmed finding', regulation: 'Rule 1', measures: 'Training' },
      actor,
    );
    const event = mail.emit.mock.calls[0][0];
    expect(event.eventCode).toBe('VIOLATION_CONFIRMED');
    expect(event.recipients.map((r) => r.userId)).toEqual(['subject', 'handler']);
    expect(event.recipients[0].body.text).toContain('Rule 1');
    expect(event.recipients[0].body.refId).toBe('case');
  });
  it('dismisses without emitting a violation and rejects terminal repeats', async () => {
    await expect(
      service.dismiss('case', { conclusion: 'Insufficient evidence' }, actor),
    ).resolves.toMatchObject({ status: 'DISMISSED' });
    expect(mail.emit).not.toHaveBeenCalled();
    db.complaint.findUnique.mockResolvedValue({ ...row, status: 'DISMISSED' });
    await expect(
      service.dismiss('case', { conclusion: 'Insufficient evidence' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('limits groom list to own reports and reviewed cases about them', async () => {
    await service.list({ page: 2, pageSize: 20 }, { ...actor, userId: 'groom', role: 'GROOM' });
    expect(db.complaint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: {
          OR: [{ reporterId: 'groom' }, { subjectUserId: 'groom', status: { not: 'OPEN' } }],
        },
      }),
    );
  });
  it('sends review summary without raw complaint or evidence', async () => {
    await service.review('case', { reviewNote: 'Approved safe summary' }, actor);
    const event = mail.emit.mock.calls[0][0];
    expect(event.eventCode).toBe('REVIEW_REQUESTED');
    expect(event.recipients[0].body.text).toContain('Approved safe summary');
    expect(JSON.stringify(event)).not.toContain('confidential account');
    expect(JSON.stringify(event)).not.toContain('private');
  });
  it('keeps committed complaint successful when mailing fails', async () => {
    mail.emit.mockRejectedValue(new Error('smtp unavailable'));
    await expect(
      service.create(
        { subjectUserId: 'subject', reason: 'A detailed complaint' },
        { ...actor, userId: 'reporter' },
      ),
    ).resolves.toMatchObject({ id: 'case' });
  });
  it('sends no mail when transactional auditing fails', async () => {
    audit.record.mockRejectedValue(new Error('audit write failed'));
    await expect(
      service.create(
        { subjectUserId: 'subject', reason: 'A detailed complaint' },
        { ...actor, userId: 'reporter' },
      ),
    ).rejects.toThrow('audit write failed');
    expect(mail.emit).not.toHaveBeenCalled();
  });
  it('redacts reporter/evidence from a subject who is also a vet', async () => {
    db.complaint.findMany.mockResolvedValue([
      { ...row, status: 'UNDER_REVIEW', reviewNote: 'Safe summary' },
    ]);
    const result = await service.list({ page: 1, pageSize: 20 }, { ...actor, userId: 'subject' });
    expect(result.items[0]).not.toHaveProperty('reporterId');
    expect(result.items[0]).not.toHaveProperty('evidenceJson');
    expect(result.items[0].reason).toBe('Safe summary');
  });
});
