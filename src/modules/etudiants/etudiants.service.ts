import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StatutCandidature, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { formatMatricule } from '../../common/utils/matricule.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEtudiantDto } from './dto/create-etudiant.dto';

@Injectable()
export class EtudiantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateEtudiantDto) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id: data.candidatureId },
    });
    if (!candidature) {
      throw new NotFoundException('Candidature introuvable');
    }
    if (candidature.statut !== StatutCandidature.ACCEPTE) {
      throw new BadRequestException('La candidature doit être acceptée');
    }
    if (candidature.tenantId !== data.tenantId) {
      throw new BadRequestException(
        'Le tenant doit correspondre à celui de la candidature',
      );
    }

    const passwordHash = await bcrypt.hash(randomUUID(), 12);
    const year = new Date().getFullYear();
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: candidature.tenantId,
          nom: candidature.nom,
          prenom: candidature.prenom,
          email: candidature.email,
          telephone: candidature.telephone,
          motDePasseHash: passwordHash,
          role: Role.ETUDIANT,
        },
      });
      const existingCount = await tx.etudiant.count({
        where: { matricule: { startsWith: `IUC-${year}-` } },
      });
      return tx.etudiant.create({
        data: {
          userId: user.id,
          tenantId: candidature.tenantId,
          matricule: formatMatricule(year, existingCount + 1),
          dateNaissance: candidature.dateNaissance,
          lieuNaissance: candidature.lieuNaissance,
          nationalite: candidature.nationalite,
        },
        include: {
          user: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              email: true,
              role: true,
            },
          },
        },
      });
    });
  }

  findAll() {
    return this.prisma.etudiant.findMany({
      include: {
        user: { select: { id: true, nom: true, prenom: true, email: true } },
        inscriptions: true,
      },
    });
  }

  findOne(id: string) {
    return this.prisma.etudiant.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, nom: true, prenom: true, email: true } },
        inscriptions: true,
      },
    });
  }
}
