import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiliereDto } from './dto/filiere.dto';

// Toute filière est renvoyée avec son école et le campus de celle-ci
const withEcole = { ecole: { include: { campus: true } } } as const;

@Injectable()
export class FilieresService {
  constructor(private readonly prisma: PrismaService) {}
  create(data: FiliereDto) {
    return this.prisma.filiere.create({ data, include: withEcole });
  }
  findAll(tenantId: string) {
    return this.prisma.filiere.findMany({
      where: { ecole: { tenantId } },
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
  update(id: string, data: FiliereDto) {
    return this.prisma.filiere.update({
      where: { id },
      data,
      include: withEcole,
    });
  }
  remove(id: string) {
    return this.prisma.filiere.delete({ where: { id } });
  }
}
