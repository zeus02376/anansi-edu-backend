import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InscriptionDto } from './dto/inscription.dto';

@Injectable()
export class InscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: InscriptionDto, userId: string) {
    return this.prisma.inscription.create({
      data: { ...data, createdBy: userId },
    });
  }

  findAll() {
    return this.prisma.inscription.findMany({
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

  findOne(id: string) {
    return this.prisma.inscription.findUniqueOrThrow({
      where: { id },
      include: { etudiant: true, niveau: true, anneeAcademique: true },
    });
  }

  update(id: string, data: InscriptionDto) {
    return this.prisma.inscription.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.inscription.delete({ where: { id } });
  }
}
