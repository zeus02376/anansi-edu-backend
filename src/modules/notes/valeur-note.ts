import { EtatNote } from '@prisma/client';

/**
 * Règle de cohérence entre l'état d'une note et sa valeur, commune à la saisie
 * de l'enseignant et à la correction de la scolarité. Renvoie le message d'erreur
 * ou null si la combinaison est valide.
 */
export function erreurValeur(
  etat: EtatNote,
  valeur: number | null,
  bareme: number,
): string | null {
  if (etat === EtatNote.NOTEE) {
    if (valeur === null) return 'Une note est obligatoire pour l’état NOTEE';
    if (valeur > bareme) {
      return `La note ne peut pas dépasser le barème (${bareme})`;
    }
    return null;
  }
  return valeur === null
    ? null
    : `Aucune note ne peut être saisie pour l’état ${etat}`;
}
