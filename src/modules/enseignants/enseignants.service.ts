import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AffectationDto, EnseignantDto } from './dto/enseignant.dto';

@Injectable()
export class EnseignantsService {
  constructor(private readonly prisma: PrismaService) {}
  create(data: EnseignantDto) {
    return this.prisma.enseignant.create({ data });
  }
  findAll() {
    return this.prisma.enseignant.findMany({
      include: {
        user: { select: { id: true, nom: true, prenom: true, email: true } },
        affectations: true,
      },
    });
  }
  findOne(id: string) {
    return this.prisma.enseignant.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, nom: true, prenom: true, email: true } },
        affectations: true,
      },
    });
  }
  update(id: string, data: EnseignantDto) {
    return this.prisma.enseignant.update({ where: { id }, data });
  }
  remove(id: string) {
    return this.prisma.enseignant.delete({ where: { id } });
  }
  createAffectation(enseignantId: string, data: AffectationDto) {
    return this.prisma.affectation.create({ data: { ...data, enseignantId } });
  }
  findAffectations(enseignantId: string) {
    return this.prisma.affectation.findMany({
      where: { enseignantId },
      include: { matiere: true, anneeAcademique: true },
    });
  }
}
