import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutInscription, StatutSeance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ajouterJours,
  formaterDate,
  jourSemaine,
  lireFenetre,
  lireSemaine,
} from './temps';

/** Champs d'une séance publiés pour l'enseignant et l'étudiant : rien d'interne n'en sort. */
const SEANCE_MOI_SELECT = {
  id: true,
  date: true,
  heureDebut: true,
  heureFin: true,
  type: true,
  rythme: true,
  annuleLe: true,
  enseignant: { select: { user: { select: { nom: true, prenom: true } } } },
  salle: {
    select: {
      code: true,
      nom: true,
      campus: { select: { nom: true, code: true } },
    },
  },
  matieres: {
    select: {
      matiere: {
        select: {
          id: true,
          nom: true,
          code: true,
          niveauId: true,
          anneeAcademiqueId: true,
          niveau: {
            select: {
              nom: true,
              code: true,
              filiere: { select: { nom: true, code: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.SeanceSelect;

type SeanceMoi = Prisma.SeanceGetPayload<{ select: typeof SEANCE_MOI_SELECT }>;
type Matiere = SeanceMoi['matieres'][number]['matiere'];

/**
 * Séance telle que la voient l'enseignant et l'étudiant : l'enseignant par nom et
 * prénom seulement, ni auteur, ni série, ni statut, ni motif d'annulation (une séance
 * annulée est signalée comme telle).
 */
function presenter(s: SeanceMoi, garder: (matiere: Matiere) => boolean) {
  return {
    id: s.id,
    date: formaterDate(s.date),
    jourSemaine: jourSemaine(s.date),
    heureDebut: s.heureDebut,
    heureFin: s.heureFin,
    type: s.type,
    rythme: s.rythme,
    annulee: s.annuleLe !== null,
    enseignant: s.enseignant
      ? { nom: s.enseignant.user.nom, prenom: s.enseignant.user.prenom }
      : null,
    salle: s.salle,
    matieres: s.matieres
      .map(({ matiere }) => matiere)
      .filter(garder)
      .map((m) => ({ id: m.id, code: m.code, nom: m.nom, niveau: m.niveau })),
  };
}

/**
 * Planning publié de l'enseignant ou de l'étudiant CONNECTÉ.
 *
 * Règle d'architecture (comme EtudiantMoiService) : chaque méthode ne reçoit que
 * `userId`, l'identité du JWT ; aucun identifiant venant de l'URL ou du corps
 * n'intervient. Un brouillon n'est jamais renvoyé.
 */
@Injectable()
export class PlanningMoiService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- enseignant ----

  async seancesEnseignant(userId: string, du: string, au: string) {
    const { debut, fin } = lireFenetre(du, au);
    return this.lireEnseignant(userId, debut, fin);
  }

  async hebdoEnseignant(userId: string, semaine: string) {
    const { lundi } = lireSemaine(semaine);
    const seances = await this.lireEnseignant(
      userId,
      lundi,
      ajouterJours(lundi, 6),
    );
    return this.hebdo(semaine, lundi, seances);
  }

  /**
   * Ses séances publiées, pour les matières auxquelles il est affecté (même année que la
   * matière) : une affectation retirée fait disparaître les séances correspondantes.
   */
  private async lireEnseignant(userId: string, debut: Date, fin: Date) {
    const enseignant = await this.prisma.enseignant.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!enseignant) {
      throw new NotFoundException('Profil enseignant introuvable');
    }
    const affectations = await this.prisma.affectation.findMany({
      where: { enseignantId: enseignant.id },
      select: {
        matiereId: true,
        anneeAcademiqueId: true,
        matiere: { select: { anneeAcademiqueId: true } },
      },
    });
    const matiereIds = affectations
      .filter((a) => a.anneeAcademiqueId === a.matiere.anneeAcademiqueId)
      .map((a) => a.matiereId);
    if (matiereIds.length === 0) return [];

    const seances = await this.prisma.seance.findMany({
      where: {
        date: { gte: debut, lte: fin },
        statut: StatutSeance.PUBLIEE,
        enseignantId: enseignant.id,
        matieres: { some: { matiereId: { in: matiereIds } } },
      },
      select: SEANCE_MOI_SELECT,
      orderBy: [{ date: 'asc' }, { heureDebut: 'asc' }, { id: 'asc' }],
    });
    return seances.map((s) => presenter(s, () => true));
  }

  // ---- étudiant ----

  async seancesEtudiant(userId: string, du: string, au: string) {
    const { debut, fin } = lireFenetre(du, au);
    return this.lireEtudiant(userId, debut, fin);
  }

  async hebdoEtudiant(userId: string, semaine: string) {
    const { lundi } = lireSemaine(semaine);
    const seances = await this.lireEtudiant(
      userId,
      lundi,
      ajouterJours(lundi, 6),
    );
    return this.hebdo(semaine, lundi, seances);
  }

  /**
   * Séances publiées de ses classes : chaque inscription VALIDE donne un (niveau, année,
   * rythme). EN_ATTENTE, REJETE et SUSPENDU ne donnent rien. Seules ses propres
   * matières sont listées sur une séance commune à plusieurs filières.
   */
  private async lireEtudiant(userId: string, debut: Date, fin: Date) {
    const etudiant = await this.prisma.etudiant.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!etudiant) throw new NotFoundException('Profil étudiant introuvable');
    const classes = await this.prisma.inscription.findMany({
      where: { etudiantId: etudiant.id, statut: StatutInscription.VALIDE },
      select: { niveauId: true, anneeAcademiqueId: true, rythme: true },
    });
    if (classes.length === 0) return [];

    const seances = await this.prisma.seance.findMany({
      where: {
        date: { gte: debut, lte: fin },
        statut: StatutSeance.PUBLIEE,
        OR: classes.map((c) => ({
          rythme: c.rythme,
          matieres: {
            some: {
              matiere: {
                niveauId: c.niveauId,
                anneeAcademiqueId: c.anneeAcademiqueId,
              },
            },
          },
        })),
      },
      select: SEANCE_MOI_SELECT,
      orderBy: [{ date: 'asc' }, { heureDebut: 'asc' }, { id: 'asc' }],
    });
    const miennes = new Set(
      classes.map((c) => `${c.niveauId}|${c.anneeAcademiqueId}`),
    );
    return seances.map((s) =>
      presenter(s, (m) => miennes.has(`${m.niveauId}|${m.anneeAcademiqueId}`)),
    );
  }

  /** Vue hebdomadaire : les sept jours de la semaine ISO (lundi à dimanche), même vides. */
  private hebdo(
    semaine: string,
    lundi: Date,
    seances: ReturnType<typeof presenter>[],
  ) {
    const jours = Array.from({ length: 7 }, (_, i) => {
      const date = formaterDate(ajouterJours(lundi, i));
      return {
        date,
        jourSemaine: i + 1,
        seances: seances.filter((s) => s.date === date),
      };
    });
    return {
      semaine,
      du: jours[0].date,
      au: jours[6].date,
      jours,
    };
  }
}
