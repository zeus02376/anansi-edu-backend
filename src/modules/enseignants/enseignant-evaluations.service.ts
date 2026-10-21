import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EtatNote,
  Prisma,
  StatutEvaluation,
  StatutInscription,
} from '@prisma/client';
import { TenantScopeService } from '../../common/tenant/tenant-scope.service';
import { publierEvaluation } from '../notes/evaluation-publication';
import { erreurValeur } from '../notes/valeur-note';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEvaluationDto,
  NoteLigneDto,
  SaisieNotesDto,
  UpdateEvaluationDto,
} from './dto/evaluation.dto';

/** Identité de l'enseignant connecté : uniquement ce qui vient du JWT. */
export type Enseignant = { userId: string; tenantId: string };

type ErreurLigne = {
  inscriptionId: string;
  code: 'NON_NOTABLE' | 'VALEUR_INVALIDE' | 'CONFLIT';
  message: string;
};

const EVALUATION = {
  id: true,
  matiereId: true,
  nom: true,
  type: true,
  coefficient: true,
  bareme: true,
  date: true,
  statut: true,
  publieLe: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { notes: true } },
} satisfies Prisma.EvaluationSelect;

const NOTE = {
  id: true,
  inscriptionId: true,
  valeur: true,
  etat: true,
  commentaire: true,
  updatedAt: true,
} satisfies Prisma.NoteSelect;

/** Corps d'erreur au format habituel de l'API, avec le détail par ligne. */
const corps = (
  statusCode: number,
  error: string,
  message: string,
  erreurs: ErreurLigne[] = [],
) => ({ statusCode, error, message, erreurs });

const CONFLIT_CONCURRENT =
  'Les notes ont été modifiées par une autre requête : rechargez la grille puis réessayez';

/**
 * Évaluations et notes de l'enseignant CONNECTÉ.
 *
 * Même règle que EnseignantMoiService : tout est filtré par l'identité du JWT.
 * - une matière n'est accessible que si l'enseignant y est affecté ;
 * - une évaluation n'est accessible que si l'enseignant l'a créée (creePar)
 *   ET reste affecté à sa matière ;
 * - tout identifiant hors périmètre répond 404, comme s'il n'existait pas.
 */
