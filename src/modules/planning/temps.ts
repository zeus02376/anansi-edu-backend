import { BadRequestException } from '@nestjs/common';

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Plus longue période demandée en une fois (liste, audit) : un an. */
export const FENETRE_MAX_JOURS = 366;

/** Date calendaire « AAAA-MM-JJ » (UTC) ; null si le format ou le jour est invalide. */
export function lireDate(texte: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) return null;
  const date = new Date(`${texte}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || formaterDate(date) !== texte
    ? null
    : date;
}

export function dateObligatoire(texte: string, champ: string): Date {
  const date = lireDate(texte);
  if (!date) {
    throw new BadRequestException(
      `${champ} : date invalide (format AAAA-MM-JJ attendu)`,
    );
  }
  return date;
}

export const formaterDate = (date: Date) => date.toISOString().slice(0, 10);

/** Jour de la semaine déduit de la date : 1 = lundi … 7 = dimanche. Jamais saisi. */
export const jourSemaine = (date: Date) => date.getUTCDay() || 7;

export const ajouterJours = (date: Date, jours: number) =>
  new Date(date.getTime() + jours * JOUR_MS);

export const ecartJours = (debut: Date, fin: Date) =>
  Math.round((fin.getTime() - debut.getTime()) / JOUR_MS);

/** Fenêtre « du … au » bornée (inclusive), 400 si incohérente ou trop large. */
export function lireFenetre(du: string, au: string) {
  const debut = dateObligatoire(du, 'du');
  const fin = dateObligatoire(au, 'au');
  if (fin < debut) {
    throw new BadRequestException('« au » doit être postérieure à « du »');
  }
  if (ecartJours(debut, fin) + 1 > FENETRE_MAX_JOURS) {
    throw new BadRequestException(
      `La période demandée ne peut pas dépasser ${FENETRE_MAX_JOURS} jours`,
    );
  }
  return { debut, fin };
}

/** « 480 » → « 08:00 » (affichage dans les messages). */
export const formaterHeure = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Semaine ISO 8601 (« 2027-W05 ») → son lundi et son dimanche. La semaine 1 est celle qui
 * contient le 4 janvier ; une semaine 53 n'existe que les années qui en comptent une.
 */
export function lireSemaine(texte: string) {
  const trouve = /^(\d{4})-W(\d{2})$/.exec(texte);
  if (!trouve) {
    throw new BadRequestException(
      'semaine : format AAAA-Wss attendu (ex. 2027-W05)',
    );
  }
  const annee = Number(trouve[1]);
  const semaine = Number(trouve[2]);
  const quatreJanvier = new Date(Date.UTC(annee, 0, 4));
  const lundiSemaine1 = ajouterJours(
    quatreJanvier,
    1 - jourSemaine(quatreJanvier),
  );
  const lundi = ajouterJours(lundiSemaine1, 7 * (semaine - 1));
  // L'année ISO d'une semaine est celle de son jeudi
  if (semaine < 1 || ajouterJours(lundi, 3).getUTCFullYear() !== annee) {
    throw new BadRequestException(`semaine : la semaine ${texte} n'existe pas`);
  }
  return { lundi, dimanche: ajouterJours(lundi, 6) };
}
