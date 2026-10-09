import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EcoleDto } from './dto/ecole.dto';

@Injectable()
export class EcolesService {
  constructor(private readonly prisma: PrismaService) {}
  create(data: EcoleDto) {
    return this.prisma.ecole.create({ data });
  }
  findAll() {
    return this.prisma.ecole.findMany({ orderBy: { nom: 'asc' } });
  }
  findOne(id: string) {
    return this.prisma.ecole.findUniqueOrThrow({ where: { id } });
  }
  update(id: string, data: EcoleDto) {
    return this.prisma.ecole.update({ where: { id }, data });
  }
  remove(id: string) {
    return this.prisma.ecole.delete({ where: { id } });
  }
}
