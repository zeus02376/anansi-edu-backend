import { Injectable } from '@nestjs/common';
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
    return this.prisma.inscription.create({
      data: { ...data, createdBy: userId },
    });
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
    return this.prisma.inscription.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    await this.scope.inscription(tenantId, id);
    return this.prisma.inscription.delete({ where: { id } });
  }

  private async assertReferences(tenantId: string, data: InscriptionDto) {
    await this.scope.etudiant(tenantId, data.etudiantId);
    await this.scope.niveau(tenantId, data.niveauId);
    await this.scope.anneeAcademique(tenantId, data.anneeAcademiqueId);
  }
}
