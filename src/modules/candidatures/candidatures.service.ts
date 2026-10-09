import {
  BadRequestException,
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
      if (!tenant || !filiere || !anneeAcademique) {
        throw new BadRequestException(
          'Établissement, filière et année académique doivent exister dans le même tenant',
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

  findAll() {
    return this.prisma.candidature.findMany({
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
    userId: string,
    data: UpdateCandidatureStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const candidature = await tx.candidature.findUnique({ where: { id } });
      if (!candidature) {
        throw new NotFoundException('Candidature introuvable');
      }
      const updated = await tx.candidature.update({
        where: { id },
        data: { statut: data.statut },
      });
      if (candidature.statut !== data.statut) {
        await tx.historiqueCandidature.create({
          data: {
            candidatureId: id,
            userId,
            action: `STATUT_${data.statut}`,
            commentaire: data.commentaire,
          },
        });
      }
      return updated;
    });
  }

  remove(id: string) {
    return this.prisma.candidature.delete({ where: { id } });
  }
}
