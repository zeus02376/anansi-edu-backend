import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatutCandidature } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCandidatureDto,
  UpdateCandidatureStatusDto,
} from './dto/candidature.dto';

const { SOUMIS, INCOMPLET, EN_EXAMEN, ACCEPTE, REJETE } = StatutCandidature;

/**
 * Transitions autorisées. ACCEPTE devient définitif dès qu'un compte
 * Étudiant existe ; quitter ou atteindre REJETE exige un commentaire.
 */
export const TRANSITIONS: Record<StatutCandidature, StatutCandidature[]> = {
  [SOUMIS]: [EN_EXAMEN, INCOMPLET, REJETE],
  [INCOMPLET]: [EN_EXAMEN, REJETE],
  [EN_EXAMEN]: [ACCEPTE, REJETE, INCOMPLET],
  [ACCEPTE]: [EN_EXAMEN, REJETE],
  [REJETE]: [EN_EXAMEN],
};

@Injectable()
export class CandidaturesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCandidatureDto) {
    try {
      return await this.createInTransaction(data);
    } catch (error) {
      // Deux dépôts simultanés : la transaction sérialisable en rejette un
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Dépôt concurrent détecté : vérifiez votre candidature avant de réessayer',
        );
      }
      throw error;
    }
  }

  private createInTransaction(data: CreateCandidatureDto) {
    const year = new Date().getFullYear();
    const numeroDossier = `CAND-${year}-${randomUUID().slice(0, 8).toUpperCase()}`;
    return this.prisma.$transaction(
      async (tx) => {
        const [tenant, filiere, anneeAcademique] = await Promise.all([
          tx.tenant.findUnique({
            where: { id: data.tenantId },
            select: { id: true },
          }),
          tx.filiere.findFirst({
            where: { id: data.filiereId, ecole: { tenantId: data.tenantId } },
            select: { id: true },
          }),
          tx.anneeAcademique.findFirst({
            where: { id: data.anneeAcademiqueId, tenantId: data.tenantId },
            select: { id: true },
          }),
        ]);
        if (!tenant) {
          throw new BadRequestException('Établissement introuvable');
        }
        if (!filiere) {
          throw new BadRequestException(
            'Filière introuvable pour cet établissement',
          );
        }
        if (!anneeAcademique) {
          throw new BadRequestException(
            'Année académique introuvable pour cet établissement',
          );
        }
        // Une seule candidature active (non rejetée) par e-mail, filière et année.
        // Le message ne révèle pas le numéro de dossier existant.
        const doublon = await tx.candidature.findFirst({
          where: {
            email: { equals: data.email, mode: 'insensitive' },
            filiereId: data.filiereId,
            anneeAcademiqueId: data.anneeAcademiqueId,
            statut: { not: REJETE },
          },
          select: { id: true },
        });
        if (doublon) {
          throw new ConflictException(
            'Une candidature est déjà en cours pour cet e-mail, cette filière et cette année académique',
          );
        }
        return tx.candidature.create({
          data: {
            ...data,
            dateNaissance: new Date(data.dateNaissance),
            numeroDossier,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  findAll(tenantId: string) {
    return this.prisma.candidature.findMany({
      where: { tenantId },
      include: { filiere: true, anneeAcademique: true, historiques: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.candidature.findUniqueOrThrow({
      where: { id },
      include: { documents: true, historiques: true },
    });
  }

  /**
   * Suivi public par numéro de dossier exact : sous-ensemble sûr uniquement
   * (ni e-mail, ni téléphone, ni documents, ni historique). L'identifiant
   * (UUID non devinable) permet au candidat de déposer ses documents : l'upload
   * exige toujours le numéro de dossier ET l'e-mail.
   */
  async suivi(numeroDossier: string) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { numeroDossier },
      select: {
        id: true,
        numeroDossier: true,
        statut: true,
        nom: true,
        prenom: true,
        createdAt: true,
        filiere: {
          select: { nom: true, code: true, ecole: { select: { nom: true } } },
        },
        anneeAcademique: { select: { libelle: true } },
      },
    });
    if (!candidature) {
      throw new NotFoundException(
        'Aucune candidature ne correspond à ce numéro de dossier',
      );
    }
    const { createdAt, filiere, anneeAcademique, ...identite } = candidature;
    return {
      ...identite,
      dateDepot: createdAt,
      filiere: { nom: filiere.nom, code: filiere.code },
      ecole: filiere.ecole.nom,
      anneeAcademique: anneeAcademique.libelle,
    };
  }

  async updateStatus(
    id: string,
    user: { id: string; tenantId: string },
    data: UpdateCandidatureStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const candidature = await tx.candidature.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { etudiant: { select: { id: true } } },
      });
      if (!candidature) {
        throw new NotFoundException('Candidature introuvable');
      }

      const from = candidature.statut;
      const to = data.statut;
      if (from === to) {
        throw new BadRequestException(
          `La candidature est déjà au statut ${to}`,
        );
      }
      if (from === ACCEPTE && candidature.etudiant) {
        throw new ConflictException(
          'Un compte étudiant a été créé pour cette candidature : la décision ACCEPTE est définitive',
        );
      }
      if (!TRANSITIONS[from].includes(to)) {
        throw new BadRequestException(
          `Transition ${from} → ${to} non autorisée (possibles : ${TRANSITIONS[from].join(', ')})`,
        );
      }
      const commentaire = data.commentaire?.trim();
      if (to === REJETE && !commentaire) {
        throw new BadRequestException(
          'Un motif de refus (commentaire) est obligatoire pour rejeter une candidature',
        );
      }
      if (from === REJETE && !commentaire) {
        throw new BadRequestException(
          'Un commentaire est obligatoire pour rouvrir une candidature rejetée',
        );
      }

      const updated = await tx.candidature.update({
        where: { id },
        data: { statut: to },
      });
      await tx.historiqueCandidature.create({
        data: {
          candidatureId: id,
          userId: user.id,
          action: `STATUT_${to}`,
          commentaire: commentaire || null,
        },
      });
      return updated;
    });
  }

  remove(id: string) {
    return this.prisma.candidature.delete({ where: { id } });
  }
}
