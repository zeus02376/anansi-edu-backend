import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EcoleDto } from './dto/ecole.dto';

@Injectable()
export class EcolesService {
  constructor(private readonly prisma: PrismaService) {}
  async create(data: EcoleDto) {
    await this.assertCampusInTenant(data);
    return this.prisma.ecole.create({ data, include: { campus: true } });
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
  async update(id: string, data: EcoleDto) {
    await this.assertCampusInTenant(data);
    return this.prisma.ecole.update({
      where: { id },
      data,
      include: { campus: true },
    });
  }
  remove(id: string) {
    return this.prisma.ecole.delete({ where: { id } });
  }

  private async assertCampusInTenant({ campusId, tenantId }: EcoleDto) {
    if (!campusId) return;
    const campus = await this.prisma.campus.findFirst({
      where: { id: campusId, tenantId },
      select: { id: true },
    });
    if (!campus) {
      throw new BadRequestException(
        'Le campus doit exister et appartenir au même tenant que l’école',
      );
    }
  }
}
