import { EtatNote } from '@prisma/client';

/**
 * Calcul des moyennes, à la volée (aucune valeur stockée). Règles décidées :
 * - seules les évaluations PUBLIEES comptent (filtrées avant d'arriver ici) ;
 * - une évaluation sans note pour l'étudiant est exclue (non notée) ;
 * - NOTEE : note ramenée sur 20 (valeur ÷ barème × 20) ;
 * - ABSENT : compte 0 ; DISPENSE : exclue.
 *
 * Moyenne de matière  = Σ(note/20 × coefficient évaluation) ÷ Σ(coefficients des évaluations comptées)
 * Moyenne générale    = Σ(moyenne matière × coefficient matière) ÷ Σ(coefficients des matières
 *                       ayant une moyenne), calculée sur les moyennes non arrondies.
 * Les résultats sont arrondis à 2 décimales à l'affichage uniquement.
 */

export type NoteEvaluation = {
  coefficient: number;
  bareme: number;
  etat: EtatNote;
  valeur: number | null;
};

export type MatiereMoyenne = { coefficient: number; moyenne: number | null };

export const arrondir = (valeur: number) =>
  Math.round((valeur + Number.EPSILON) * 100) / 100;

/** Note ramenée sur 20 ; null si l'évaluation n'est pas comptée (dispense). */
export function noteSur20(note: NoteEvaluation): number | null {
  if (note.etat === EtatNote.DISPENSE) return null;
  if (note.etat === EtatNote.ABSENT || note.valeur === null) return 0;
  return (note.valeur / note.bareme) * 20;
}

/** Moyenne non arrondie d'une matière sur 20 ; null si aucune évaluation comptée. */
export function moyenneMatiere(notes: NoteEvaluation[]): number | null {
  let somme = 0;
  let poids = 0;
  for (const note of notes) {
    const sur20 = noteSur20(note);
    if (sur20 === null) continue;
    somme += sur20 * note.coefficient;
    poids += note.coefficient;
  }
  return poids > 0 ? somme / poids : null;
}

/** Moyenne générale non arrondie sur 20, pondérée par le coefficient des matières. */
export function moyenneGenerale(matieres: MatiereMoyenne[]): number | null {
  let somme = 0;
  let poids = 0;
  for (const matiere of matieres) {
    if (matiere.moyenne === null) continue;
    somme += matiere.moyenne * matiere.coefficient;
    poids += matiere.coefficient;
  }
  return poids > 0 ? somme / poids : null;
}

export const arrondiOuNull = (valeur: number | null) =>
  valeur === null ? null : arrondir(valeur);
