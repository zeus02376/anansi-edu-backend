/**
 * Règles de conflit entre deux séances, sans accès à la base : elles servent à la
 * création (transaction sérialisable) comme à l'audit.
 */
export type TypeConflit = 'ENSEIGNANT' | 'SALLE' | 'CLASSE';

export type CreneauSeance = {
  /** Date calendaire AAAA-MM-JJ */
  date: string;
  /** Minutes depuis minuit ; la fin est exclue */
  heureDebut: number;
  heureFin: number;
  enseignantId: string | null;
  salleId: string | null;
  rythme: string;
  /** Niveaux des matières de la séance (une séance commune en compte plusieurs) */
  niveauIds: string[];
};

/** Intervalles [début, fin) : deux blocs consécutifs ne se chevauchent pas. */
export const seChevauchent = (a: CreneauSeance, b: CreneauSeance) =>
  a.date === b.date && a.heureDebut < b.heureFin && b.heureDebut < a.heureFin;

/**
 * Conflits entre deux séances distinctes (l'appelant exclut une séance de
 * elle-même et ignore les séances annulées) :
 * - ENSEIGNANT : même enseignant ;
 * - SALLE : même salle ;
 * - CLASSE : même rythme et au moins un niveau commun.
 */
export function typesDeConflit(
  a: CreneauSeance,
  b: CreneauSeance,
): TypeConflit[] {
  if (!seChevauchent(a, b)) return [];
  const types: TypeConflit[] = [];
  if (a.enseignantId !== null && a.enseignantId === b.enseignantId) {
    types.push('ENSEIGNANT');
  }
  if (a.salleId !== null && a.salleId === b.salleId) types.push('SALLE');
  if (
    a.rythme === b.rythme &&
    a.niveauIds.some((niveau) => b.niveauIds.includes(niveau))
  ) {
    types.push('CLASSE');
  }
  return types;
}
