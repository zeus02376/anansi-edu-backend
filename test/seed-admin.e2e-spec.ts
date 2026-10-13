import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { seedAdmin } from '../prisma/seed-admin';
import { SeedError } from '../prisma/seed-utils';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  cleanupTenant,
  createE2eApp,
  createTenant,
  describeWithTestDatabase,
  login,
  uniqueSuffix,
} from './e2e-helpers';

describeWithTestDatabase('Seed ADMIN (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let tenantId: string;
  let tenantSlug: string;
  const suffix = uniqueSuffix();
  const email = `admin-${suffix}@example.test`;
  const password = 'SuperSecret-2026';
  const lines: string[] = [];
  const print = (line: string) => lines.push(line);

  const admins = () =>
    prisma.user.findMany({ where: { tenantId, role: Role.ADMIN } });

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    const tenant = await createTenant(prisma, suffix);
    tenantId = tenant.id;
    tenantSlug = tenant.slug;
  });

  afterAll(async () => {
    try {
      if (prisma && tenantId) await cleanupTenant(prisma, tenantId);
    } finally {
      if (close) await close();
    }
  });

  it('refuse clairement des variables manquantes ou invalides', async () => {
    await expect(seedAdmin(prisma, { tenantSlug }, print)).rejects.toThrow(
      'Variable(s) manquante(s) : SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD',
    );
    await expect(
      seedAdmin(prisma, { tenantSlug, email, password: 'court' }, print),
    ).rejects.toThrow('au moins 8 caractères');
    await expect(
      seedAdmin(
        prisma,
        { tenantSlug: `inconnu-${suffix}`, email, password },
        print,
      ),
    ).rejects.toThrow(SeedError);
    expect(await admins()).toHaveLength(0);
  });

  it('crée l’ADMIN, qui peut se connecter, sans afficher le mot de passe', async () => {
    await seedAdmin(prisma, { tenantSlug, email, password }, print);

    expect(await admins()).toHaveLength(1);
    await login(app, email, password);
    expect(lines.join('\n')).toContain(email);
    expect(lines.join('\n')).not.toContain(password);
  });

  it('échoue proprement à la relance, sans doublon ni modification', async () => {
    const before = await admins();
    await expect(
      seedAdmin(prisma, { tenantSlug, email, password }, print),
    ).rejects.toThrow('Un ADMIN existe déjà');
    await expect(
      seedAdmin(
        prisma,
        { tenantSlug, email: `autre-${suffix}@example.test`, password },
        print,
      ),
    ).rejects.toThrow(SeedError);

    const after = await admins();
    expect(after).toEqual(before);
  });
});
