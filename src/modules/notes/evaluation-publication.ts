import { ConflictException } from '@nestjs/common';
import { ActionPublication, Prisma, StatutEvaluation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CONFLIT_CONCURRENT = {
  statusCode: 409,
  error: 'Conflict',
  message:
    'Les notes ont été modifiées par une autre requête : rechargez la grille puis réessayez',
  erreurs: [],
};

const serializable = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

/** Une écriture simultanée (sérialisation) devient un 409 clair. */
function enConflit(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}

/**
 * Publie une évaluation (BROUILLON → PUBLIEE) et l'inscrit au journal.
 * Partagé par l'enseignant (sa propre évaluation) et le personnel.
 */
export async function publierEvaluation(
  prisma: PrismaService,
  evaluationId: string,
  userId: string,
) {
  try {
    await prisma.$transaction(async (tx) => {
      if (!(await tx.note.count({ where: { evaluationId } }))) {
        throw new ConflictException('Aucune note saisie : rien à publier');
      }
      const { count } = await tx.evaluation.updateMany({
        where: { id: evaluationId, statut: StatutEvaluation.BROUILLON },
        data: {
          statut: StatutEvaluation.PUBLIEE,
          publieLe: new Date(),
          publiePar: userId,
        },
      });
      if (!count) {
        throw new ConflictException('Cette évaluation est déjà publiée');
      }
      await tx.evaluationHistorique.create({
        data: { evaluationId, action: ActionPublication.PUBLICATION, userId },
      });
    }, serializable);
  } catch (error) {
    if (enConflit(error)) throw new ConflictException(CONFLIT_CONCURRENT);
    throw error;
  }
}

/**
 * Dépublie une évaluation (PUBLIEE → BROUILLON) : elle redevient modifiable par
 * son enseignant. Le motif est obligatoire et journalisé.
 */
export async function depublierEvaluation(
  prisma: PrismaService,
  evaluationId: string,
  userId: string,
  motif: string,
) {
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.evaluation.updateMany({
        where: { id: evaluationId, statut: StatutEvaluation.PUBLIEE },
        data: {
          statut: StatutEvaluation.BROUILLON,
          publieLe: null,
          publiePar: null,
        },
      });
      if (!count) {
        throw new ConflictException('Cette évaluation n’est pas publiée');
      }
      await tx.evaluationHistorique.create({
        data: {
          evaluationId,
          action: ActionPublication.DEPUBLICATION,
          motif,
          userId,
        },
      });
    }, serializable);
  } catch (error) {
    if (enConflit(error)) throw new ConflictException(CONFLIT_CONCURRENT);
    throw error;
  }
}
