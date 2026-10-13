import { PrismaClient } from '@prisma/client';

/** Erreur attendue d'un seed : affichée sans pile d'appel. */
export class SeedError extends Error {}

/**
 * Tenant ciblé par un seed : celui de SEED_TENANT_SLUG, sinon l'unique
 * tenant existant. S'arrête si le choix est ambigu ou impossible.
 */
export async function resolveTenant(
  prisma: PrismaClient,
  slug = process.env.SEED_TENANT_SLUG,
) {
  if (slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new SeedError(`Aucun tenant avec le slug « ${slug} »`);
    return tenant;
  }
  const tenants = await prisma.tenant.findMany({ take: 2 });
  if (tenants.length === 0) {
    throw new SeedError(
      'Aucun tenant : créez d’abord l’établissement (POST /tenants)',
    );
  }
  if (tenants.length > 1) {
    throw new SeedError(
      'Plusieurs tenants existent : précisez SEED_TENANT_SLUG',
    );
  }
  return tenants[0];
}

/** Exécute un seed en ligne de commande avec un code de sortie fiable. */
export function runSeed(
  name: string,
  seed: (prisma: PrismaClient) => Promise<unknown>,
) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(() => console.log(`${name} terminé.`))
    .catch((error) => {
      console.error(
        `${name} interrompu : ${error instanceof SeedError ? error.message : error}`,
      );
      if (!(error instanceof SeedError)) console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
