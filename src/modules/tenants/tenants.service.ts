import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantDto } from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: TenantDto) {
    return this.prisma.tenant.create({ data });
  }

  findAll() {
    return this.prisma.tenant.findMany({ orderBy: { nom: 'asc' } });
  }

  findOne(id: string) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id } });
  }

  update(id: string, data: TenantDto) {
    return this.prisma.tenant.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.tenant.delete({ where: { id } });
  }
}
