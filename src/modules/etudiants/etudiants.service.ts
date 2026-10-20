import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatutCandidature, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { formatMatricule } from '../../common/utils/matricule.util';
import { generateTemporaryPassword } from '../../common/utils/password.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEtudiantDto } from './dto/create-etudiant.dto';

@Injectable()
export class EtudiantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateEtudiantDto, tenantId: string) {
    // Renvoyé une seule fois à l'appelant ; seul le hash est stocké
    const motDePasseTemporaire = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(motDePasseTemporaire, 12);
    const year = new Date().getFullYear();
    try {
      const etudiant = await this.prisma.$transaction(async (tx) => {
        const candidature = await tx.candidature.findFirst({
          where: { id: data.candidatureId, tenantId },
          include: { etudiant: { select: { id: true } } },
        });
        if (!candidature) {
          throw new NotFoundException('Candidature introuvable');
        }
        if (candidature.statut !== StatutCandidature.ACCEPTE) {
          throw new BadRequestException('La candidature doit être acceptée');
        }
        if (candidature.etudiant) {
          throw new ConflictException(
            'Un compte étudiant existe déjà pour cette candidature',
          );
        }

        const user = await tx.user.create({
          data: {
            tenantId: candidature.tenantId,
            nom: candidature.nom,
            prenom: candidature.prenom,
            email: candidature.email,
            telephone: candidature.telephone,
            motDePasseHash: passwordHash,
            role: Role.ETUDIANT,
            doitChangerMotDePasse: true,
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
            candidatureId: candidature.id,
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
      return { ...etudiant, motDePasseTemporaire };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Cette adresse ou cette candidature est déjà associée à un compte',
        );
      }
      throw error;
    }
  }

  findAll(tenantId: string) {
    return this.prisma.etudiant.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, nom: true, prenom: true, email: true } },
        inscriptions: true,
      },
    });
  }

  findOne(id: string, tenantId: string) {
    return this.prisma.etudiant.findFirstOrThrow({
      where: { id, tenantId },
      include: {
        user: { select: { id: true, nom: true, prenom: true, email: true } },
        inscriptions: {
          include: {
            niveau: true,
            anneeAcademique: true,
          },
        },
      },
    });
  }
}
