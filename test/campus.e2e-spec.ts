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

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describeWithTestDatabase('Campus, écoles et filières enrichies (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let tenantId: string;
  const tokens: Record<Role, string> = {} as Record<Role, string>;
  const suffix = uniqueSuffix();
  const password = 'Password123';

  const http = () => request(app.getHttpServer());
  const as = (role: Role) => ({ Authorization: `Bearer ${tokens[role]}` });

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    tenantId = (await createTenant(prisma, suffix)).id;
    for (const role of Object.values(Role)) {
      const email = `${role.toLowerCase()}-${suffix}@example.test`;
      await createUser(prisma, tenantId, email, password, role);
      tokens[role] = await login(app, email, password);
    }
  });

  afterAll(async () => {
    try {
      if (prisma && tenantId) await cleanupTenant(prisma, tenantId);
    } finally {
      if (close) await close();
    }
  });

  describe('campus', () => {
    let campusId: string;

    it('un ADMIN crée un campus (tenant issu du JWT)', async () => {
      const { body } = await http()
        .post('/campus')
        .set(as(Role.ADMIN))
        .send({ nom: 'Bonamoussadi', code: 'BNM', statutDonnees: 'CONFIRME' })
        .expect(201);
      expect(body).toMatchObject({
        tenantId,
        nom: 'Bonamoussadi',
        statutDonnees: 'CONFIRME',
      });
      campusId = body.id;
    });

    it('statutDonnees vaut A_CONFIRMER par défaut', async () => {
      const { body } = await http()
        .post('/campus')
        .set(as(Role.SCOLARITE))
        .send({ nom: 'Annexe' })
        .expect(201);
      expect(body.statutDonnees).toBe('A_CONFIRMER');
    });

    it('refuse tenantId dans le body, un nom en double et un statut inconnu', async () => {
      await http()
        .post('/campus')
        .set(as(Role.ADMIN))
        .send({ nom: 'X', tenantId })
        .expect(400);
      await http()
        .post('/campus')
        .set(as(Role.ADMIN))
        .send({ nom: 'Bonamoussadi' })
        .expect(409);
      await http()
        .post('/campus')
        .set(as(Role.ADMIN))
        .send({ nom: 'X', statutDonnees: 'VALIDE' })
        .expect(400);
    });

    it('un SCOLARITE lit la liste et le détail', async () => {
      await http()
        .get(`/campus?tenant=e2e-${suffix}`)
        .set(as(Role.SCOLARITE))
        .expect(200);
      await http()
        .get(`/campus/${campusId}?tenant=e2e-${suffix}`)
        .set(as(Role.SCOLARITE))
        .expect(200);
      await http()
        .get(`/campus/${MISSING_ID}?tenant=e2e-${suffix}`)
        .set(as(Role.SCOLARITE))
        .expect(404);
    });

    it.each([Role.ENSEIGNANT, Role.ETUDIANT])(
      'le rôle %s lit le catalogue mais ne peut pas écrire (403)',
      async (role) => {
        await http()
          .get(`/campus?tenant=e2e-${suffix}`)
          .set(as(role))
          .expect(200);
        await http()
          .post('/campus')
          .set(as(role))
          .send({ nom: 'Interdit' })
          .expect(403);
      },
    );

    it('lecture anonyme autorisée, écriture anonyme refusée (401)', async () => {
      await http().get(`/campus?tenant=e2e-${suffix}`).expect(200);
      await http().post('/campus').send({ nom: 'Anonyme' }).expect(401);
    });

    describe('écoles rattachées', () => {
      let ecoleId: string;

      it('crée une école avec campusId et la renvoie avec le campus imbriqué', async () => {
        const created = await http()
          .post('/ecoles')
          .set(as(Role.ADMIN))
          .send({ tenantId, nom: 'École Test', code: 'ET', campusId })
          .expect(201);
        ecoleId = created.body.id;

        const { body } = await http()
          .get(`/ecoles/${ecoleId}?tenant=e2e-${suffix}`)
          .set(as(Role.SCOLARITE))
          .expect(200);
        expect(body.campus).toMatchObject({
          id: campusId,
          nom: 'Bonamoussadi',
        });

        const list = await http()
          .get(`/ecoles?tenant=e2e-${suffix}`)
          .set(as(Role.ADMIN));
        expect(
          list.body.find((e: { id: string }) => e.id === ecoleId).campus.id,
        ).toBe(campusId);
      });

      it('refuse un campus inexistant (404)', async () => {
        await http()
          .post('/ecoles')
          .set(as(Role.ADMIN))
          .send({ tenantId, nom: 'X', code: 'X', campusId: MISSING_ID })
          .expect(404);
      });

      it('compte et liste les écoles du campus', async () => {
        const list = await http()
          .get(`/campus?tenant=e2e-${suffix}`)
          .set(as(Role.ADMIN));
        const campus = list.body.find((c: { id: string }) => c.id === campusId);
        expect(campus._count.ecoles).toBe(1);

        const { body } = await http()
          .get(`/campus/${campusId}?tenant=e2e-${suffix}`)
          .set(as(Role.ADMIN));
        expect(body.ecoles.map((e: { id: string }) => e.id)).toEqual([ecoleId]);
      });

      it('bloque la suppression d’un campus qui a des écoles (409)', async () => {
        await http()
          .delete(`/campus/${campusId}`)
          .set(as(Role.ADMIN))
          .expect(409);
      });

      describe('filières enrichies', () => {
        const full = {
          nom: 'Complète',
          code: 'FULL',
          cycle: 'BENG',
          regime: 'ANGLO_SAXON',
          langue: 'EN',
          dureeAnnees: 5,
          tutelle: 'MINESUP',
          credits: 300,
          niveauEntree: 'GCE A Level',
          diplomeRequis: 'GCE A Level (2 papers)',
          modeAdmission: 'ETUDE_DOSSIER',
          fraisCandidatureNational: 25000,
          fraisCandidatureEtranger: 50000.5,
          piecesRequises: ['CNI', 'Relevé de notes', 'Photo'],
          statutDonnees: 'CONFIRME',
        };

        it('crée une filière avec le minimum (nom, code, ecoleId, cycle)', async () => {
          const { body } = await http()
            .post('/filieres')
            .set(as(Role.ADMIN))
            .send({ ecoleId, nom: 'Minimale', code: 'MIN', cycle: 'BSC' })
            .expect(201);
          expect(body).toMatchObject({
            regime: null,
            dureeAnnees: null,
            tutelle: null,
            fraisCandidatureNational: null,
            piecesRequises: [],
            statutDonnees: 'A_CONFIRMER',
          });
        });

        it('persiste et renvoie tous les nouveaux champs tels quels (frais en nombre)', async () => {
          const created = await http()
            .post('/filieres')
            .set(as(Role.ADMIN))
            .send({ ecoleId, ...full })
            .expect(201);
          expect(created.body).toMatchObject(full);

          const { body } = await http()
            .get(`/filieres/${created.body.id}?tenant=e2e-${suffix}`)
            .set(as(Role.SCOLARITE))
            .expect(200);
          expect(body).toMatchObject({ ecoleId, ...full });
          expect(body.piecesRequises).toEqual(full.piecesRequises);
          expect(typeof body.fraisCandidatureNational).toBe('number');
        });

        it.each([
          ['cycle inconnu', { cycle: 'DOCTORAT' }],
          ['modeAdmission inconnu', { modeAdmission: 'TIRAGE' }],
          ['piecesRequises non-tableau', { piecesRequises: 'CNI' }],
          ['frais négatifs', { fraisCandidatureNational: -1 }],
        ])('refuse %s (400)', async (_label, override) => {
          await http()
            .post('/filieres')
            .set(as(Role.ADMIN))
            .send({ ecoleId, nom: 'X', code: 'X', cycle: 'HND', ...override })
            .expect(400);
        });
      });
    });
  });
});
