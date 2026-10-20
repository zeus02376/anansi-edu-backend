import { Injectable } from '@nestjs/common';
import {
  niveauInTenant,
  TenantScopeService,
} from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { NiveauDto } from './dto/niveau.dto';

@Injectable()
export class NiveauxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}
  async create(tenantId: string, data: NiveauDto) {
    await this.scope.filiere(tenantId, data.filiereId);
    return this.prisma.niveau.create({ data });
  }
  findAll(tenantId: string) {
    return this.prisma.niveau.findMany({
      where: niveauInTenant(tenantId),
      orderBy: { ordre: 'asc' },
    });
  }
  findOne(tenantId: string, id: string) {
    return this.prisma.niveau.findFirstOrThrow({
      where: { id, ...niveauInTenant(tenantId) },
    });
  }
  async update(tenantId: string, id: string, data: NiveauDto) {
    await this.scope.niveau(tenantId, id);
    await this.scope.filiere(tenantId, data.filiereId);
    return this.prisma.niveau.update({ where: { id }, data });
  }
  async remove(tenantId: string, id: string) {
    await this.scope.niveau(tenantId, id);
    return this.prisma.niveau.delete({ where: { id } });
  }
}
