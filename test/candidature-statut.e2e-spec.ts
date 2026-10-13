import { INestApplication } from '@nestjs/common';
import { Role, StatutCandidature } from '@prisma/client';
import * as request from 'supertest';
import { TRANSITIONS } from '../src/modules/candidatures/candidatures.service';
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

const STATUTS = Object.values(StatutCandidature);

describeWithTestDatabase('Transitions de statut des candidatures (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const ids = {} as Record<'tenant' | 'other' | 'filiere' | 'annee', string>;
  const tokens = {} as Record<'scolarite' | 'otherAdmin', string>;
  let counter = 0;

  const http = () => request(app.getHttpServer());
  /** Candidature créée directement au statut voulu. */
  const candidature = async (statut: StatutCandidature) =>
    (
      await prisma.candidature.create({
        data: {
          tenantId: ids.tenant,
          nom: 'Test',
          prenom: `C${++counter}`,
          email: `c${counter}-${suffix}@example.test`,
          dateNaissance: new Date('2005-01-15'),
          lieuNaissance: 'Douala',
          nationalite: 'Camerounaise',
          filiereId: ids.filiere,
          anneeAcademiqueId: ids.annee,
          numeroDossier: `T-${suffix}-${counter}`,
          statut,
        },
      })
    ).id;
  const patch = (id: string, body: object, token = tokens.scolarite) =>
    http()
      .patch(`/candidatures/${id}/statut`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    ids.tenant = (await createTenant(prisma, suffix)).id;
    ids.other = (await createTenant(prisma, `${suffix}-autre`)).id;
    const ecole = await prisma.ecole.create({
      data: { tenantId: ids.tenant, nom: 'SEAS', code: 'SEAS' },
    });
    ids.filiere = (
      await prisma.filiere.create({
        data: { ecoleId: ecole.id, nom: 'ISM', code: 'ISM', cycle: 'BSC' },
      })
    ).id;
    ids.annee = (
      await prisma.anneeAcademique.create({
        data: {
          tenantId: ids.tenant,
          libelle: `E2E-${suffix}`,
          dateDebut: new Date('2026-10-01'),
          dateFin: new Date('2027-07-31'),
        },
      })
    ).id;
    for (const [key, tenantId, role] of [
      ['scolarite', ids.tenant, Role.SCOLARITE],
      ['otherAdmin', ids.other, Role.ADMIN],
    ] as const) {
      const email = `${key}-${suffix}@example.test`;
      await createUser(prisma, tenantId, email, 'Password123', role);
      tokens[key] = await login(app, email, 'Password123');
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

  describe('matrice complète (25 couples de statuts)', () => {
    const cases = STATUTS.flatMap((from) =>
      STATUTS.map((to) => [from, to, TRANSITIONS[from].includes(to)] as const),
    );

    it.each(cases)('%s → %s autorisée : %s', async (from, to, allowed) => {
      const id = await candidature(from);
      const { body } = await patch(id, {
        statut: to,
        commentaire: 'Motif de test',
      }).expect(allowed ? 200 : 400);
      if (allowed) {
        expect(body.statut).toBe(to);
      } else if (from === to) {
        expect(body.message).toBe(`La candidature est déjà au statut ${to}`);
      } else {
        expect(body.message).toContain(
          `Transition ${from} → ${to} non autorisée`,
        );
      }
    });
  });

  describe('motif de refus', () => {
    it.each([
      ['absent', {}],
      ['vide', { commentaire: '   ' }],
    ])('refuse un rejet avec motif %s (400)', async (_label, extra) => {
      const id = await candidature(StatutCandidature.EN_EXAMEN);
      const { body } = await patch(id, { statut: 'REJETE', ...extra }).expect(
        400,
      );
      expect(body.message).toContain('motif de refus');
      const unchanged = await prisma.candidature.findUnique({ where: { id } });
      expect(unchanged.statut).toBe('EN_EXAMEN');
    });

    it('enregistre le motif dans l’historique, avec l’auteur', async () => {
      const id = await candidature(StatutCandidature.EN_EXAMEN);
      await patch(id, {
        statut: 'REJETE',
        commentaire: '  Dossier hors délai ',
      }).expect(200);
      const historique = await prisma.historiqueCandidature.findMany({
        where: { candidatureId: id },
        include: { user: { select: { email: true } } },
      });
      expect(historique).toEqual([
        expect.objectContaining({
          action: 'STATUT_REJETE',
          commentaire: 'Dossier hors délai',
          user: { email: `scolarite-${suffix}@example.test` },
        }),
      ]);
    });

    it('exige un commentaire pour rouvrir une candidature rejetée', async () => {
      const id = await candidature(StatutCandidature.REJETE);
      const { body } = await patch(id, { statut: 'EN_EXAMEN' }).expect(400);
      expect(body.message).toContain('rouvrir');
      await patch(id, {
        statut: 'EN_EXAMEN',
        commentaire: 'Pièce reçue',
      }).expect(200);
    });
  });

  describe('décision ACCEPTE', () => {
    it('reste réversible tant qu’aucun compte étudiant n’existe', async () => {
      const id = await candidature(StatutCandidature.ACCEPTE);
      await patch(id, { statut: 'EN_EXAMEN' }).expect(200);
    });

    it('devient définitive une fois le compte étudiant créé (409)', async () => {
      const id = await candidature(StatutCandidature.ACCEPTE);
      await http()
        .post('/etudiants')
        .set('Authorization', `Bearer ${tokens.scolarite}`)
        .send({ candidatureId: id, tenantId: ids.tenant })
        .expect(201);
      for (const statut of ['EN_EXAMEN', 'REJETE']) {
        const { body } = await patch(id, {
          statut,
          commentaire: 'Tentative',
        }).expect(409);
        expect(body.message).toContain('définitive');
      }
    });
  });

  it('ignore les candidatures d’un autre établissement (404)', async () => {
    const id = await candidature(StatutCandidature.SOUMIS);
    await patch(id, { statut: 'EN_EXAMEN' }, tokens.otherAdmin).expect(404);
  });
});
