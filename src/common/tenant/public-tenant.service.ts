import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service';

/**
 * Tenant d'une route publique (sans JWT) : celui de ?tenant=<slug>, sinon
 * l'unique tenant existant. Avec plusieurs tenants, le slug devient requis.
 */
@Injectable()
export class PublicTenantService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveId(slug?: string): Promise<string> {
    if (slug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!tenant) {
        throw new NotFoundException(`Établissement « ${slug} » introuvable`);
      }
      return tenant.id;
    }

    const tenants = await this.prisma.tenant.findMany({
      select: { id: true },
      take: 2,
    });
    if (tenants.length === 0) {
      throw new NotFoundException('Aucun établissement configuré');
    }
    if (tenants.length > 1) {
      throw new BadRequestException(
        'Plusieurs établissements existent : précisez ?tenant=<slug>',
      );
    }
    return tenants[0].id;
  }
}
