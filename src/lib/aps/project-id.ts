export function projectUuid(projectId: string): string {
  return projectId.startsWith("b.") ? projectId.slice(2) : projectId;
}
