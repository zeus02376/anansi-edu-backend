import { Injectable } from '@nestjs/common';
import {
  matiereInTenant,
  TenantScopeService,
} from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { MatiereDto } from './dto/matiere.dto';

@Injectable()
export class MatieresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}
  async create(tenantId: string, data: MatiereDto) {
    await this.assertReferences(tenantId, data);
    return this.prisma.matiere.create({ data });
  }
  findAll(tenantId: string) {
    return this.prisma.matiere.findMany({
      where: matiereInTenant(tenantId),
      orderBy: { nom: 'asc' },
    });
  }
  findOne(tenantId: string, id: string) {
    return this.prisma.matiere.findFirstOrThrow({
      where: { id, ...matiereInTenant(tenantId) },
    });
  }
  async update(tenantId: string, id: string, data: MatiereDto) {
    await this.scope.matiere(tenantId, id);
    await this.assertReferences(tenantId, data);
    return this.prisma.matiere.update({ where: { id }, data });
  }
  async remove(tenantId: string, id: string) {
    await this.scope.matiere(tenantId, id);
    return this.prisma.matiere.delete({ where: { id } });
  }

  private async assertReferences(tenantId: string, data: MatiereDto) {
    await this.scope.niveau(tenantId, data.niveauId);
    await this.scope.anneeAcademique(tenantId, data.anneeAcademiqueId);
  }
}
