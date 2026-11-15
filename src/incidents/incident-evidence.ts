export function incidentDescription(description: string, evidencePhotoUrl?: string): string {
  const text = description.trim();
  if (!evidencePhotoUrl || text.includes(`](${evidencePhotoUrl})`)) return text;
  return `${text}\n\n![Ảnh hiện trường](${evidencePhotoUrl})`;
}

export function incidentNotificationText(description: string): string {
  return description.replace(/!\[[^\]]*\]\([^\s)]+\)/g, '').trim();
}
