import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as request from 'supertest';
import { seedSeas } from '../prisma/seed-seas';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  cleanupTenant,
  createE2eApp,
  createTenant,
  createUser,
  describeWithTestDatabase,
  login,
  uniqueSuffix,
} from './e2e-helpers';

describeWithTestDatabase('Seed SEAS (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let tenantId: string;
  const suffix = uniqueSuffix();
  const silent = () => undefined;

  const counts = async () => ({
    campus: await prisma.campus.count({
      where: { tenantId, nom: 'Logbessou' },
    }),
    ecoles: await prisma.ecole.count({ where: { tenantId, code: 'SEAS' } }),
    filieres: await prisma.filiere.count({
      where: { ecole: { tenantId, code: 'SEAS' } },
    }),
  });

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    tenantId = (await createTenant(prisma, suffix)).id;
  });

  afterAll(async () => {
    try {
      if (prisma && tenantId) await cleanupTenant(prisma, tenantId);
    } finally {
      if (close) await close();
    }
  });

  it('tourne deux fois de suite sans erreur ni doublon', async () => {
    await seedSeas(prisma, tenantId, silent);
    expect(await counts()).toEqual({ campus: 1, ecoles: 1, filieres: 6 });

    const lines: string[] = [];
    await seedSeas(prisma, tenantId, (line) => lines.push(line));
    expect(await counts()).toEqual({ campus: 1, ecoles: 1, filieres: 6 });
    expect(lines.every((line) => line.includes('existant'))).toBe(true);
  });

  it('crée Logbessou (A_CONFIRMER) et SEAS rattachée, visibles via l’API', async () => {
    const email = `admin-${suffix}@example.test`;
    await createUser(prisma, tenantId, email, 'Password123', Role.ADMIN);
    const token = await login(app, email, 'Password123');

    const ecoles = await request(app.getHttpServer())
      .get('/ecoles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const seas = ecoles.body.find(
      (e: { tenantId: string; code: string }) =>
        e.tenantId === tenantId && e.code === 'SEAS',
    );
    expect(seas).toMatchObject({
      nom: 'SEAS — School of Engineering and Applied Sciences',
      description:
        'Programmes en anglais, tutelle University of Buea + MINESUP',
      campus: { nom: 'Logbessou', statutDonnees: 'A_CONFIRMER' },
    });
  });

  it.each([
    [
      'ISM',
      'B.Sc. in Information Systems Management',
      'BSC',
      3,
      180,
      'University of Buea / MINESUP',
      'CONFIRME',
    ],
    [
      'BBA',
      'Business Administration (BBA)',
      'BBA',
      2,
      120,
      'University of Buea / MINESUP',
      'A_CONFIRMER',
    ],
    [
      'HND-EEE',
      'HND in Electrical and Electronics Engineering',
      'HND',
      2,
      120,
      'MINESUP',
      'CONFIRME',
    ],
    [
      'HND-TEL',
      'HND in Telecommunication',
      'HND',
      null,
      null,
      'MINESUP',
      'A_CONFIRMER',
    ],
    [
      'HND-HRM',
      'HND in Human Resources Management',
      'HND',
      null,
      null,
      'MINESUP',
      'A_CONFIRMER',
    ],
    [
      'CSE',
      'B.Eng / M.Eng in Computer Science Engineering',
      'BENG',
      null,
      null,
      'n.d.',
      'A_CONFIRMER',
    ],
  ])(
    'filière %s conforme au tableau (null laissés à null)',
    async (code, nom, cycle, dureeAnnees, credits, tutelle, statutDonnees) => {
      const filiere = await prisma.filiere.findFirst({
        where: { code, ecole: { tenantId, code: 'SEAS' } },
      });
      expect(filiere).toMatchObject({
        nom,
        cycle,
        langue: 'EN',
        dureeAnnees,
        credits,
        tutelle,
        statutDonnees,
        regime: null,
      });
    },
  );
});
