import {
  assertIncidentTransition,
  assertMergeCandidate,
  lockIssuer,
  normalizeSeverity,
} from './incident-lifecycle';

describe('incident lifecycle', () => {
  it('maps requested severity names to existing canonical values', () => {
    expect(normalizeSeverity('MINOR')).toBe('MILD');
    expect(normalizeSeverity('MAJOR')).toBe('SEVERE');
    expect(() => normalizeSeverity('INVALID')).toThrow();
  });
  it('does not reopen terminal incidents through review', () => {
    for (const status of ['RESOLVED', 'DISMISSED', 'MERGED_INTO_TREATMENT']) {
      expect(() => assertIncidentTransition(status, 'UNDER_REVIEW')).toThrow();
    }
    expect(() => assertIncidentTransition('REPORTED', 'UNDER_REVIEW')).not.toThrow();
  });
  it('rejects a different horse, terminal or old duplicate', () => {
    const now = new Date('2026-11-23T08:00:00Z');
    const parent = { id: 'a', horseId: 'h' };
    const candidate = { id: 'b', horseId: 'h', status: 'REPORTED', createdAt: now };
    expect(() => assertMergeCandidate(parent, candidate, now)).not.toThrow();
    for (const change of [
      { horseId: 'other' },
      { status: 'RESOLVED' },
      { id: 'a' },
      { createdAt: new Date('2026-11-20') },
    ]) {
      expect(() => assertMergeCandidate(parent, { ...candidate, ...change }, now)).toThrow();
    }
  });
  it('attributes automatic protection without impersonating a veterinarian', () => {
    expect(lockIssuer('INCIDENT_AUTO', 'groom', undefined, 'inc')).toEqual({
      source: 'INCIDENT_AUTO',
      issuedByUserId: 'groom',
      veterinarianUserId: null,
      sourceIncidentId: 'inc',
    });
    expect(() => lockIssuer('VET', 'groom')).toThrow();
    expect(() => lockIssuer('INCIDENT_AUTO', 'groom')).toThrow();
    expect(lockIssuer('VET', 'vet', 'vet').veterinarianUserId).toBe('vet');
  });
});
