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

type Seed = {
  tenantId: string;
  admin: string;
  scolarite: string;
  campus: string;
  ecole: string;
  filiere: string;
  annee: string;
};

describeWithTestDatabase(
  'Établissements et droits de suppression (e2e)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let close: () => Promise<void>;
    const suffix = uniqueSuffix();
    const tenants: string[] = [];
    let a: Seed;
    let b: Seed;

    const call = (
      method: 'get' | 'put' | 'delete',
      token: string,
      url: string,
      body?: object,
    ) => {
      const req = request(app.getHttpServer())[method](url);
      req.set('Authorization', `Bearer ${token}`);
      return body ? req.send(body) : req;
    };

    async function seed(label: string): Promise<Seed> {
      const tenantId = (await createTenant(prisma, `${suffix}-${label}`)).id;
      tenants.push(tenantId);
      const campus = await prisma.campus.create({
        data: { tenantId, nom: `Campus ${label}` },
      });
      const ecole = await prisma.ecole.create({
        data: { tenantId, nom: `École ${label}`, code: `E-${label}-${suffix}` },
      });
      const filiere = await prisma.filiere.create({
        data: {
          ecoleId: ecole.id,
          nom: 'ISM',
          code: `F-${label}`,
          cycle: 'BSC',
        },
      });
      const annee = await prisma.anneeAcademique.create({
        data: {
          tenantId,
          libelle: `E2E-${label}-${suffix}`,
          dateDebut: new Date('2026-09-01'),
          dateFin: new Date('2027-07-31'),
        },
      });
      const tokens: Record<string, string> = {};
      for (const [key, role] of [
        ['admin', Role.ADMIN],
        ['scolarite', Role.SCOLARITE],
      ] as const) {
        const email = `${key}-${label}-${suffix}@example.test`;
        await createUser(prisma, tenantId, email, 'Password123', role);
        tokens[key] = await login(app, email, 'Password123');
      }
      return {
        tenantId,
        admin: tokens.admin,
        scolarite: tokens.scolarite,
        campus: campus.id,
        ecole: ecole.id,
        filiere: filiere.id,
        annee: annee.id,
      };
    }

    beforeAll(async () => {
      ({ app, prisma, close } = await createE2eApp());
      a = await seed('a');
      b = await seed('b');
    });

    afterAll(async () => {
      try {
        if (prisma) {
          for (const id of tenants) await cleanupTenant(prisma, id);
        }
      } finally {
        if (close) await close();
      }
    });

    describe('S3 : un ADMIN ne voit que son établissement', () => {
      it('GET /tenants/me renvoie uniquement l’établissement du JWT', async () => {
        const { body } = await call('get', a.admin, '/tenants/me').expect(200);
        expect(body.id).toBe(a.tenantId);
      });

      it('GET /tenants (déprécié) est réduit à l’établissement du JWT', async () => {
        const { body } = await call('get', b.admin, '/tenants').expect(200);
        expect(body.map((t: { id: string }) => t.id)).toEqual([b.tenantId]);
      });

      it('GET /tenants/:id : 200 pour le sien, 404 pour un autre', async () => {
        await call('get', a.admin, `/tenants/${a.tenantId}`).expect(200);
        await call('get', a.admin, `/tenants/${b.tenantId}`).expect(404);
        await call('get', a.admin, '/tenants/pas-un-identifiant').expect(404);
      });

      it('PUT /tenants/:id : modifie le sien, 404 et rien de modifié pour un autre', async () => {
        const dto = (nom: string) => ({
          nom,
          slug: `e2e-${suffix}-${nom}`,
          pays: 'Cameroun',
          ville: 'Douala',
        });
        await call(
          'put',
          a.admin,
          `/tenants/${b.tenantId}`,
          dto('pirate'),
        ).expect(404);
        expect(
          (await prisma.tenant.findUniqueOrThrow({ where: { id: b.tenantId } }))
            .nom,
        ).not.toBe('pirate');
        const own = await call(
          'put',
          a.admin,
          `/tenants/${a.tenantId}`,
          dto('renomme'),
        ).expect(200);
        expect(own.body.nom).toBe('renomme');
      });

      it('DELETE /tenants/:id n’existe plus : aucun établissement supprimable par l’API', async () => {
        await call('delete', a.admin, `/tenants/${a.tenantId}`).expect(404);
        await call('delete', a.admin, `/tenants/${b.tenantId}`).expect(404);
        expect(await prisma.tenant.count({ where: { id: a.tenantId } })).toBe(
          1,
        );
        expect(await prisma.tenant.count({ where: { id: b.tenantId } })).toBe(
          1,
        );
      });

      it('les routes /tenants restent réservées aux ADMIN', async () => {
        await call('get', a.scolarite, '/tenants/me').expect(403);
        await call('get', a.scolarite, '/tenants').expect(403);
        await call('get', a.scolarite, `/tenants/${a.tenantId}`).expect(403);
        await call('put', a.scolarite, `/tenants/${a.tenantId}`, {
          nom: 'x',
          slug: 'x',
          pays: 'x',
          ville: 'x',
        }).expect(403);
        await request(app.getHttpServer()).get('/tenants/me').expect(401);
      });
    });

    describe('S5 : suppressions réservées à l’ADMIN', () => {
      const resources = (s: Seed) =>
        [
          ['campus', s.campus],
          ['ecoles', s.ecole],
          ['filieres', s.filiere],
          ['annees-academiques', s.annee],
        ] as const;

      it.each(['campus', 'ecoles', 'filieres', 'annees-academiques'])(
        'DELETE /%s/:id : 403 pour SCOLARITE, rien de supprimé',
        async (resource) => {
          const id = resources(a).find(([name]) => name === resource)![1];
          await call('delete', a.scolarite, `/${resource}/${id}`).expect(403);
          await request(app.getHttpServer())
            .delete(`/${resource}/${id}`)
            .expect(401);
          const model = {
            campus: prisma.campus,
            ecoles: prisma.ecole,
            filieres: prisma.filiere,
            'annees-academiques': prisma.anneeAcademique,
          }[resource] as unknown as {
            count: (args: object) => Promise<number>;
          };
          expect(await model.count({ where: { id } })).toBe(1);
        },
      );

      it('SCOLARITE garde la lecture, la création et la modification', async () => {
        const create = (url: string, body: object) =>
          request(app.getHttpServer())
            .post(url)
            .set('Authorization', `Bearer ${a.scolarite}`)
            .send(body);
        await call('get', a.scolarite, '/annees-academiques').expect(200);
        await call('get', a.scolarite, `/annees-academiques/${a.annee}`).expect(
          200,
        );
        const campus = await create('/campus', {
          nom: 'Nouveau campus',
        }).expect(201);
        await call('put', a.scolarite, `/campus/${campus.body.id}`, {
          nom: 'Campus modifié',
        }).expect(200);
        const ecole = await create('/ecoles', {
          nom: 'Nouvelle',
          code: `N-${suffix}`,
        }).expect(201);
        await call('put', a.scolarite, `/ecoles/${ecole.body.id}`, {
          nom: 'Modifiée',
          code: `N-${suffix}`,
        }).expect(200);
        const filiere = await create('/filieres', {
          ecoleId: a.ecole,
          nom: 'Nouvelle',
          code: `NF-${suffix}`,
          cycle: 'BSC',
        }).expect(201);
        await call('put', a.scolarite, `/filieres/${filiere.body.id}`, {
          ecoleId: a.ecole,
          nom: 'Modifiée',
          code: `NF-${suffix}`,
          cycle: 'BSC',
        }).expect(200);
        const annee = await create('/annees-academiques', {
          libelle: `Nouvelle-${suffix}`,
          dateDebut: '2030-09-01T00:00:00.000Z',
          dateFin: '2031-07-31T00:00:00.000Z',
        }).expect(201);
        await call('put', a.scolarite, `/annees-academiques/${annee.body.id}`, {
          libelle: `Modifiée-${suffix}`,
          dateDebut: '2030-09-01T00:00:00.000Z',
          dateFin: '2031-07-31T00:00:00.000Z',
        }).expect(200);
      });

      it('ADMIN peut toujours supprimer ces ressources (et un autre établissement : 404)', async () => {
        const annee = await prisma.anneeAcademique.create({
          data: {
            tenantId: a.tenantId,
            libelle: `Jetable-${suffix}`,
            dateDebut: new Date('2040-09-01'),
            dateFin: new Date('2041-07-31'),
          },
        });
        await call('delete', b.admin, `/annees-academiques/${annee.id}`).expect(
          404,
        );
        await call('delete', a.admin, `/annees-academiques/${annee.id}`).expect(
          200,
        );
        const campus = await prisma.campus.create({
          data: { tenantId: a.tenantId, nom: 'Jetable' },
        });
        await call('delete', a.admin, `/campus/${campus.id}`).expect(200);
      });
    });
  },
);
