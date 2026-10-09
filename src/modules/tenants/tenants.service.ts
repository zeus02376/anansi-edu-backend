import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantDto } from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: TenantDto) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existingTenant = await tx.tenant.findFirst({
            select: { id: true },
          });
          if (existingTenant) {
            throw new ConflictException(
              'Le tenant initial a déjà été créé; authentifiez-vous comme ADMIN',
            );
          }
          return tx.tenant.create({ data });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new ConflictException(
          'Le tenant initial a déjà été créé; authentifiez-vous comme ADMIN',
        );
      }
      throw error;
    }
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
