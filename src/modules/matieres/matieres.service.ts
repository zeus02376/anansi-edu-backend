import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const current = await this.prisma.matiere.findFirst({
      where: { id, ...matiereInTenant(tenantId) },
      select: { anneeAcademiqueId: true },
    });
    if (!current) throw new NotFoundException('Matière introuvable');
    await this.assertReferences(tenantId, data);
    // Les affectations portent l'année de leur matière : on ne la déplace pas dessous
    if (
      data.anneeAcademiqueId !== current.anneeAcademiqueId &&
      (await this.prisma.affectation.count({ where: { matiereId: id } })) > 0
    ) {
      throw new ConflictException(
        'L’année d’une matière ne peut pas être modifiée tant que des enseignants lui sont affectés',
      );
    }
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
