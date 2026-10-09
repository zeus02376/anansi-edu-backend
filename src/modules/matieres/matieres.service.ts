import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatiereDto } from './dto/matiere.dto';

@Injectable()
export class MatieresService {
  constructor(private readonly prisma: PrismaService) {}
  create(data: MatiereDto) {
    return this.prisma.matiere.create({ data });
  }
  findAll() {
    return this.prisma.matiere.findMany({ orderBy: { nom: 'asc' } });
  }
  findOne(id: string) {
    return this.prisma.matiere.findUniqueOrThrow({ where: { id } });
  }
  update(id: string, data: MatiereDto) {
    return this.prisma.matiere.update({ where: { id }, data });
  }
  remove(id: string) {
    return this.prisma.matiere.delete({ where: { id } });
  }
}
