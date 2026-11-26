import { BadRequestException, ConflictException } from '@nestjs/common';
import { SeverityLevel } from '@prisma/client';

export function normalizeSeverity(value: string): SeverityLevel {
  const canonical = value === 'MINOR' ? 'MILD' : value === 'MAJOR' ? 'SEVERE' : value;
  if (!Object.values(SeverityLevel).includes(canonical as SeverityLevel)) {
    throw new BadRequestException('INVALID_INCIDENT_SEVERITY');
  }
  return canonical as SeverityLevel;
}

export function assertIncidentTransition(from: string, to: string) {
  const transitions: Record<string, string[]> = {
    REPORTED: ['UNDER_REVIEW', 'RESOLVED', 'DISMISSED', 'MERGED_INTO_TREATMENT'],
    UNDER_REVIEW: ['RESOLVED', 'DISMISSED', 'MERGED_INTO_TREATMENT'],
  };
  if (from !== to && !transitions[from]?.includes(to)) {
    throw new ConflictException('INCIDENT_STATE_CONFLICT');
  }
}

export function assertMergeCandidate(
  parent: { id: string; horseId: string },
  candidate: { id: string; horseId: string; status: string; createdAt: Date },
  now: Date,
) {
  if (
    parent.id === candidate.id ||
    parent.horseId !== candidate.horseId ||
    !['REPORTED', 'UNDER_REVIEW'].includes(candidate.status) ||
    candidate.createdAt > now ||
    candidate.createdAt.getTime() < now.getTime() - 48 * 3600000
  )
    throw new ConflictException('INVALID_DUPLICATE_INCIDENT');
}

export function lockIssuer(
  source: 'VET' | 'INCIDENT_AUTO',
  actorId: string,
  vetId?: string,
  incidentId?: string,
) {
  if ((source === 'VET' && !vetId) || (source === 'INCIDENT_AUTO' && !incidentId)) {
    throw new BadRequestException('INVALID_MEDICAL_LOCK_SOURCE');
  }
  return {
    source,
    issuedByUserId: actorId,
    veterinarianUserId: source === 'VET' ? vetId! : null,
    sourceIncidentId: incidentId ?? null,
  };
}
