import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CampusDto } from './dto/campus.dto';

@Injectable()
export class CampusService {
  constructor(private readonly prisma: PrismaService) {}
  create(tenantId: string, data: CampusDto) {
    return this.prisma.campus.create({ data: { ...data, tenantId } });
  }
  findAll(tenantId: string) {
    return this.prisma.campus.findMany({
      where: { tenantId },
      include: { _count: { select: { ecoles: true } } },
      orderBy: { nom: 'asc' },
    });
  }
  findOne(tenantId: string, id: string) {
    return this.prisma.campus.findFirstOrThrow({
      where: { id, tenantId },
      include: { ecoles: { orderBy: { nom: 'asc' } } },
    });
  }
  async update(tenantId: string, id: string, data: CampusDto) {
    await this.assertInTenant(tenantId, id);
    return this.prisma.campus.update({ where: { id }, data });
  }
  async remove(tenantId: string, id: string) {
    await this.assertInTenant(tenantId, id);
    return this.prisma.campus.delete({ where: { id } });
  }

  // Un campus d'un autre tenant est traité comme introuvable (404 via le filtre Prisma)
  private assertInTenant(tenantId: string, id: string) {
    return this.prisma.campus.findFirstOrThrow({
      where: { id, tenantId },
      select: { id: true },
    });
  }
}
