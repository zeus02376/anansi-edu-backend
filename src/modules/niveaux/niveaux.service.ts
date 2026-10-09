import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NiveauDto } from './dto/niveau.dto';

@Injectable()
export class NiveauxService {
  constructor(private readonly prisma: PrismaService) {}
  create(data: NiveauDto) {
    return this.prisma.niveau.create({ data });
  }
  findAll() {
    return this.prisma.niveau.findMany({ orderBy: { ordre: 'asc' } });
  }
  findOne(id: string) {
    return this.prisma.niveau.findUniqueOrThrow({ where: { id } });
  }
  update(id: string, data: NiveauDto) {
    return this.prisma.niveau.update({ where: { id }, data });
  }
  remove(id: string) {
    return this.prisma.niveau.delete({ where: { id } });
  }
}
