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
import { TenantScopeService } from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEtudiantDto } from './dto/create-etudiant.dto';
import { UpdateEtudiantDto } from './dto/update-etudiant.dto';

@Injectable()
export class EtudiantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}

  private matriculeIucPris() {
    return new ConflictException(
      'Ce matricule IUC est déjà attribué à un autre étudiant',
    );
  }

  /** Refuse un matricule IUC déjà attribué à un autre étudiant. */
  private async assertMatriculeIucLibre(
    matriculeIuc: string | null | undefined,
    exceptId?: string,
  ) {
    if (!matriculeIuc) return;
    const pris = await this.prisma.etudiant.findFirst({
      where: { matriculeIuc, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true },
    });
    if (pris) throw this.matriculeIucPris();
  }

  /** Modification par le personnel (matricule IUC) : 404 hors de l'établissement. */
  async update(id: string, tenantId: string, data: UpdateEtudiantDto) {
    await this.scope.etudiant(tenantId, id);
    if (data.matriculeIuc === undefined) {
      throw new BadRequestException('Aucune modification fournie');
    }
    await this.assertMatriculeIucLibre(data.matriculeIuc, id);
    try {
      return await this.prisma.etudiant.update({
        where: { id },
        data: { matriculeIuc: data.matriculeIuc },
        include: {
          user: { select: { id: true, nom: true, prenom: true, email: true } },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.matriculeIucPris();
      }
      throw error;
    }
  }

  async create(data: CreateEtudiantDto, tenantId: string) {
    await this.assertMatriculeIucLibre(data.matriculeIuc);
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
            matriculeIuc: data.matriculeIuc ?? null,
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
        if (String(error.meta?.target).includes('matriculeIuc')) {
          throw this.matriculeIucPris();
        }
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

  /**
   * Dossier d'un étudiant pour le personnel. Champs explicitement listés (comme
   * les routes « moi ») : un futur champ du modèle n'est jamais exposé par
   * défaut, et rien d'interne (tenantId, userId, createdBy) ne sort.
   */
  findOne(id: string, tenantId: string) {
    return this.prisma.etudiant.findFirstOrThrow({
      where: { id, tenantId },
      select: {
        id: true,
        matricule: true,
        matriculeIuc: true,
        dateNaissance: true,
        lieuNaissance: true,
        nationalite: true,
        photoUrl: true,
        candidatureId: true,
        user: { select: { id: true, nom: true, prenom: true, email: true } },
        inscriptions: {
          select: {
            id: true,
            statut: true,
            dateInscription: true,
            fraisPayes: true,
            niveau: {
              select: { id: true, nom: true, code: true, ordre: true },
            },
            anneeAcademique: {
              select: {
                id: true,
                libelle: true,
                dateDebut: true,
                dateFin: true,
              },
            },
          },
          orderBy: { dateInscription: 'desc' },
        },
      },
    });
  }
}
