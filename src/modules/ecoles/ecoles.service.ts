import { Injectable } from '@nestjs/common';
import { TenantScopeService } from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { EcoleDto } from './dto/ecole.dto';

@Injectable()
export class EcolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}
  async create(tenantId: string, data: EcoleDto) {
    await this.assertCampus(tenantId, data);
    // L'établissement vient du JWT : le tenantId du corps est ignoré
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _ignored, ...fields } = data;
    return this.prisma.ecole.create({
      data: { ...fields, tenantId },
      include: { campus: true },
    });
  }
  findAll(tenantId: string) {
    return this.prisma.ecole.findMany({
      where: { tenantId },
      include: { campus: true },
      orderBy: { nom: 'asc' },
    });
  }
  findOne(tenantId: string, id: string) {
    return this.prisma.ecole.findFirstOrThrow({
      where: { id, tenantId },
      include: { campus: true },
    });
  }
  async update(tenantId: string, id: string, data: EcoleDto) {
    await this.scope.ecole(tenantId, id);
    await this.assertCampus(tenantId, data);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _ignored, ...fields } = data;
    return this.prisma.ecole.update({
      where: { id },
      data: fields,
      include: { campus: true },
    });
  }
  async remove(tenantId: string, id: string) {
    await this.scope.ecole(tenantId, id);
    return this.prisma.ecole.delete({ where: { id } });
  }

  private async assertCampus(tenantId: string, { campusId }: EcoleDto) {
    if (campusId) await this.scope.campus(tenantId, campusId);
  }
}