@Injectable()
export class EnseignantEvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}

  // ---------- Périmètre ----------

  /** Matière de l'établissement à laquelle l'enseignant est affecté. */
  private async matiereAffectee(
    { userId, tenantId }: Enseignant,
    matiereId: string,
  ) {
    await this.scope.matiere(tenantId, matiereId);
    const affectation = await this.prisma.affectation.findFirst({
      where: { matiereId, enseignant: { userId } },
      select: { id: true },
    });
    if (!affectation) throw new NotFoundException('Matière introuvable');
  }

  /** Évaluation créée par l'enseignant, sur une matière où il reste affecté. */
  private async evaluationPropre({ userId, tenantId }: Enseignant, id: string) {
    await this.scope.evaluation(tenantId, id);
    const evaluation = await this.prisma.evaluation.findFirst({
      where: {
        id,
        creePar: userId,
        matiere: { affectations: { some: { enseignant: { userId } } } },
      },
      select: {
        ...EVALUATION,
        matiere: { select: { niveauId: true, anneeAcademiqueId: true } },
      },
    });
    if (!evaluation) throw new NotFoundException('Évaluation introuvable');
    return evaluation;
  }

  private verrouillee() {
    return new ConflictException(
      'Évaluation publiée : l’enseignant ne peut plus la modifier (correction par la scolarité)',
    );
  }

  private nomExistant(nom: string) {
    return new ConflictException(
      `Une évaluation « ${nom} » existe déjà pour cette matière`,
    );
  }

  private estViolation(error: unknown, ...codes: string[]) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      codes.includes(error.code)
    );
  }

  // ---------- Évaluations ----------

  async lister(enseignant: Enseignant, matiereId: string) {
    await this.matiereAffectee(enseignant, matiereId);
    return this.prisma.evaluation.findMany({
      where: { matiereId, creePar: enseignant.userId },
      select: EVALUATION,
      orderBy: { createdAt: 'asc' },
    });
  }

  async creer(
    enseignant: Enseignant,
    matiereId: string,
    dto: CreateEvaluationDto,
  ) {
    await this.matiereAffectee(enseignant, matiereId);
    try {
      return await this.prisma.evaluation.create({
        data: {
          matiereId,
          nom: dto.nom,
          type: dto.type,
          ...(dto.coefficient !== undefined && {
            coefficient: dto.coefficient,
          }),
          ...(dto.bareme !== undefined && { bareme: dto.bareme }),
          ...(dto.date && { date: new Date(dto.date) }),
          creePar: enseignant.userId,
        },
        select: EVALUATION,
      });
    } catch (error) {
      if (this.estViolation(error, 'P2002')) throw this.nomExistant(dto.nom);
      throw error;
    }
  }

  async modifier(enseignant: Enseignant, id: string, dto: UpdateEvaluationDto) {
    const evaluation = await this.evaluationPropre(enseignant, id);
    if (evaluation.statut !== StatutEvaluation.BROUILLON) {
      throw this.verrouillee();
    }
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Aucune modification fournie');
    }
    if (dto.bareme !== undefined) {
      const { _max } = await this.prisma.note.aggregate({
        where: { evaluationId: id },
        _max: { valeur: true },
      });
      if (_max.valeur && _max.valeur.toNumber() > dto.bareme) {
        throw new ConflictException(
          `Le barème ne peut pas être inférieur à une note déjà saisie (${_max.valeur.toNumber()})`,
        );
      }
    }
    try {
      // Garde atomique : une publication simultanée verrouille l'évaluation
      const { count } = await this.prisma.evaluation.updateMany({
        where: { id, statut: StatutEvaluation.BROUILLON },
        data: {
          ...(dto.nom !== undefined && { nom: dto.nom }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.coefficient !== undefined && {
            coefficient: dto.coefficient,
          }),
          ...(dto.bareme !== undefined && { bareme: dto.bareme }),
          ...(dto.date !== undefined && { date: new Date(dto.date) }),
        },
      });
      if (!count) throw this.verrouillee();
    } catch (error) {
      if (this.estViolation(error, 'P2002')) {
        throw this.nomExistant(dto.nom ?? evaluation.nom);
      }
      throw error;
    }
    return this.prisma.evaluation.findUniqueOrThrow({
      where: { id },
      select: EVALUATION,
    });
  }

  /** Supprime un brouillon avec ses notes (travail non publié). */
  async supprimer(enseignant: Enseignant, id: string) {
    const evaluation = await this.evaluationPropre(enseignant, id);
    if (evaluation.statut !== StatutEvaluation.BROUILLON) {
      throw this.verrouillee();
    }
    const { count } = await this.prisma.evaluation.deleteMany({
      where: { id, statut: StatutEvaluation.BROUILLON },
    });
    if (!count) throw this.verrouillee();
    return { id, supprimee: true };
  }

  // ---------- Notes ----------

  /** Grille : inscrits VALIDE du niveau et de l'année de la matière, avec leur note. */
  async grille(enseignant: Enseignant, id: string) {
    const { matiere, ...evaluation } = await this.evaluationPropre(
      enseignant,
      id,
    );
    const [inscrits, notes] = await Promise.all([
      this.prisma.inscription.findMany({
        where: {
          niveauId: matiere.niveauId,
          anneeAcademiqueId: matiere.anneeAcademiqueId,
          statut: StatutInscription.VALIDE,
          etudiant: { tenantId: enseignant.tenantId },
        },
        select: {
          id: true,
          etudiant: {
            select: {
              id: true,
              matricule: true,
              user: { select: { nom: true, prenom: true } },
            },
          },
        },
        orderBy: [
          { etudiant: { user: { nom: 'asc' } } },
          { etudiant: { user: { prenom: 'asc' } } },
        ],
      }),
      this.prisma.note.findMany({
        where: { evaluationId: id },
        select: NOTE,
      }),
    ]);
    const parInscription = new Map(
      notes.map((note) => [note.inscriptionId, note]),
    );
    return {
      evaluation,
      notes: inscrits.map((inscription) => ({
        inscriptionId: inscription.id,
        etudiant: {
          id: inscription.etudiant.id,
          matricule: inscription.etudiant.matricule,
          nom: inscription.etudiant.user.nom,
          prenom: inscription.etudiant.user.prenom,
        },
        note: parInscription.get(inscription.id) ?? null,
      })),
    };
  }

  /**
   * Saisie en lot, tout ou rien. Chaque ligne porte l'updatedAt de la note lue
   * dans la grille (absent si aucune note) : une valeur différente de l'état
   * actuel, ou une écriture simultanée, donne un 409 sans rien enregistrer.
   */
  async saisir(enseignant: Enseignant, id: string, dto: SaisieNotesDto) {
    const evaluation = await this.evaluationPropre(enseignant, id);
    const ids = dto.notes.map((ligne) => ligne.inscriptionId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Une inscription apparaît plusieurs fois');
    }
    // Hors établissement : 404, indiscernable d'une inscription inexistante
    await this.scope.inscriptions(enseignant.tenantId, ids);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const courante = await tx.evaluation.findUnique({
            where: { id },
            select: { statut: true, bareme: true },
          });
          if (!courante) throw new NotFoundException('Évaluation introuvable');
          if (courante.statut !== StatutEvaluation.BROUILLON) {
            throw this.verrouillee();
          }

          const notables = new Set(
            (
              await tx.inscription.findMany({
                where: {
                  id: { in: ids },
                  niveauId: evaluation.matiere.niveauId,
                  anneeAcademiqueId: evaluation.matiere.anneeAcademiqueId,
                  statut: StatutInscription.VALIDE,
                  etudiant: { tenantId: enseignant.tenantId },
                },
                select: { id: true },
              })
            ).map((inscription) => inscription.id),
          );
          const existantes = new Map(
            (
              await tx.note.findMany({
                where: { evaluationId: id, inscriptionId: { in: ids } },
              })
            ).map((note) => [note.inscriptionId, note]),
          );

          const erreurs = dto.notes.flatMap((ligne) =>
            this.controler(
              ligne,
              courante.bareme.toNumber(),
              notables,
              existantes,
            ),
          );
          if (erreurs.length) {
            const message = 'Saisie refusée : aucune note enregistrée';
            throw erreurs.some((e) => e.code === 'CONFLIT')
              ? new ConflictException(corps(409, 'Conflict', message, erreurs))
              : new BadRequestException(
                  corps(400, 'Bad Request', message, erreurs),
                );
          }

          const resultats = [];
          for (const ligne of dto.notes) {
            const etat = ligne.etat ?? EtatNote.NOTEE;
            const valeur =
              etat === EtatNote.NOTEE ? (ligne.valeur ?? null) : null;
            const commentaire = ligne.commentaire ?? null;
            const existante = existantes.get(ligne.inscriptionId);
            if (!existante) {
              resultats.push(
                await tx.note.create({
                  data: {
                    evaluationId: id,
                    inscriptionId: ligne.inscriptionId,
                    valeur,
                    etat,
                    commentaire,
                    saisiePar: enseignant.userId,
                  },
                  select: NOTE,
                }),
              );
              continue;
            }
            const inchangee =
              existante.etat === etat &&
              (existante.valeur?.toNumber() ?? null) === valeur &&
              existante.commentaire === commentaire;
            resultats.push(
              inchangee
                ? {
                    id: existante.id,
                    inscriptionId: existante.inscriptionId,
                    valeur: existante.valeur,
                    etat: existante.etat,
                    commentaire: existante.commentaire,
                    updatedAt: existante.updatedAt,
                  }
                : // where { id, updatedAt } : écrit seulement si la note n'a pas bougé
                  await tx.note.update({
                    where: { id: existante.id, updatedAt: existante.updatedAt },
                    data: {
                      valeur,
                      etat,
                      commentaire,
                      saisiePar: enseignant.userId,
                    },
                    select: NOTE,
                  }),
            );
          }
          return { enregistrees: resultats.length, notes: resultats };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // 2 écritures simultanées : P2034 (sérialisation), P2002 (note créée entre-temps),
      // P2025 (note modifiée entre la lecture et l'écriture)
      if (this.estViolation(error, 'P2034', 'P2002', 'P2025')) {
        throw new ConflictException(corps(409, 'Conflict', CONFLIT_CONCURRENT));
      }
      throw error;
    }
  }

  /** Erreurs d'une ligne de saisie (liste vide si elle est valide). */
  private controler(
    ligne: NoteLigneDto,
    bareme: number,
    notables: Set<string>,
    existantes: Map<string, { updatedAt: Date }>,
  ): ErreurLigne[] {
    const erreurs: ErreurLigne[] = [];
    const erreur = (code: ErreurLigne['code'], message: string) =>
      erreurs.push({ inscriptionId: ligne.inscriptionId, code, message });

    if (!notables.has(ligne.inscriptionId)) {
      erreur(
        'NON_NOTABLE',
        'Inscription non notable : seuls les inscrits validés de cette matière peuvent être notés',
      );
    }
    const message = erreurValeur(
      ligne.etat ?? EtatNote.NOTEE,
      ligne.valeur ?? null,
      bareme,
    );
    if (message) erreur('VALEUR_INVALIDE', message);

    const existante = existantes.get(ligne.inscriptionId);
    if (existante) {
      if (
        !ligne.updatedAt ||
        new Date(ligne.updatedAt).getTime() !== existante.updatedAt.getTime()
      ) {
        erreur(
          'CONFLIT',
          'Cette note a été modifiée depuis votre lecture : rechargez la grille',
        );
      }
    } else if (ligne.updatedAt) {
      erreur('CONFLIT', 'Cette note n’existe plus : rechargez la grille');
    }
    return erreurs;
  }

  // ---------- Publication ----------

  async publier(enseignant: Enseignant, id: string) {
    await this.evaluationPropre(enseignant, id);
    await publierEvaluation(this.prisma, id, enseignant.userId);
    return this.prisma.evaluation.findUniqueOrThrow({
      where: { id },
      select: EVALUATION,
    });
  }
}
