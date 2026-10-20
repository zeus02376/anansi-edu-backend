import {
  ConflictException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
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

  findMine(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  }

  /** Un identifiant autre que celui du JWT répond 404, comme une ressource absente. */
  findOne(tenantId: string, id: string) {
    if (id !== tenantId) {
      throw new NotFoundException('Établissement introuvable');
    }
    return this.findMine(tenantId);
  }

  async update(tenantId: string, id: string, data: TenantDto) {
    await this.findOne(tenantId, id);
    return this.prisma.tenant.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.tenant.delete({ where: { id } });
  }
}
