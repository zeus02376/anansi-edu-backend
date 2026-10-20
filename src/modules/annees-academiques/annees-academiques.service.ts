import { Injectable } from '@nestjs/common';
import { TenantScopeService } from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnneeAcademiqueDto } from './dto/annee-academique.dto';

@Injectable()
export class AnneesAcademiquesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}
  create(tenantId: string, data: AnneeAcademiqueDto) {
    // L'établissement vient du JWT : le tenantId du corps est ignoré
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _ignored, ...fields } = data;
    return this.prisma.anneeAcademique.create({
      data: {
        ...fields,
        tenantId,
        dateDebut: new Date(data.dateDebut),
        dateFin: new Date(data.dateFin),
      },
    });
  }
  findAll(tenantId: string) {
    return this.prisma.anneeAcademique.findMany({
      where: { tenantId },
      orderBy: { dateDebut: 'desc' },
    });
  }
  /** Années ouvertes aux candidatures : champs publics uniquement. */
  findOuvertes(tenantId: string) {
    return this.prisma.anneeAcademique.findMany({
      where: { tenantId, active: true },
      select: { id: true, libelle: true, dateDebut: true, dateFin: true },
      orderBy: { dateDebut: 'desc' },
    });
  }
  findOne(tenantId: string, id: string) {
    return this.prisma.anneeAcademique.findFirstOrThrow({
      where: { id, tenantId },
    });
  }
  async update(tenantId: string, id: string, data: AnneeAcademiqueDto) {
    await this.scope.anneeAcademique(tenantId, id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _ignored, ...fields } = data;
    return this.prisma.anneeAcademique.update({
      where: { id },
      data: {
        ...fields,
        dateDebut: new Date(data.dateDebut),
        dateFin: new Date(data.dateFin),
      },
    });
  }
  async remove(tenantId: string, id: string) {
    await this.scope.anneeAcademique(tenantId, id);
    return this.prisma.anneeAcademique.delete({ where: { id } });
  }
}
