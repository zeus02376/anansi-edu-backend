import { Injectable } from '@nestjs/common';
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
    await this.scope.matiere(tenantId, data.matiereId);
    await this.scope.anneeAcademique(tenantId, data.anneeAcademiqueId);
    return this.prisma.affectation.create({ data: { ...data, enseignantId } });
  }
  async findAffectations(tenantId: string, enseignantId: string) {
    await this.scope.enseignant(tenantId, enseignantId);
    return this.prisma.affectation.findMany({
      where: { enseignantId },
      include: { matiere: true, anneeAcademique: true },
    });
  }
}
