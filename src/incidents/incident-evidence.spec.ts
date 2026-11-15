import { validate } from 'class-validator';
import { CreateIncidentDto } from './dto/incident.dto';
import { incidentDescription } from './incident-evidence';

describe('Incident evidence compatibility', () => {
  const photo = 'data:image/jpeg;base64,YWJj';
  it('stores structured evidence in the existing description column', () => {
    expect(incidentDescription(' Wound observed. ', photo)).toBe(
      `Wound observed.\n\n![Ảnh hiện trường](${photo})`,
    );
  });
  it('does not duplicate evidence already appended by the frontend', () => {
    const text = `Wound observed.\n\n![Ảnh hiện trường](${photo})`;
    expect(incidentDescription(text, photo)).toBe(text);
    expect(incidentDescription(' No photo. ')).toBe('No photo.');
  });
  it('rejects invalid photo fields at the DTO boundary', async () => {
    const dto = Object.assign(new CreateIncidentDto(), {
      horseId: '00000000-0000-4000-8000-000000000001',
      description: 'Observation',
      evidencePhotoUrl: 'javascript:alert(1)',
    });
    expect((await validate(dto)).some((e) => e.property === 'evidencePhotoUrl')).toBe(true);
    dto.evidencePhotoUrl = photo;
    expect(await validate(dto)).toHaveLength(0);
  });
});
