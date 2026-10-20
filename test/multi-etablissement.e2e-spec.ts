import { INestApplication } from '@nestjs/common';
import { Role, StatutCandidature } from '@prisma/client';
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

describeWithTestDatabase('Isolation multi-établissement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const ids = {} as Record<'a' | 'b' | 'filiere' | 'annee', string>;
  const tokens = {} as Record<'adminA' | 'adminB', string>;
  let counter = 0;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  /** Candidature de l'établissement A, créée directement au statut voulu. */
  const candidature = async (statut: StatutCandidature, email?: string) => {
    counter += 1;
    return prisma.candidature.create({
      data: {
        tenantId: ids.a,
        nom: 'Test',
        prenom: `C${counter}`,
        email: email ?? `c${counter}-${suffix}@example.test`,
        dateNaissance: new Date('2005-01-15'),
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
        filiereId: ids.filiere,
        anneeAcademiqueId: ids.annee,
        numeroDossier: `M-${suffix}-${counter}`,
        statut,
      },
    });
  };
  const creerEtudiant = (
    token: string,
    candidatureId: string,
    tenantId = ids.a,
  ) =>
    http()
      .post('/etudiants')
      .set(auth(token))
      .send({ candidatureId, tenantId });

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    ids.a = (await createTenant(prisma, `${suffix}-a`)).id;
    ids.b = (await createTenant(prisma, `${suffix}-b`)).id;
    const ecole = await prisma.ecole.create({
      data: { tenantId: ids.a, nom: 'SEAS', code: 'SEAS' },
    });
    ids.filiere = (
      await prisma.filiere.create({
        data: { ecoleId: ecole.id, nom: 'ISM', code: 'ISM', cycle: 'BSC' },
      })
    ).id;
    ids.annee = (
      await prisma.anneeAcademique.create({
        data: {
          tenantId: ids.a,
          libelle: `E2E-${suffix}`,
          dateDebut: new Date('2026-10-01'),
          dateFin: new Date('2027-07-31'),
        },
      })
    ).id;
    for (const [key, tenantId] of [
      ['adminA', ids.a],
      ['adminB', ids.b],
    ] as const) {
      const email = `${key}-${suffix}@example.test`;
      await createUser(prisma, tenantId, email, 'Password123', Role.ADMIN);
      tokens[key] = await login(app, email, 'Password123');
    }
  });

  afterAll(async () => {
    try {
      if (prisma) {
        for (const id of [ids.a, ids.b]) {
          if (id) await cleanupTenant(prisma, id);
        }
      }
    } finally {
      if (close) await close();
    }
  });

  describe('candidatures', () => {
    it('GET /candidatures/:id : 404 pour un autre établissement, 200 pour le sien', async () => {
      const { id } = await candidature(StatutCandidature.SOUMIS);
      await http()
        .get(`/candidatures/${id}`)
        .set(auth(tokens.adminB))
        .expect(404);
      const response = await http()
        .get(`/candidatures/${id}`)
        .set(auth(tokens.adminA))
        .expect(200);
      expect(response.body.id).toBe(id);
    });

    it('DELETE /candidatures/:id : 404 et rien de supprimé pour un autre établissement', async () => {
      const { id } = await candidature(StatutCandidature.SOUMIS);
      await http()
        .delete(`/candidatures/${id}`)
        .set(auth(tokens.adminB))
        .expect(404);
      expect(await prisma.candidature.count({ where: { id } })).toBe(1);
      await http()
        .delete(`/candidatures/${id}`)
        .set(auth(tokens.adminA))
        .expect(200);
      expect(await prisma.candidature.count({ where: { id } })).toBe(0);
    });
  });

  describe('étudiants', () => {
    it('crée un étudiant depuis une candidature acceptée du même établissement', async () => {
      const { id } = await candidature(StatutCandidature.ACCEPTE);
      const response = await creerEtudiant(tokens.adminA, id).expect(201);
      expect(response.body.candidatureId).toBe(id);
      expect(response.body.tenantId).toBe(ids.a);
      expect(response.body.motDePasseTemporaire).toEqual(expect.any(String));
    });

    it('refuse (404) la candidature d’un autre établissement, même avec le bon tenantId dans le corps', async () => {
      const { id } = await candidature(StatutCandidature.ACCEPTE);
      await creerEtudiant(tokens.adminB, id, ids.a).expect(404);
      await creerEtudiant(tokens.adminB, id, ids.b).expect(404);
      expect(
        await prisma.etudiant.count({ where: { candidatureId: id } }),
      ).toBe(0);
    });

    it('ignore le tenantId du corps : seul le JWT fait foi', async () => {
      const { id } = await candidature(StatutCandidature.ACCEPTE);
      const response = await creerEtudiant(tokens.adminA, id, ids.b).expect(
        201,
      );
      expect(response.body.tenantId).toBe(ids.a);
    });

    it('refuse (400) une candidature non acceptée', async () => {
      const { id } = await candidature(StatutCandidature.EN_EXAMEN);
      await creerEtudiant(tokens.adminA, id).expect(400);
    });

    it('refuse (409) un second compte pour la même candidature, sans créer de compte orphelin', async () => {
      const { id, email } = await candidature(StatutCandidature.ACCEPTE);
      await creerEtudiant(tokens.adminA, id).expect(201);
      await creerEtudiant(tokens.adminA, id).expect(409);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
      expect(
        await prisma.etudiant.count({ where: { candidatureId: id } }),
      ).toBe(1);
    });

    it('refuse (409) quand l’adresse e-mail a déjà un compte, sans rien créer', async () => {
      const email = `deja-${suffix}@example.test`;
      await createUser(prisma, ids.a, email, 'Password123', Role.ETUDIANT);
      const { id } = await candidature(StatutCandidature.ACCEPTE, email);
      await creerEtudiant(tokens.adminA, id).expect(409);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
      expect(
        await prisma.etudiant.count({ where: { candidatureId: id } }),
      ).toBe(0);
    });

    it('limite la liste et le détail à l’établissement du JWT', async () => {
      const { id } = await candidature(StatutCandidature.ACCEPTE);
      const created = (await creerEtudiant(tokens.adminA, id).expect(201)).body;

      const listA = await http()
        .get('/etudiants')
        .set(auth(tokens.adminA))
        .expect(200);
      expect(listA.body.map((e: { id: string }) => e.id)).toContain(created.id);
      const listB = await http()
        .get('/etudiants')
        .set(auth(tokens.adminB))
        .expect(200);
      expect(listB.body.map((e: { id: string }) => e.id)).not.toContain(
        created.id,
      );

      await http()
        .get(`/etudiants/${created.id}`)
        .set(auth(tokens.adminA))
        .expect(200);
      await http()
        .get(`/etudiants/${created.id}`)
        .set(auth(tokens.adminB))
        .expect(404);
    });
  });
});
