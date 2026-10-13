import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StatutCandidature } from '@prisma/client';
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

  create(data: CreateCandidatureDto) {
    const year = new Date().getFullYear();
    const numeroDossier = `CAND-${year}-${randomUUID().slice(0, 8).toUpperCase()}`;
    return this.prisma.$transaction(async (tx) => {
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
      return tx.candidature.create({
        data: {
          ...data,
          dateNaissance: new Date(data.dateNaissance),
          numeroDossier,
        },
      });
    });
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
