import { Injectable } from '@nestjs/common';
import { Langue, Prisma } from '@prisma/client';
import { TenantScopeService } from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { FiliereDto } from './dto/filiere.dto';
import { SuggestionsQueryDto } from './dto/suggestions-query.dto';

// Toute filière est renvoyée avec son école et le campus de celle-ci
const withEcole = { ecole: { include: { campus: true } } } as const;

@Injectable()
export class FilieresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}
  async create(tenantId: string, data: FiliereDto) {
    await this.scope.ecole(tenantId, data.ecoleId);
    return this.prisma.filiere.create({ data, include: withEcole });
  }
  findAll(tenantId: string) {
    return this.prisma.filiere.findMany({
      where: { ecole: { tenantId } },
      include: withEcole,
      orderBy: { nom: 'asc' },
    });
  }
  /** Simple filtre sur les champs existants : ni scoring ni IA. */
  suggestions(
    tenantId: string,
    { langue, niveauEntree, motCle, campusId }: SuggestionsQueryDto,
  ) {
    const contains = (value: string) => ({
      contains: value,
      mode: Prisma.QueryMode.insensitive,
    });
    const where: Prisma.FiliereWhereInput = {
      ecole: { tenantId, ...(campusId && { campusId }) },
      ...(langue && { langue: { in: [langue, Langue.FR_EN] } }),
      ...(niveauEntree && { niveauEntree: contains(niveauEntree) }),
      ...(motCle && {
        OR: [
          { nom: contains(motCle) },
          { code: contains(motCle) },
          { ecole: { nom: contains(motCle) } },
          { ecole: { description: contains(motCle) } },
        ],
      }),
    };
    return this.prisma.filiere.findMany({
      where,
      include: withEcole,
      orderBy: { nom: 'asc' },
    });
  }
  findOne(tenantId: string, id: string) {
    return this.prisma.filiere.findFirstOrThrow({
      where: { id, ecole: { tenantId } },
      include: withEcole,
    });
  }
  async update(tenantId: string, id: string, data: FiliereDto) {
    await this.scope.filiere(tenantId, id);
    await this.scope.ecole(tenantId, data.ecoleId);
    return this.prisma.filiere.update({
      where: { id },
      data,
      include: withEcole,
    });
  }
  async remove(tenantId: string, id: string) {
    await this.scope.filiere(tenantId, id);
    return this.prisma.filiere.delete({ where: { id } });
  }
}
