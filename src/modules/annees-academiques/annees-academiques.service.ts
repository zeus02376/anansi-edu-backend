import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnneeAcademiqueDto } from './dto/annee-academique.dto';

@Injectable()
export class AnneesAcademiquesService {
  constructor(private readonly prisma: PrismaService) {}
  create(data: AnneeAcademiqueDto) {
    return this.prisma.anneeAcademique.create({
      data: {
        ...data,
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
  findOne(id: string) {
    return this.prisma.anneeAcademique.findUniqueOrThrow({ where: { id } });
  }
  update(id: string, data: AnneeAcademiqueDto) {
    return this.prisma.anneeAcademique.update({
      where: { id },
      data: {
        ...data,
        dateDebut: new Date(data.dateDebut),
        dateFin: new Date(data.dateFin),
      },
    });
  }
  remove(id: string) {
    return this.prisma.anneeAcademique.delete({ where: { id } });
  }
}
