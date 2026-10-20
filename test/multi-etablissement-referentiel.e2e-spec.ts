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
  annee: string;
  niveau: string;
  filiere: string;
  matiere: string;
  etudiant: string;
  inscription: string;
  enseignant: string;
  enseignantUser: string;
  freeUser: string;
  affectation: string;
};

describeWithTestDatabase(
  'Isolation multi-établissement du référentiel (e2e)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let close: () => Promise<void>;
    const suffix = uniqueSuffix();
    const tenants: string[] = [];
    let a: Seed;
    let b: Seed;

    const http = () => request(app.getHttpServer());
    const get = (who: Seed, url: string) =>
      http().get(url).set('Authorization', `Bearer ${who.token}`);
    const post = (who: Seed, url: string, body: object) =>
      http().post(url).set('Authorization', `Bearer ${who.token}`).send(body);
    const put = (who: Seed, url: string, body: object) =>
      http().put(url).set('Authorization', `Bearer ${who.token}`).send(body);
    const del = (who: Seed, url: string) =>
      http().delete(url).set('Authorization', `Bearer ${who.token}`);

    /** Jeu de données complet d'un établissement + un ADMIN connecté. */
    async function seed(label: string): Promise<Seed> {
      const tenantId = (await createTenant(prisma, `${suffix}-${label}`)).id;
      tenants.push(tenantId);
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
      const niveau = await prisma.niveau.create({
        data: { filiereId: filiere.id, nom: 'Licence 1', code: 'L1', ordre: 1 },
      });
      const annee = await prisma.anneeAcademique.create({
        data: {
          tenantId,
          libelle: `E2E-${label}-${suffix}`,
          dateDebut: new Date('2026-09-01'),
          dateFin: new Date('2027-07-31'),
        },
      });
      const matiere = await prisma.matiere.create({
        data: {
          niveauId: niveau.id,
          anneeAcademiqueId: annee.id,
          nom: 'Algo',
          code: `M-${label}`,
        },
      });
      const user = (role: Role, key: string) =>
        createUser(
          prisma,
          tenantId,
          `${key}-${label}-${suffix}@example.test`,
          'Password123',
          role,
        );
      const etudiantUser = await user(Role.ETUDIANT, 'etu');
      const etudiant = await prisma.etudiant.create({
        data: {
          userId: etudiantUser.id,
          tenantId,
          matricule: `IUC-${label}-${suffix}`,
          dateNaissance: new Date('2005-01-15'),
          lieuNaissance: 'Douala',
          nationalite: 'Camerounaise',
        },
      });
      const inscription = await prisma.inscription.create({
        data: {
          etudiantId: etudiant.id,
          niveauId: niveau.id,
          anneeAcademiqueId: annee.id,
          createdBy: etudiantUser.id,
        },
      });
      const enseignantUser = await user(Role.ENSEIGNANT, 'ens');
      const enseignant = await prisma.enseignant.create({
        data: { userId: enseignantUser.id, tenantId, type: 'PERMANENT' },
      });
      const affectation = await prisma.affectation.create({
        data: {
          enseignantId: enseignant.id,
          matiereId: matiere.id,
          anneeAcademiqueId: annee.id,
        },
      });
      const freeUser = await user(Role.ENSEIGNANT, 'libre');
      const admin = await user(Role.ADMIN, 'admin');
      return {
        tenantId,
        token: await login(app, admin.email, 'Password123'),
        annee: annee.id,
        niveau: niveau.id,
        filiere: filiere.id,
        matiere: matiere.id,
        etudiant: etudiant.id,
        inscription: inscription.id,
        enseignant: enseignant.id,
        enseignantUser: enseignantUser.id,
        freeUser: freeUser.id,
        affectation: affectation.id,
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

    const resources = (s: Seed) =>
      [
        ['niveaux', s.niveau],
        ['matieres', s.matiere],
        ['inscriptions', s.inscription],
        ['enseignants', s.enseignant],
      ] as const;

    describe('lectures', () => {
      it.each(['niveaux', 'matieres', 'inscriptions', 'enseignants'])(
        'GET /%s : la liste ne contient que l’établissement du JWT',
        async (resource) => {
          const idA = resources(a).find(([name]) => name === resource)![1];
          const idB = resources(b).find(([name]) => name === resource)![1];
          const ids = async (who: Seed) =>
            (await get(who, `/${resource}`).expect(200)).body.map(
              (item: { id: string }) => item.id,
            );
          const listA = await ids(a);
          expect(listA).toContain(idA);
          expect(listA).not.toContain(idB);
          const listB = await ids(b);
          expect(listB).toContain(idB);
          expect(listB).not.toContain(idA);
        },
      );

      it.each(['niveaux', 'matieres', 'inscriptions', 'enseignants'])(
        'GET /%s/:id : 200 pour le sien, 404 pour un autre établissement',
        async (resource) => {
          const idA = resources(a).find(([name]) => name === resource)![1];
          await get(a, `/${resource}/${idA}`).expect(200);
          await get(b, `/${resource}/${idA}`).expect(404);
        },
      );

      it('GET /enseignants/:id/affectations : 404 pour un autre établissement', async () => {
        const own = await get(
          a,
          `/enseignants/${a.enseignant}/affectations`,
        ).expect(200);
        expect(own.body).toHaveLength(1);
        await get(b, `/enseignants/${a.enseignant}/affectations`).expect(404);
      });
    });

    describe('écritures sur une ressource d’un autre établissement', () => {
      const updates = (s: Seed) =>
        [
          [
            'niveaux',
            s.niveau,
            { filiereId: s.filiere, nom: 'Renommé', code: 'L1', ordre: 1 },
          ],
          [
            'matieres',
            s.matiere,
            {
              niveauId: s.niveau,
              anneeAcademiqueId: s.annee,
              nom: 'Renommée',
              code: 'M1',
            },
          ],
          [
            'inscriptions',
            s.inscription,
            {
              etudiantId: s.etudiant,
              niveauId: s.niveau,
              anneeAcademiqueId: s.annee,
              fraisPayes: true,
            },
          ],
          [
            'enseignants',
            s.enseignant,
            { userId: s.enseignantUser, type: 'VACATAIRE' },
          ],
        ] as const;

      it.each(['niveaux', 'matieres', 'inscriptions', 'enseignants'])(
        'PUT /%s/:id : 404 et aucune modification depuis un autre établissement',
        async (resource) => {
          const [, id, body] = updates(a).find(([name]) => name === resource)!;
          // B tente de modifier A avec un corps valide pour B : toujours 404
          const [, , bodyB] = updates(b).find(([name]) => name === resource)!;
          await put(b, `/${resource}/${id}`, bodyB).expect(404);
          await put(b, `/${resource}/${id}`, body).expect(404);
          await put(a, `/${resource}/${id}`, body).expect(200);
        },
      );

      it('PUT /niveaux/:id garde la modification faite par son propre établissement seulement', async () => {
        const niveau = await prisma.niveau.findUniqueOrThrow({
          where: { id: a.niveau },
        });
        expect(niveau.nom).toBe('Renommé');
      });

      it.each(['niveaux', 'matieres', 'inscriptions', 'enseignants'])(
        'DELETE /%s/:id : 404 et rien de supprimé depuis un autre établissement',
        async (resource) => {
          const id = resources(a).find(([name]) => name === resource)![1];
          await del(b, `/${resource}/${id}`).expect(404);
          const model = {
            niveaux: prisma.niveau,
            matieres: prisma.matiere,
            inscriptions: prisma.inscription,
            enseignants: prisma.enseignant,
          }[resource] as unknown as {
            count: (args: object) => Promise<number>;
          };
          expect(await model.count({ where: { id } })).toBe(1);
        },
      );

      it('DELETE : l’établissement propriétaire peut supprimer', async () => {
        const niveau = await prisma.niveau.create({
          data: { filiereId: a.filiere, nom: 'Jetable', code: 'J1', ordre: 9 },
        });
        await del(a, `/niveaux/${niveau.id}`).expect(200);
        await get(a, `/niveaux/${niveau.id}`).expect(404);
      });
    });

    describe('références croisées refusées', () => {
      it('POST /niveaux : filière d’un autre établissement → 404', async () => {
        const body = { nom: 'N', code: 'N1', ordre: 2 };
        await post(b, '/niveaux', { ...body, filiereId: a.filiere }).expect(
          404,
        );
        await post(b, '/niveaux', { ...body, filiereId: b.filiere }).expect(
          201,
        );
        expect(
          await prisma.niveau.count({ where: { filiereId: a.filiere } }),
        ).toBe(1);
      });

      it('PUT /niveaux/:id : filière d’un autre établissement → 404', async () => {
        await put(b, `/niveaux/${b.niveau}`, {
          filiereId: a.filiere,
          nom: 'X',
          code: 'X',
          ordre: 1,
        }).expect(404);
      });

      it('POST /matieres : niveau ou année d’un autre établissement → 404', async () => {
        const base = { nom: 'Réseaux', code: 'R1' };
        await post(b, '/matieres', {
          ...base,
          niveauId: a.niveau,
          anneeAcademiqueId: b.annee,
        }).expect(404);
        await post(b, '/matieres', {
          ...base,
          niveauId: b.niveau,
          anneeAcademiqueId: a.annee,
        }).expect(404);
        await post(b, '/matieres', {
          ...base,
          niveauId: b.niveau,
          anneeAcademiqueId: b.annee,
        }).expect(201);
      });

      it('PUT /matieres/:id : niveau ou année d’un autre établissement → 404', async () => {
        await put(b, `/matieres/${b.matiere}`, {
          nom: 'X',
          code: 'X',
          niveauId: a.niveau,
          anneeAcademiqueId: b.annee,
        }).expect(404);
      });

      it('POST /inscriptions : étudiant, niveau ou année d’un autre établissement → 404', async () => {
        // Une année sans inscription pour l'étudiant : une seule inscription par année
        const libre = await prisma.anneeAcademique.create({
          data: {
            tenantId: b.tenantId,
            libelle: `Libre-${suffix}`,
            dateDebut: new Date('2030-09-01'),
            dateFin: new Date('2031-07-31'),
          },
        });
        const own = {
          etudiantId: b.etudiant,
          niveauId: b.niveau,
          anneeAcademiqueId: libre.id,
        };
        for (const croise of [
          { etudiantId: a.etudiant },
          { niveauId: a.niveau },
          { anneeAcademiqueId: a.annee },
        ]) {
          await post(b, '/inscriptions', { ...own, ...croise }).expect(404);
        }
        const created = await post(b, '/inscriptions', own).expect(201);
        expect(created.body.etudiantId).toBe(b.etudiant);
        expect(
          await prisma.inscription.count({ where: { etudiantId: a.etudiant } }),
        ).toBe(1);
      });

      it('PUT /inscriptions/:id : référence d’un autre établissement → 404', async () => {
        await put(b, `/inscriptions/${b.inscription}`, {
          etudiantId: a.etudiant,
          niveauId: b.niveau,
          anneeAcademiqueId: b.annee,
        }).expect(404);
      });

      it('POST /enseignants : userId d’un autre établissement → 404, tenantId du corps ignoré', async () => {
        await post(b, '/enseignants', {
          userId: a.freeUser,
          tenantId: b.tenantId,
          type: 'PERMANENT',
        }).expect(404);
        expect(
          await prisma.enseignant.count({ where: { userId: a.freeUser } }),
        ).toBe(0);

        const created = await post(b, '/enseignants', {
          userId: b.freeUser,
          tenantId: a.tenantId,
          type: 'PERMANENT',
        }).expect(201);
        expect(created.body.tenantId).toBe(b.tenantId);
      });

      it('PUT /enseignants/:id : userId d’un autre établissement → 404', async () => {
        await put(a, `/enseignants/${a.enseignant}`, {
          userId: b.freeUser,
          type: 'PERMANENT',
        }).expect(404);
      });

      it('POST /enseignants/:id/affectations : enseignant, matière ou année d’un autre établissement → 404', async () => {
        // Matière pas encore affectée à cet enseignant : une seule affectation par matière
        const neuve = await prisma.matiere.create({
          data: {
            niveauId: b.niveau,
            anneeAcademiqueId: b.annee,
            nom: 'Affectable',
            code: `AFF-${suffix}`,
          },
        });
        const own = { matiereId: neuve.id, anneeAcademiqueId: b.annee };
        await post(b, `/enseignants/${a.enseignant}/affectations`, own).expect(
          404,
        );
        await post(b, `/enseignants/${b.enseignant}/affectations`, {
          ...own,
          matiereId: a.matiere,
        }).expect(404);
        await post(b, `/enseignants/${b.enseignant}/affectations`, {
          ...own,
          anneeAcademiqueId: a.annee,
        }).expect(404);
        await post(b, `/enseignants/${b.enseignant}/affectations`, own).expect(
          201,
        );
        expect(
          await prisma.affectation.count({
            where: { enseignantId: a.enseignant },
          }),
        ).toBe(1);
      });
    });
  },
);
