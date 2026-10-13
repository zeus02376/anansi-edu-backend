/**
 * Crée le premier ADMIN d'un tenant. Refuse si un ADMIN existe déjà :
 * ne peut jamais créer un second ADMIN par accident.
 *
 *   SEED_ADMIN_EMAIL=admin@iuc.cm SEED_ADMIN_PASSWORD=... npm run seed:admin
 *   (+ SEED_TENANT_SLUG si plusieurs tenants ;
 *      SEED_ADMIN_NOM / SEED_ADMIN_PRENOM optionnels)
 *
 * Le mot de passe n'est jamais affiché.
 */
import 'dotenv/config';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { resolveTenant, runSeed, SeedError } from './seed-utils';

export type SeedAdminInput = {
  email?: string;
  password?: string;
  nom?: string;
  prenom?: string;
  tenantSlug?: string;
};

// Même règle que LoginDto : sinon l'ADMIN ne pourrait pas se connecter
const MIN_PASSWORD_LENGTH = 8;

export async function seedAdmin(
  prisma: PrismaClient,
  input: SeedAdminInput,
  print: (line: string) => void = console.log,
) {
  const email = input.email?.trim();
  const { password } = input;
  const missing = [
    !email && 'SEED_ADMIN_EMAIL',
    !password && 'SEED_ADMIN_PASSWORD',
  ].filter(Boolean);
  if (missing.length) {
    throw new SeedError(`Variable(s) manquante(s) : ${missing.join(', ')}`);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new SeedError(`SEED_ADMIN_EMAIL invalide : « ${email} »`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new SeedError(
      `SEED_ADMIN_PASSWORD doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`,
    );
  }

  const tenant = await resolveTenant(prisma, input.tenantSlug);
  const motDePasseHash = await bcrypt.hash(password, 12);

  try {
    // Sérialisable : deux exécutions simultanées ne créent pas deux ADMIN
    const admin = await prisma.$transaction(
      async (tx) => {
        const existingAdmin = await tx.user.findFirst({
          where: { tenantId: tenant.id, role: Role.ADMIN },
          select: { email: true },
        });
        if (existingAdmin) {
          throw new SeedError(
            `Un ADMIN existe déjà pour le tenant « ${tenant.slug} » (${existingAdmin.email}) : rien n’a été modifié`,
          );
        }
        const emailTaken = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (emailTaken) {
          throw new SeedError(`L’adresse ${email} est déjà utilisée`);
        }
        return tx.user.create({
          data: {
            tenantId: tenant.id,
            nom: input.nom?.trim() || 'Admin',
            prenom: input.prenom?.trim() || tenant.nom,
            email,
            motDePasseHash,
            role: Role.ADMIN,
          },
          select: { id: true, email: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    print(`  + ADMIN ${admin.email} créé pour le tenant « ${tenant.slug} »`);
    return admin;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    ) {
      throw new SeedError(
        'Création concurrente détectée : relancez pour vérifier l’état',
      );
    }
    throw error;
  }
}

if (require.main === module) {
  runSeed('Seed ADMIN', (prisma) =>
    seedAdmin(prisma, {
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
      nom: process.env.SEED_ADMIN_NOM,
      prenom: process.env.SEED_ADMIN_PRENOM,
      tenantSlug: process.env.SEED_TENANT_SLUG,
    }),
  );
}
