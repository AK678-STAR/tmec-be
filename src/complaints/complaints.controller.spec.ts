import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RolesGuard } from '../common/guards/roles.guard';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';

describe('Complaints HTTP boundary', () => {
  let app: INestApplication;
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'created' }),
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    review: jest.fn(),
    confirm: jest.fn(),
    dismiss: jest.fn(),
    subjects: jest.fn(),
  };
  const id = '123e4567-e89b-42d3-a456-426614174000';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ComplaintsController],
      providers: [{ provide: ComplaintsService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.use((req, _res, next) => {
      req.user = { userId: id, role: req.headers['x-test-role'] || 'GROOM', fullName: 'Staff' };
      next();
    });
    app.useGlobalGuards(new RolesGuard(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('rejects owner access and groom review', async () => {
    await request(app.getHttpServer())
      .get('/complaints')
      .set('x-test-role', 'HORSE_OWNER')
      .expect(403);
    await request(app.getHttpServer())
      .post(`/complaints/${id}/review`)
      .send({ reviewNote: 'A summary for review' })
      .expect(403);
    expect(service.review).not.toHaveBeenCalled();
  });
  it('validates evidence schemes, count, IDs and trimmed reason', async () => {
    for (const body of [
      { subjectUserId: id, reason: '          ' },
      { subjectUserId: 'bad-id', reason: 'A detailed complaint' },
      { subjectUserId: id, reason: 'A detailed complaint', evidenceUrls: ['javascript:alert(1)'] },
      {
        subjectUserId: id,
        reason: 'A detailed complaint',
        evidenceUrls: Array.from({ length: 11 }, (_, n) => `https://example.com/${n}`),
      },
    ])
      await request(app.getHttpServer()).post('/complaints').send(body).expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it('caps pagination and validates confirm findings', async () => {
    await request(app.getHttpServer()).get('/complaints?pageSize=101').expect(400);
    await request(app.getHttpServer())
      .post(`/complaints/${id}/confirm-violation`)
      .set('x-test-role', 'CLUB_MANAGER')
      .send({ conclusion: 'A confirmed finding' })
      .expect(400);
    expect(service.confirm).not.toHaveBeenCalled();
  });
  it('passes authenticated reporter and validated body to create', async () => {
    await request(app.getHttpServer())
      .post('/complaints')
      .send({
        subjectUserId: id,
        reason: '  A detailed complaint  ',
        evidenceUrls: ['https://example.com/evidence'],
      })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'A detailed complaint' }),
      expect.objectContaining({ userId: id, role: 'GROOM' }),
    );
  });
});
