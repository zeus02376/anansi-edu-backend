import { Prisma } from '@prisma/client';
import { CreneauSeance } from './conflits';
import { formaterDate, jourSemaine } from './temps';

/** Champs d'une séance exposés au personnel (sélection explicite, rien d'autre ne sort). */
export const SEANCE_SELECT = {
  id: true,
  date: true,
  heureDebut: true,
  heureFin: true,
  type: true,
  rythme: true,
  statut: true,
  annuleLe: true,
  motifAnnulation: true,
  serieId: true,
  creePar: true,
  enseignantId: true,
  salleId: true,
  enseignant: {
    select: { id: true, user: { select: { nom: true, prenom: true } } },
  },
  salle: {
    select: {
      id: true,
      code: true,
      nom: true,
      campus: { select: { id: true, nom: true, code: true } },
    },
  },
  matieres: {
    select: {
      matiere: {
        select: {
          id: true,
          nom: true,
          code: true,
          anneeAcademiqueId: true,
          niveau: {
            select: {
              id: true,
              nom: true,
              code: true,
              filiere: { select: { id: true, nom: true, code: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.SeanceSelect;

export type SeanceLue = Prisma.SeanceGetPayload<{
  select: typeof SEANCE_SELECT;
}>;

const enseignantDe = (s: SeanceLue) =>
  s.enseignant
    ? {
        id: s.enseignant.id,
        nom: s.enseignant.user.nom,
        prenom: s.enseignant.user.prenom,
      }
    : null;

/** Séance telle que renvoyée par l'API : la date en AAAA-MM-JJ et le jour de la semaine déduit. */
export function presenterSeance(s: SeanceLue) {
  return {
    id: s.id,
    date: formaterDate(s.date),
    jourSemaine: jourSemaine(s.date),
    heureDebut: s.heureDebut,
    heureFin: s.heureFin,
    type: s.type,
    rythme: s.rythme,
    statut: s.statut,
    annulee: s.annuleLe !== null,
    annuleLe: s.annuleLe,
    motifAnnulation: s.motifAnnulation,
    serieId: s.serieId,
    creePar: s.creePar,
    enseignant: enseignantDe(s),
    salle: s.salle,
    matieres: s.matieres.map(({ matiere }) => matiere),
  };
}

/** Version courte d'une séance pour décrire un conflit. */
export function resumerSeance(s: SeanceLue) {
  return {
    id: s.id,
    date: formaterDate(s.date),
    jourSemaine: jourSemaine(s.date),
    heureDebut: s.heureDebut,
    heureFin: s.heureFin,
    type: s.type,
    rythme: s.rythme,
    matieres: s.matieres.map(({ matiere }) => ({
      id: matiere.id,
      code: matiere.code,
      nom: matiere.nom,
    })),
    enseignant: enseignantDe(s),
    salle: s.salle ? { id: s.salle.id, code: s.salle.code } : null,
  };
}

export const creneauDe = (s: SeanceLue): CreneauSeance => ({
  date: formaterDate(s.date),
  heureDebut: s.heureDebut,
  heureFin: s.heureFin,
  enseignantId: s.enseignantId,
  salleId: s.salleId,
  rythme: s.rythme,
  niveauIds: s.matieres.map(({ matiere }) => matiere.niveau.id),
});
