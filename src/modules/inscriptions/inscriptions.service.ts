import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantScopeService } from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { InscriptionDto } from './dto/inscription.dto';

@Injectable()
export class InscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}

  async create(tenantId: string, data: InscriptionDto, userId: string) {
    await this.assertReferences(tenantId, data);
    await this.assertUneInscriptionParAnnee(data);
    return this.unique(() =>
      this.prisma.inscription.create({ data: { ...data, createdBy: userId } }),
    );
  }

  findAll(tenantId: string) {
    return this.prisma.inscription.findMany({
      where: { etudiant: { tenantId } },
      include: {
        etudiant: {
          include: {
            user: { select: { nom: true, prenom: true, email: true } },
          },
        },
        niveau: true,
        anneeAcademique: true,
      },
      orderBy: { dateInscription: 'desc' },
    });
  }

  findOne(tenantId: string, id: string) {
    return this.prisma.inscription.findFirstOrThrow({
      where: { id, etudiant: { tenantId } },
      include: { etudiant: true, niveau: true, anneeAcademique: true },
    });
  }

  async update(tenantId: string, id: string, data: InscriptionDto) {
    await this.scope.inscription(tenantId, id);
    await this.assertReferences(tenantId, data);
    await this.assertUneInscriptionParAnnee(data, id);
    return this.unique(() => this.mettreAJour(id, data));
  }

  /**
   * Une inscription qui porte des notes ne change plus d'étudiant, de niveau,
   * d'année ni de statut : les notes, les moyennes et la présence dans les
   * grilles en dépendent. Seuls les frais restent modifiables. Contrôle et
   * écriture dans une même transaction sérialisable : une note saisie en même
   * temps ne peut pas passer entre les deux.
   */
  private async mettreAJour(id: string, data: InscriptionDto) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const actuelle = await tx.inscription.findUniqueOrThrow({
            where: { id },
            select: {
              etudiantId: true,
              niveauId: true,
              anneeAcademiqueId: true,
              statut: true,
              _count: { select: { notes: true } },
            },
          });
          const modifies = [
            data.etudiantId !== actuelle.etudiantId && 'l’étudiant',
            data.niveauId !== actuelle.niveauId && 'le niveau',
            data.anneeAcademiqueId !== actuelle.anneeAcademiqueId &&
              'l’année académique',
            data.statut !== undefined &&
              data.statut !== actuelle.statut &&
              'le statut',
          ].filter(Boolean);
          if (actuelle._count.notes > 0 && modifies.length > 0) {
            throw new ConflictException(
              `Impossible de modifier ${modifies.join(', ')} : cette inscription porte déjà des notes. Traitez d’abord les notes de l’étudiant (seuls les frais d’inscription restent modifiables).`,
            );
          }
          return tx.inscription.update({ where: { id }, data });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034') {
          throw new ConflictException(
            'Cette inscription est modifiée en même temps par une autre opération : réessayez',
          );
        }
        if (error.code === 'P2025') {
          throw new NotFoundException('Inscription introuvable');
        }
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string) {
    await this.scope.inscription(tenantId, id);
    return this.prisma.inscription.delete({ where: { id } });
  }

  /** Un étudiant n'a qu'une inscription par année académique (hors celle modifiée). */
  private async assertUneInscriptionParAnnee(
    data: InscriptionDto,
    excludeId?: string,
  ) {
    const existante = await this.prisma.inscription.findFirst({
      where: {
        etudiantId: data.etudiantId,
        anneeAcademiqueId: data.anneeAcademiqueId,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (existante) throw this.inscriptionExistante();
  }

  /** Deux requêtes simultanées : la contrainte d'unicité tranche, avec le même message. */
  private async unique<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.inscriptionExistante();
      }
      throw error;
    }
  }

  private inscriptionExistante() {
    return new ConflictException(
      'Cet étudiant a déjà une inscription pour cette année académique',
    );
  }

  private async assertReferences(tenantId: string, data: InscriptionDto) {
    await this.scope.etudiant(tenantId, data.etudiantId);
    await this.scope.niveau(tenantId, data.niveauId);
    await this.scope.anneeAcademique(tenantId, data.anneeAcademiqueId);
  }
}
