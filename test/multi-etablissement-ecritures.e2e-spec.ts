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
  token: string;
  campus: string;
  ecole: string;
  filiere: string;
  annee: string;
};

describeWithTestDatabase(
  'Isolation multi-établissement des écritures du catalogue (e2e)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let close: () => Promise<void>;
    const suffix = uniqueSuffix();
    const tenants: string[] = [];
    let a: Seed;
    let b: Seed;

    const call = (
      method: 'get' | 'post' | 'put' | 'delete',
      who: Seed,
      url: string,
      body?: object,
    ) => {
      const req = request(app.getHttpServer())[method](url);
      req.set('Authorization', `Bearer ${who.token}`);
      return body ? req.send(body) : req;
    };

    async function seed(label: string): Promise<Seed> {
      const tenantId = (await createTenant(prisma, `${suffix}-${label}`)).id;
      tenants.push(tenantId);
      const campus = await prisma.campus.create({
        data: { tenantId, nom: `Campus ${label}` },
      });
      const ecole = await prisma.ecole.create({
        data: {
          tenantId,
          nom: `École ${label}`,
          code: `E-${label}-${suffix}`,
          campusId: campus.id,
        },
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
      const email = `admin-${label}-${suffix}@example.test`;
      await createUser(prisma, tenantId, email, 'Password123', Role.ADMIN);
      return {
        tenantId,
        token: await login(app, email, 'Password123'),
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

    const bodies = (s: Seed) => ({
      campus: { nom: 'Renommé' },
      ecoles: { nom: 'Renommée', code: `R-${s.tenantId.slice(0, 8)}` },
      filieres: { ecoleId: s.ecole, nom: 'Renommée', code: 'R1', cycle: 'BSC' },
      'annees-academiques': {
        libelle: `Renommée-${s.tenantId.slice(0, 8)}`,
        dateDebut: '2026-09-01T00:00:00.000Z',
        dateFin: '2027-07-31T00:00:00.000Z',
      },
    });
    const idOf = (s: Seed, resource: string) =>
      ({
        campus: s.campus,
        ecoles: s.ecole,
        filieres: s.filiere,
        'annees-academiques': s.annee,
      })[resource] as string;
    const RESOURCES = ['campus', 'ecoles', 'filieres', 'annees-academiques'];

    describe('ressource d’un autre établissement', () => {
      it.each(RESOURCES)(
        'PUT /%s/:id : 404 sans modification depuis un autre établissement',
        async (resource) => {
          const id = idOf(a, resource);
          await call(
            'put',
            b,
            `/${resource}/${id}`,
            bodies(b)[resource as keyof ReturnType<typeof bodies>],
          ).expect(404);
          await call(
            'put',
            a,
            `/${resource}/${id}`,
            bodies(a)[resource as keyof ReturnType<typeof bodies>],
          ).expect(200);
        },
      );

      it('les modifications refusées n’ont rien changé chez le propriétaire', async () => {
        const ecole = await prisma.ecole.findUniqueOrThrow({
          where: { id: a.ecole },
        });
        expect(ecole.tenantId).toBe(a.tenantId);
        expect(ecole.nom).toBe('Renommée');
      });

      it.each(RESOURCES)(
        'DELETE /%s/:id : 404 et rien de supprimé depuis un autre établissement',
        async (resource) => {
          await call('delete', b, `/${resource}/${idOf(a, resource)}`).expect(
            404,
          );
          const model = {
            campus: prisma.campus,
            ecoles: prisma.ecole,
            filieres: prisma.filiere,
            'annees-academiques': prisma.anneeAcademique,
          }[resource] as unknown as {
            count: (args: object) => Promise<number>;
          };
          expect(await model.count({ where: { id: idOf(a, resource) } })).toBe(
            1,
          );
        },
      );

      it('GET /annees-academiques/:id : 200 pour la sienne, 404 pour un autre établissement', async () => {
        await call('get', a, `/annees-academiques/${a.annee}`).expect(200);
        await call('get', b, `/annees-academiques/${a.annee}`).expect(404);
      });

      it('DELETE : l’établissement propriétaire peut supprimer', async () => {
        const annee = await prisma.anneeAcademique.create({
          data: {
            tenantId: a.tenantId,
            libelle: `Jetable-${suffix}`,
            dateDebut: new Date('2030-09-01'),
            dateFin: new Date('2031-07-31'),
          },
        });
        await call('delete', a, `/annees-academiques/${annee.id}`).expect(200);
        await call('get', a, `/annees-academiques/${annee.id}`).expect(404);
      });
    });

    describe('création : l’établissement vient du JWT', () => {
      it('POST /ecoles : tenantId du corps ignoré', async () => {
        const created = await call('post', b, '/ecoles', {
          tenantId: a.tenantId,
          nom: 'Nouvelle',
          code: `N-${suffix}`,
        }).expect(201);
        expect(created.body.tenantId).toBe(b.tenantId);
      });

      it('POST /annees-academiques : tenantId du corps ignoré', async () => {
        const created = await call('post', b, '/annees-academiques', {
          tenantId: a.tenantId,
          libelle: `Nouvelle-${suffix}`,
          dateDebut: '2028-09-01T00:00:00.000Z',
          dateFin: '2029-07-31T00:00:00.000Z',
        }).expect(201);
        expect(created.body.tenantId).toBe(b.tenantId);
      });

      it('POST /annees-academiques sans tenantId : accepté', async () => {
        const created = await call('post', a, '/annees-academiques', {
          libelle: `Sans-tenant-${suffix}`,
          dateDebut: '2028-09-01T00:00:00.000Z',
          dateFin: '2029-07-31T00:00:00.000Z',
        }).expect(201);
        expect(created.body.tenantId).toBe(a.tenantId);
      });

      it('PUT avec un tenantId étranger dans le corps ne déplace pas la ressource', async () => {
        await call('put', b, `/ecoles/${b.ecole}`, {
          tenantId: a.tenantId,
          nom: 'Toujours chez B',
          code: `B-${suffix}`,
        }).expect(200);
        await call('put', b, `/annees-academiques/${b.annee}`, {
          tenantId: a.tenantId,
          libelle: `Toujours-chez-B-${suffix}`,
          dateDebut: '2026-09-01T00:00:00.000Z',
          dateFin: '2027-07-31T00:00:00.000Z',
        }).expect(200);
        expect(
          (await prisma.ecole.findUniqueOrThrow({ where: { id: b.ecole } }))
            .tenantId,
        ).toBe(b.tenantId);
        expect(
          (
            await prisma.anneeAcademique.findUniqueOrThrow({
              where: { id: b.annee },
            })
          ).tenantId,
        ).toBe(b.tenantId);
      });

      it('POST /campus : tenantId du corps toujours refusé (400)', async () => {
        await call('post', b, '/campus', {
          nom: 'X',
          tenantId: a.tenantId,
        }).expect(400);
      });
    });

    describe('références croisées refusées', () => {
      it('POST /ecoles : campus d’un autre établissement → 404', async () => {
        await call('post', b, '/ecoles', {
          nom: 'X',
          code: `X-${suffix}`,
          campusId: a.campus,
        }).expect(404);
        expect(
          await prisma.ecole.count({ where: { code: `X-${suffix}` } }),
        ).toBe(0);
      });

      it('PUT /ecoles/:id : campus d’un autre établissement → 404', async () => {
        await call('put', b, `/ecoles/${b.ecole}`, {
          nom: 'Y',
          code: `Y-${suffix}`,
          campusId: a.campus,
        }).expect(404);
      });

      it('POST /filieres : école d’un autre établissement → 404', async () => {
        await call('post', b, '/filieres', {
          ecoleId: a.ecole,
          nom: 'Z',
          code: `Z-${suffix}`,
          cycle: 'BSC',
        }).expect(404);
        expect(
          await prisma.filiere.count({ where: { code: `Z-${suffix}` } }),
        ).toBe(0);
        await call('post', b, '/filieres', {
          ecoleId: b.ecole,
          nom: 'Z',
          code: `Z-${suffix}`,
          cycle: 'BSC',
        }).expect(201);
      });

      it('PUT /filieres/:id : école d’un autre établissement → 404', async () => {
        await call('put', b, `/filieres/${b.filiere}`, {
          ecoleId: a.ecole,
          nom: 'W',
          code: 'W1',
          cycle: 'BSC',
        }).expect(404);
      });
    });
  },
);
