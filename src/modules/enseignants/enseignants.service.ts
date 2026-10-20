import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { matiereInTenant } from '../../common/tenant/tenant-scope.service';
import { TenantScopeService } from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { AffectationDto, EnseignantDto } from './dto/enseignant.dto';

@Injectable()
export class EnseignantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}
  async create(tenantId: string, data: EnseignantDto) {
    await this.scope.user(tenantId, data.userId);
    // L'établissement vient du JWT : le tenantId du corps est ignoré
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _ignored, ...fields } = data;
    return this.prisma.enseignant.create({ data: { ...fields, tenantId } });
  }
  findAll(tenantId: string) {
    return this.prisma.enseignant.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, nom: true, prenom: true, email: true } },
        affectations: true,
      },
    });
  }
  findOne(tenantId: string, id: string) {
    return this.prisma.enseignant.findFirstOrThrow({
      where: { id, tenantId },
      include: {
        user: { select: { id: true, nom: true, prenom: true, email: true } },
        affectations: true,
      },
    });
  }
  async update(tenantId: string, id: string, data: EnseignantDto) {
    await this.scope.enseignant(tenantId, id);
    await this.scope.user(tenantId, data.userId);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _ignored, ...fields } = data;
    return this.prisma.enseignant.update({ where: { id }, data: fields });
  }
  async remove(tenantId: string, id: string) {
    await this.scope.enseignant(tenantId, id);
    return this.prisma.enseignant.delete({ where: { id } });
  }
  async createAffectation(
    tenantId: string,
    enseignantId: string,
    data: AffectationDto,
  ) {
    await this.scope.enseignant(tenantId, enseignantId);
    const matiere = await this.prisma.matiere.findFirst({
      where: { id: data.matiereId, ...matiereInTenant(tenantId) },
      select: { anneeAcademiqueId: true, nom: true },
    });
    if (!matiere) throw new NotFoundException('Matière introuvable');
    await this.scope.anneeAcademique(tenantId, data.anneeAcademiqueId);
    if (data.anneeAcademiqueId !== matiere.anneeAcademiqueId) {
      throw new BadRequestException(
        `L’année de l’affectation doit être celle de la matière « ${matiere.nom} »`,
      );
    }
    const dejaAffecte = await this.prisma.affectation.findFirst({
      where: { enseignantId, matiereId: data.matiereId },
      select: { id: true },
    });
    if (dejaAffecte) throw this.affectationExistante();
    try {
      return await this.prisma.affectation.create({
        data: { ...data, enseignantId },
      });
    } catch (error) {
      // Deux requêtes simultanées : la contrainte d'unicité tranche
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.affectationExistante();
      }
      throw error;
    }
  }

  private affectationExistante() {
    return new ConflictException(
      'Cet enseignant est déjà affecté à cette matière',
    );
  }
  async findAffectations(tenantId: string, enseignantId: string) {
    await this.scope.enseignant(tenantId, enseignantId);
    return this.prisma.affectation.findMany({
      where: { enseignantId },
      include: { matiere: true, anneeAcademique: true },
    });
  }
}
