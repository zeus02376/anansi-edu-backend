export function formatMatricule(year: number, sequence: number): string {
  return `IUC-${year}-${String(sequence).padStart(5, '0')}`;
}
