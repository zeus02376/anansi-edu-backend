import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/modules/prisma/prisma.service';

/** Les suites e2e ne tournent que si une base de test est fournie. */
export const testDatabaseUrl = process.env.E2E_DATABASE_URL;
export const describeWithTestDatabase = testDatabaseUrl
  ? describe
  : describe.skip;

export const uniqueSuffix = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Application Nest configurée comme en production, sur la base de test. */
export async function createE2eApp() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = testDatabaseUrl;
  // Les suites déposent beaucoup de candidatures : limite de débit relevée,
  // sauf si une suite (rate-limit) fixe elle-même une valeur basse
  process.env.THROTTLE_PUBLIC_LIMIT ??= '10000';
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = configureApp(moduleFixture.createNestApplication());
  await app.init();

  const close = async () => {
    await app.close();
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    else delete process.env.DATABASE_URL;
  };
  return { app, prisma: app.get(PrismaService), close };
}

export function createTenant(prisma: PrismaService, suffix: string) {
  return prisma.tenant.create({
    data: {
      nom: `Test ${suffix}`,
      slug: `e2e-${suffix}`,
      pays: 'Cameroun',
      ville: 'Douala',
    },
  });
}

export async function createUser(
  prisma: PrismaService,
  tenantId: string,
  email: string,
  password: string,
  role: Role,
) {
  return prisma.user.create({
    data: {
      tenantId,
      nom: 'Test',
      prenom: role,
      email,
      motDePasseHash: await bcrypt.hash(password, 4),
      role,
    },
  });
}

export async function login(
  app: INestApplication,
  email: string,
  motDePasse: string,
) {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, motDePasse })
    .expect(201);
  return response.body.access_token as string;
}

/** Supprime toutes les données d'un tenant de test, dans l'ordre des clés étrangères. */
export async function cleanupTenant(prisma: PrismaService, tenantId: string) {
  const inTenant = { candidature: { tenantId } };
  await prisma.historiqueCandidature.deleteMany({ where: inTenant });
  await prisma.documentCandidature.deleteMany({ where: inTenant });
  await prisma.inscription.deleteMany({ where: { etudiant: { tenantId } } });
  await prisma.etudiant.deleteMany({ where: { tenantId } });
  await prisma.candidature.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.filiere.deleteMany({ where: { ecole: { tenantId } } });
  await prisma.ecole.deleteMany({ where: { tenantId } });
  await prisma.campus.deleteMany({ where: { tenantId } });
  await prisma.anneeAcademique.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}
