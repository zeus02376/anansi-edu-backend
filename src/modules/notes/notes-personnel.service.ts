import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EtatNote, Prisma, StatutInscription } from '@prisma/client';
import {
  matiereInTenant,
  TenantScopeService,
} from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CorrectionNoteDto,
  ListeEvaluationsQueryDto,
} from './dto/notes-personnel.dto';
import {
  depublierEvaluation,
  publierEvaluation,
} from './evaluation-publication';
import { erreurValeur } from './valeur-note';

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
  creePar: true,
  createdAt: true,
  updatedAt: true,
  matiere: { select: { id: true, nom: true, code: true } },
  _count: { select: { notes: true } },
} satisfies Prisma.EvaluationSelect;

const NOTE = {
  id: true,
  evaluationId: true,
  inscriptionId: true,
  valeur: true,
  etat: true,
  commentaire: true,
  updatedAt: true,
} satisfies Prisma.NoteSelect;

const corps = (statusCode: number, error: string, message: string) => ({
  statusCode,
  error,
  message,
  erreurs: [],
});

/**
 * Consultation et corrections du personnel (ADMIN, SCOLARITE), limitées à
 * l'établissement du JWT : toute référence passe par TenantScopeService, 404 sinon.
 */
@Injectable()
export class NotesPersonnelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}

  /** Nom et prénom des comptes (créateurs, auteurs des corrections). */
  private async auteurs(ids: (string | null)[]) {
    const uniques = [...new Set(ids.filter((id): id is string => !!id))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniques } },
      select: { id: true, nom: true, prenom: true },
    });
    return new Map(users.map((user) => [user.id, user]));
  }

  async listerEvaluations(tenantId: string, query: ListeEvaluationsQueryDto) {
    if (query.matiereId) await this.scope.matiere(tenantId, query.matiereId);
    if (query.anneeId) {
      await this.scope.anneeAcademique(tenantId, query.anneeId);
    }
    const evaluations = await this.prisma.evaluation.findMany({
      where: {
        ...(query.matiereId && { matiereId: query.matiereId }),
        matiere: {
          ...matiereInTenant(tenantId),
          ...(query.anneeId && { anneeAcademiqueId: query.anneeId }),
        },
      },
      select: EVALUATION,
      orderBy: { createdAt: 'desc' },
    });
    const auteurs = await this.auteurs(evaluations.map((e) => e.creePar));
    return evaluations.map(({ creePar, ...evaluation }) => ({
      ...evaluation,
      createur: auteurs.get(creePar) ?? null,
    }));
  }

  /** Grille : inscrits VALIDE de la matière et toute inscription ayant une note ici. */
  async grille(tenantId: string, id: string) {
    await this.scope.evaluation(tenantId, id);
    const { historique, creePar, ...evaluation } =
      await this.prisma.evaluation.findUniqueOrThrow({
        where: { id },
        select: {
          ...EVALUATION,
          matiere: {
            select: {
              id: true,
              nom: true,
              code: true,
              niveauId: true,
              anneeAcademiqueId: true,
            },
          },
          historique: {
            select: { action: true, motif: true, userId: true, date: true },
            orderBy: { date: 'desc' },
          },
        },
      });
    const { niveauId, anneeAcademiqueId, ...matiere } = evaluation.matiere;
    const inscrits = await this.prisma.inscription.findMany({
      where: {
        etudiant: { tenantId },
        OR: [
          { niveauId, anneeAcademiqueId, statut: StatutInscription.VALIDE },
          { notes: { some: { evaluationId: id } } },
        ],
      },
      select: {
        id: true,
        statut: true,
        etudiant: {
          select: {
            id: true,
            matricule: true,
            matriculeIuc: true,
            user: { select: { nom: true, prenom: true } },
          },
        },
        notes: { where: { evaluationId: id }, select: NOTE },
      },
      orderBy: [
        { etudiant: { user: { nom: 'asc' } } },
        { etudiant: { user: { prenom: 'asc' } } },
      ],
    });
    const auteurs = await this.auteurs([
      creePar,
      ...historique.map((h) => h.userId),
    ]);
    return {
      evaluation: {
        ...evaluation,
        matiere,
        createur: auteurs.get(creePar) ?? null,
      },
      publications: historique.map(({ userId, ...event }) => ({
        ...event,
        auteur: auteurs.get(userId) ?? null,
      })),
      notes: inscrits.map((inscription) => ({
        inscriptionId: inscription.id,
        statutInscription: inscription.statut,
        etudiant: {
          id: inscription.etudiant.id,
          matricule: inscription.etudiant.matricule,
          matriculeIuc: inscription.etudiant.matriculeIuc,
          nom: inscription.etudiant.user.nom,
          prenom: inscription.etudiant.user.prenom,
        },
        note: inscription.notes[0] ?? null,
      })),
    };
  }

  /**
   * Correction d'une note, publiée ou non : remplace état, valeur et commentaire,
   * avec un motif obligatoire, et écrit une ligne dans NoteHistorique.
   */
  async corriger(
    tenantId: string,
    userId: string,
    noteId: string,
    dto: CorrectionNoteDto,
  ) {
    await this.scope.note(tenantId, noteId);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const note = await tx.note.findUniqueOrThrow({
            where: { id: noteId },
            include: { evaluation: { select: { bareme: true } } },
          });
          if (
            dto.updatedAt &&
            new Date(dto.updatedAt).getTime() !== note.updatedAt.getTime()
          ) {
            throw new ConflictException(
              corps(
                409,
                'Conflict',
                'Cette note a été modifiée depuis votre lecture : rechargez-la',
              ),
            );
          }
          const etat = dto.etat ?? EtatNote.NOTEE;
          const valeur = dto.valeur ?? null;
          const commentaire = dto.commentaire ?? null;
          const message = erreurValeur(
            etat,
            valeur,
            note.evaluation.bareme.toNumber(),
          );
          if (message) throw new BadRequestException(message);
          if (
            etat === note.etat &&
            valeur === (note.valeur?.toNumber() ?? null) &&
            commentaire === note.commentaire
          ) {
            throw new BadRequestException(
              'Aucune modification : la note est identique',
            );
          }

          const corrigee = await tx.note.update({
            where: { id: noteId, updatedAt: note.updatedAt },
            data: { valeur, etat, commentaire, saisiePar: userId },
            select: NOTE,
          });
          await tx.noteHistorique.create({
            data: {
              noteId,
              ancienneValeur: note.valeur,
              nouvelleValeur: valeur,
              ancienEtat: note.etat,
              nouvelEtat: etat,
              motif: dto.motif,
              modifiePar: userId,
            },
          });
          return corrigee;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // Correction simultanée : sérialisation (P2034) ou note modifiée entre-temps (P2025)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2025'].includes(error.code)
      ) {
        throw new ConflictException(
          corps(
            409,
            'Conflict',
            'La note a été modifiée par une autre requête : rechargez-la puis réessayez',
          ),
        );
      }
      throw error;
    }
  }

  async historique(tenantId: string, noteId: string) {
    await this.scope.note(tenantId, noteId);
    const lignes = await this.prisma.noteHistorique.findMany({
      where: { noteId },
      orderBy: { date: 'desc' },
    });
    const auteurs = await this.auteurs(lignes.map((ligne) => ligne.modifiePar));
    return lignes.map(({ modifiePar, ...ligne }) => ({
      ...ligne,
      auteur: auteurs.get(modifiePar) ?? null,
    }));
  }

  async publier(tenantId: string, userId: string, id: string) {
    await this.scope.evaluation(tenantId, id);
    await publierEvaluation(this.prisma, id, userId);
    return this.resume(id);
  }

  async depublier(tenantId: string, userId: string, id: string, motif: string) {
    await this.scope.evaluation(tenantId, id);
    await depublierEvaluation(this.prisma, id, userId, motif);
    return this.resume(id);
  }

  private async resume(id: string) {
    const evaluation = await this.prisma.evaluation.findUniqueOrThrow({
      where: { id },
      select: EVALUATION,
    });
    const auteurs = await this.auteurs([evaluation.creePar]);
    const { creePar, ...resume } = evaluation;
    return { ...resume, createur: auteurs.get(creePar) ?? null };
  }
}
