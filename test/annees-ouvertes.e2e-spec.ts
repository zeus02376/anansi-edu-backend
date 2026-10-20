import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as request from 'supertest';
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

describeWithTestDatabase('Années académiques ouvertes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const ids = {} as Record<
    'tenant' | 'other' | 'active' | 'closed' | 'otherActive',
    string
  >;
  let teacherToken: string;
  let adminToken: string;

  const http = () => request(app.getHttpServer());
  const year = (
    tenantId: string,
    libelle: string,
    active: boolean,
    debut: string,
  ) =>
    prisma.anneeAcademique.create({
      data: {
        tenantId,
        libelle,
        active,
        dateDebut: new Date(debut),
        dateFin: new Date('2099-07-31'),
      },
    });

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    ids.tenant = (await createTenant(prisma, suffix)).id;
    ids.other = (await createTenant(prisma, `${suffix}-autre`)).id;
    ids.active = (await year(ids.tenant, '2026-2027', true, '2026-10-01')).id;
    ids.closed = (await year(ids.tenant, '2025-2026', false, '2025-10-01')).id;
    ids.otherActive = (
      await year(ids.other, 'AUTRE-2026', true, '2026-10-01')
    ).id;

    for (const [key, role] of [
      ['admin', Role.ADMIN],
      ['teacher', Role.ENSEIGNANT],
    ] as const) {
      const email = `${key}-${suffix}@example.test`;
      await createUser(prisma, ids.tenant, email, 'Password123', role);
      const token = await login(app, email, 'Password123');
      if (key === 'admin') adminToken = token;
      else teacherToken = token;
    }
  });

  afterAll(async () => {
    try {
      if (prisma) {
        for (const id of [ids.tenant, ids.other]) {
          if (id) await cleanupTenant(prisma, id);
        }
      }
    } finally {
      if (close) await close();
    }
  });

  it('liste sans JWT uniquement les années actives de l’établissement', async () => {
    const { body } = await http()
      .get(`/annees-academiques/ouvertes?tenant=e2e-${suffix}`)
      .expect(200);
    expect(body).toEqual([
      {
        id: ids.active,
        libelle: '2026-2027',
        dateDebut: expect.any(String),
        dateFin: expect.any(String),
      },
    ]);
  });

  it('n’expose que les champs publics (ni tenant, ni statut interne)', async () => {
    const { body } = await http()
      .get(`/annees-academiques/ouvertes?tenant=e2e-${suffix}`)
      .expect(200);
    expect(Object.keys(body[0]).sort()).toEqual(
      ['dateDebut', 'dateFin', 'id', 'libelle'].sort(),
    );
  });

  it('ne mélange pas les établissements', async () => {
    const { body } = await http()
      .get(`/annees-academiques/ouvertes?tenant=e2e-${suffix}-autre`)
      .expect(200);
    expect(body.map((y: { id: string }) => y.id)).toEqual([ids.otherActive]);
  });

  it('renvoie une liste vide (pas une erreur) quand aucune année n’est active', async () => {
    await prisma.anneeAcademique.update({
      where: { id: ids.otherActive },
      data: { active: false },
    });
    const { body } = await http()
      .get(`/annees-academiques/ouvertes?tenant=e2e-${suffix}-autre`)
      .expect(200);
    expect(body).toEqual([]);
  });

  it('signale un établissement inconnu (404) ou ambigu (400)', async () => {
    await http().get('/annees-academiques/ouvertes?tenant=inconnu').expect(404);
    const ambiguous = await http()
      .get('/annees-academiques/ouvertes')
      .expect(400);
    expect(ambiguous.body.message).toContain('?tenant=');
  });

  describe('les autres routes restent réservées au personnel', () => {
    it('refuse l’accès anonyme (401)', async () => {
      await http().get('/annees-academiques').expect(401);
      await http().get(`/annees-academiques/${ids.active}`).expect(401);
      await http()
        .post('/annees-academiques')
        .send({ libelle: 'X' })
        .expect(401);
      await http()
        .put(`/annees-academiques/${ids.active}`)
        .send({})
        .expect(401);
      await http().delete(`/annees-academiques/${ids.active}`).expect(401);
    });

    it('refuse un ENSEIGNANT (403)', async () => {
      const auth = { Authorization: `Bearer ${teacherToken}` };
      await http().get('/annees-academiques').set(auth).expect(403);
      await http()
        .get(`/annees-academiques/${ids.active}`)
        .set(auth)
        .expect(403);
    });

    it('autorise toujours l’ADMIN, avec toutes les années du tenant', async () => {
      const { body } = await http()
        .get('/annees-academiques')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(body.map((y: { id: string }) => y.id).sort()).toEqual(
        [ids.active, ids.closed].sort(),
      );
    });
  });
});
