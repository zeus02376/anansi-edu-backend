import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiliereDto } from './dto/filiere.dto';

@Injectable()
export class FilieresService {
  constructor(private readonly prisma: PrismaService) {}
  create(data: FiliereDto) {
    return this.prisma.filiere.create({ data });
  }
  findAll() {
    return this.prisma.filiere.findMany({ orderBy: { nom: 'asc' } });
  }
  findOne(id: string) {
    return this.prisma.filiere.findUniqueOrThrow({ where: { id } });
  }
  update(id: string, data: FiliereDto) {
    return this.prisma.filiere.update({ where: { id }, data });
  }
  remove(id: string) {
    return this.prisma.filiere.delete({ where: { id } });
  }
}
