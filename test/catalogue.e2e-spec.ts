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

describeWithTestDatabase('Catalogue public (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const otherSuffix = `${suffix}-autre`;
  const tenant = `e2e-${suffix}`;
  const ids = {} as Record<
    'tenant' | 'other' | 'campus' | 'ecole' | 'filiere' | 'otherEcole',
    string
  >;
  const tokens = {} as Record<Role, string>;

  const http = () => request(app.getHttpServer());
  const pub = (path: string) => http().get(`${path}?tenant=${tenant}`);

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    ids.tenant = (await createTenant(prisma, suffix)).id;
    ids.other = (await createTenant(prisma, otherSuffix)).id;

    const campus = await prisma.campus.create({
      data: { tenantId: ids.tenant, nom: 'Logbessou' },
    });
    const ecole = await prisma.ecole.create({
      data: {
        tenantId: ids.tenant,
        nom: 'SEAS — School of Engineering and Applied Sciences',
        code: 'SEAS',
        description: 'Programmes en anglais, tutelle University of Buea',
        campusId: campus.id,
      },
    });
    const filiere = await prisma.filiere.create({
      data: {
        ecoleId: ecole.id,
        nom: 'Information Systems',
        code: 'ISM',
        cycle: 'BSC',
        langue: 'EN',
      },
    });
    const otherEcole = await prisma.ecole.create({
      data: {
        tenantId: ids.other,
        nom: 'École d’un autre établissement',
        code: 'AUTRE',
      },
    });
    Object.assign(ids, {
      campus: campus.id,
      ecole: ecole.id,
      filiere: filiere.id,
      otherEcole: otherEcole.id,
    });

    for (const role of [Role.ENSEIGNANT, Role.ETUDIANT]) {
      const email = `${role.toLowerCase()}-${suffix}@example.test`;
      await createUser(prisma, ids.tenant, email, 'Password123', role);
      tokens[role] = await login(app, email, 'Password123');
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

  describe('lecture publique, sans JWT', () => {
    it('liste et détail des campus', async () => {
      const list = await pub('/campus').expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({ id: ids.campus, _count: { ecoles: 1 } }),
      ]);
      const { body } = await pub(`/campus/${ids.campus}`).expect(200);
      expect(body.ecoles.map((e: { id: string }) => e.id)).toEqual([ids.ecole]);
    });

    it('liste et détail des écoles, avec leur campus', async () => {
      const list = await pub('/ecoles').expect(200);
      expect(list.body.map((e: { id: string }) => e.id)).toEqual([ids.ecole]);
      const { body } = await pub(`/ecoles/${ids.ecole}`).expect(200);
      expect(body.campus.id).toBe(ids.campus);
    });

    it('liste et détail des filières, avec école et campus imbriqués', async () => {
      const list = await pub('/filieres').expect(200);
      expect(list.body.map((f: { id: string }) => f.id)).toEqual([ids.filiere]);
      const { body } = await pub(`/filieres/${ids.filiere}`).expect(200);
      expect(body.ecole).toMatchObject({
        id: ids.ecole,
        campus: { id: ids.campus, nom: 'Logbessou' },
      });
    });

    it('n’expose pas les données d’un autre établissement', async () => {
      await pub(`/ecoles/${ids.otherEcole}`).expect(404);
      const other = await http()
        .get(`/ecoles?tenant=e2e-${otherSuffix}`)
        .expect(200);
      expect(other.body.map((e: { id: string }) => e.id)).toEqual([
        ids.otherEcole,
      ]);
    });

    it('signale un établissement inconnu (404) ou ambigu (400)', async () => {
      await http().get('/filieres?tenant=inconnu').expect(404);
      // Plusieurs tenants existent ici : sans ?tenant= le choix est ambigu
      const ambiguous = await http().get('/filieres').expect(400);
      expect(ambiguous.body.message).toContain('?tenant=');
    });
  });

  describe('écriture toujours réservée au personnel', () => {
    const writes = () =>
      [
        ['POST', '/campus', { nom: 'X' }],
        ['PUT', `/campus/${ids.campus}`, { nom: 'X' }],
        ['DELETE', `/campus/${ids.campus}`, undefined],
        ['POST', '/ecoles', { tenantId: ids.tenant, nom: 'X', code: 'X' }],
        [
          'PUT',
          `/ecoles/${ids.ecole}`,
          { tenantId: ids.tenant, nom: 'X', code: 'X' },
        ],
        ['DELETE', `/ecoles/${ids.ecole}`, undefined],
        [
          'POST',
          '/filieres',
          { ecoleId: ids.ecole, nom: 'X', code: 'X', cycle: 'HND' },
        ],
        [
          'PUT',
          `/filieres/${ids.filiere}`,
          { ecoleId: ids.ecole, nom: 'X', code: 'X', cycle: 'HND' },
        ],
        ['DELETE', `/filieres/${ids.filiere}`, undefined],
      ] as const;

    const send = (
      method: string,
      path: string,
      body: object | undefined,
      role?: Role,
    ) => {
      const req =
        http()[method.toLowerCase() as 'post' | 'put' | 'delete'](path);
      if (role) req.set('Authorization', `Bearer ${tokens[role]}`);
      return body ? req.send(body) : req;
    };

    it('refuse toute écriture anonyme (401)', async () => {
      for (const [method, path, body] of writes()) {
        await send(method, path, body).expect(401);
      }
    });

    it.each([Role.ENSEIGNANT, Role.ETUDIANT])(
      'refuse toute écriture au rôle %s (403)',
      async (role) => {
        for (const [method, path, body] of writes()) {
          await send(method, path, body, role).expect(403);
        }
      },
    );

    it('n’a rien modifié', async () => {
      expect(
        await prisma.campus.count({ where: { tenantId: ids.tenant } }),
      ).toBe(1);
      expect(
        await prisma.ecole.count({ where: { tenantId: ids.tenant } }),
      ).toBe(1);
      expect(
        await prisma.filiere.count({ where: { ecoleId: ids.ecole } }),
      ).toBe(1);
    });
  });
});
