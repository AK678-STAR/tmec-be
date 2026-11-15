import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { JSON_BODY_LIMIT } from '../common/constants/http';

describe('Incident photo HTTP transport', () => {
  let app: NestExpressApplication;
  const create = jest.fn((body) => Promise.resolve(body));

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [IncidentsController],
      providers: [{ provide: IncidentsService, useValue: { create } }],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a near-50KB image duplicated in the legacy description', async () => {
    const photo = 'data:image/jpeg;base64,' + 'a'.repeat(51176);
    const payload = {
      horseId: '00000000-0000-4000-8000-000000000001',
      severity: 'MILD',
      evidencePhotoUrl: photo,
      description: `Quan sát vết thương.\n\n![Ảnh hiện trường](${photo})`,
    };
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeGreaterThan(100 * 1024);
    await request(app.getHttpServer()).post('/incidents').send(payload).expect(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ evidencePhotoUrl: photo }), null);
  });

  it('keeps a bounded HTTP request size', async () => {
    await request(app.getHttpServer())
      .post('/incidents')
      .send({ description: 'x'.repeat(JSON_BODY_LIMIT) })
      .expect(413);
  });
});
