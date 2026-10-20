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

describeWithTestDatabase(
  'Unicité des affectations et des inscriptions (e2e)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let close: () => Promise<void>;
    const suffix = uniqueSuffix();
    let tenantId: string;
    let token: string;
    let counter = 0;
    const ref = {} as Record<
      'niveau' | 'annee1' | 'annee2' | 'matiere1' | 'matiere2' | 'enseignant',
      string
    >;

    const call = (method: 'post' | 'put', url: string, body: object) =>
      request(app.getHttpServer())
        [method](url)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    /** Un étudiant neuf, sans inscription. */
    async function etudiant() {
      const n = ++counter;
      const user = await createUser(
        prisma,
        tenantId,
        `etu${n}-${suffix}@example.test`,
        'Password123',
        Role.ETUDIANT,
      );
      return (
        await prisma.etudiant.create({
          data: {
            userId: user.id,
            tenantId,
            matricule: `IUC-UNI-${suffix}-${n}`,
            dateNaissance: new Date('2005-01-15'),
            lieuNaissance: 'Douala',
            nationalite: 'Camerounaise',
          },
        })
      ).id;
    }

    beforeAll(async () => {
      ({ app, prisma, close } = await createE2eApp());
      tenantId = (await createTenant(prisma, suffix)).id;
      const ecole = await prisma.ecole.create({
        data: { tenantId, nom: 'SEAS', code: `E-${suffix}` },
      });
      const filiere = await prisma.filiere.create({
        data: { ecoleId: ecole.id, nom: 'ISM', code: 'ISM', cycle: 'BSC' },
      });
      ref.niveau = (
        await prisma.niveau.create({
          data: { filiereId: filiere.id, nom: 'L1', code: 'L1', ordre: 1 },
        })
      ).id;
      const annee = (libelle: string, year: number) =>
        prisma.anneeAcademique
          .create({
            data: {
              tenantId,
              libelle: `${libelle}-${suffix}`,
              dateDebut: new Date(`${year}-09-01`),
              dateFin: new Date(`${year + 1}-07-31`),
            },
          })
          .then((a) => a.id);
      ref.annee1 = await annee('A1', 2026);
      ref.annee2 = await annee('A2', 2027);
      const matiere = (code: string, anneeId: string) =>
        prisma.matiere
          .create({
            data: {
              niveauId: ref.niveau,
              anneeAcademiqueId: anneeId,
              nom: `Matière ${code}`,
              code,
            },
          })
          .then((m) => m.id);
      ref.matiere1 = await matiere('M1', ref.annee1);
      ref.matiere2 = await matiere('M2', ref.annee1);
      const user = await createUser(
        prisma,
        tenantId,
        `ens-${suffix}@example.test`,
        'Password123',
        Role.ENSEIGNANT,
      );
      ref.enseignant = (
        await prisma.enseignant.create({
          data: { userId: user.id, tenantId, type: 'PERMANENT' },
        })
      ).id;
      const admin = `admin-${suffix}@example.test`;
      await createUser(prisma, tenantId, admin, 'Password123', Role.ADMIN);
      token = await login(app, admin, 'Password123');
    });

    afterAll(async () => {
      try {
        if (prisma && tenantId) await cleanupTenant(prisma, tenantId);
      } finally {
        if (close) await close();
      }
    });

    describe('affectations', () => {
      const affecter = (matiereId: string, anneeAcademiqueId: string) =>
        call('post', `/enseignants/${ref.enseignant}/affectations`, {
          matiereId,
          anneeAcademiqueId,
          heuresPrevues: 20,
        });

      it('crée une affectation, puis refuse (409) la même matière pour le même enseignant', async () => {
        await affecter(ref.matiere1, ref.annee1).expect(201);
        const doublon = await affecter(ref.matiere1, ref.annee1).expect(409);
        expect(doublon.body.message).toBe(
          'Cet enseignant est déjà affecté à cette matière',
        );
        expect(
          await prisma.affectation.count({
            where: { enseignantId: ref.enseignant, matiereId: ref.matiere1 },
          }),
        ).toBe(1);
      });

      it('accepte une autre matière pour le même enseignant', async () => {
        await affecter(ref.matiere2, ref.annee1).expect(201);
      });

      it('refuse (400) une année différente de celle de la matière', async () => {
        const autre = await prisma.matiere.create({
          data: {
            niveauId: ref.niveau,
            anneeAcademiqueId: ref.annee1,
            nom: 'Autre',
            code: 'M3',
          },
        });
        const response = await affecter(autre.id, ref.annee2).expect(400);
        expect(response.body.message).toContain(
          'L’année de l’affectation doit être celle de la matière « Autre »',
        );
        expect(
          await prisma.affectation.count({ where: { matiereId: autre.id } }),
        ).toBe(0);
      });

      it('la base elle-même rejette un doublon (contrainte d’unicité)', async () => {
        await expect(
          prisma.affectation.create({
            data: {
              enseignantId: ref.enseignant,
              matiereId: ref.matiere1,
              anneeAcademiqueId: ref.annee1,
            },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
      });

      it('deux demandes simultanées : une seule réussit, l’autre reçoit le 409 clair', async () => {
        const matiere = await prisma.matiere.create({
          data: {
            niveauId: ref.niveau,
            anneeAcademiqueId: ref.annee1,
            nom: 'Course',
            code: 'M4',
          },
        });
        const reponses = await Promise.all([
          affecter(matiere.id, ref.annee1),
          affecter(matiere.id, ref.annee1),
        ]);
        expect(reponses.map((r) => r.status).sort()).toEqual([201, 409]);
        const rejetee = reponses.find((r) => r.status === 409)!;
        expect(rejetee.body.message).toBe(
          'Cet enseignant est déjà affecté à cette matière',
        );
      });
    });

    describe('matières : l’année ne bouge pas sous des affectations', () => {
      const corps = (anneeAcademiqueId: string, nom: string) => ({
        niveauId: ref.niveau,
        anneeAcademiqueId,
        nom,
        code: 'X',
      });

      it('refuse (409) de changer l’année d’une matière déjà affectée', async () => {
        const response = await call(
          'put',
          `/matieres/${ref.matiere1}`,
          corps(ref.annee2, 'Matière M1'),
        ).expect(409);
        expect(response.body.message).toContain(
          'ne peut pas être modifiée tant que des enseignants lui sont affectés',
        );
        expect(
          (
            await prisma.matiere.findUniqueOrThrow({
              where: { id: ref.matiere1 },
            })
          ).anneeAcademiqueId,
        ).toBe(ref.annee1);
      });

      it('autorise les autres modifications d’une matière affectée', async () => {
        await call(
          'put',
          `/matieres/${ref.matiere1}`,
          corps(ref.annee1, 'Renommée'),
        ).expect(200);
      });

      it('autorise le changement d’année d’une matière sans affectation', async () => {
        const libre = await prisma.matiere.create({
          data: {
            niveauId: ref.niveau,
            anneeAcademiqueId: ref.annee1,
            nom: 'Libre',
            code: 'M5',
          },
        });
        await call(
          'put',
          `/matieres/${libre.id}`,
          corps(ref.annee2, 'Libre'),
        ).expect(200);
      });
    });

    describe('inscriptions', () => {
      const inscrire = (etudiantId: string, anneeAcademiqueId: string) => ({
        etudiantId,
        niveauId: ref.niveau,
        anneeAcademiqueId,
      });
      const MESSAGE =
        'Cet étudiant a déjà une inscription pour cette année académique';

      it('refuse (409, message clair) une seconde inscription la même année', async () => {
        const etudiantId = await etudiant();
        await call(
          'post',
          '/inscriptions',
          inscrire(etudiantId, ref.annee1),
        ).expect(201);
        const doublon = await call(
          'post',
          '/inscriptions',
          inscrire(etudiantId, ref.annee1),
        ).expect(409);
        expect(doublon.body.message).toBe(MESSAGE);
        expect(await prisma.inscription.count({ where: { etudiantId } })).toBe(
          1,
        );
      });

      it('accepte la même étudiant une autre année, et un autre étudiant la même année', async () => {
        const etudiantId = await etudiant();
        await call(
          'post',
          '/inscriptions',
          inscrire(etudiantId, ref.annee1),
        ).expect(201);
        await call(
          'post',
          '/inscriptions',
          inscrire(etudiantId, ref.annee2),
        ).expect(201);
        const autre = await etudiant();
        await call('post', '/inscriptions', inscrire(autre, ref.annee1)).expect(
          201,
        );
      });

      it('PUT : refuse (409) de déplacer une inscription vers une année déjà prise, accepte ses autres modifications', async () => {
        const etudiantId = await etudiant();
        const premiere = (
          await call(
            'post',
            '/inscriptions',
            inscrire(etudiantId, ref.annee1),
          ).expect(201)
        ).body;
        await call(
          'post',
          '/inscriptions',
          inscrire(etudiantId, ref.annee2),
        ).expect(201);

        const conflit = await call(
          'put',
          `/inscriptions/${premiere.id}`,
          inscrire(etudiantId, ref.annee2),
        ).expect(409);
        expect(conflit.body.message).toBe(MESSAGE);

        // La même année pour la même inscription n'est pas un doublon
        await call('put', `/inscriptions/${premiere.id}`, {
          ...inscrire(etudiantId, ref.annee1),
          fraisPayes: true,
        }).expect(200);
      });

      it('la base elle-même rejette un doublon (contrainte d’unicité)', async () => {
        const etudiantId = await etudiant();
        const data = {
          etudiantId,
          niveauId: ref.niveau,
          anneeAcademiqueId: ref.annee1,
          createdBy: etudiantId,
        };
        await prisma.inscription.create({ data });
        await expect(prisma.inscription.create({ data })).rejects.toMatchObject(
          {
            code: 'P2002',
          },
        );
      });

      it('deux demandes simultanées : une seule réussit, l’autre reçoit le 409 clair', async () => {
        const etudiantId = await etudiant();
        const reponses = await Promise.all([
          call('post', '/inscriptions', inscrire(etudiantId, ref.annee1)),
          call('post', '/inscriptions', inscrire(etudiantId, ref.annee1)),
        ]);
        expect(reponses.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(reponses.find((r) => r.status === 409)!.body.message).toBe(
          MESSAGE,
        );
      });
    });
  },
);
