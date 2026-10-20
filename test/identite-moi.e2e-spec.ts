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

type Etu = {
  token: string;
  etudiant: string;
  matricule: string;
  dossier: string;
  inscriptions: string[];
};
type Ens = { token: string; enseignant: string; affectations: string[] };

describeWithTestDatabase('Routes « moi » : identité par le JWT (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const tenants: string[] = [];
  let counter = 0;
  const tokens = {} as Record<
    'admin' | 'scolarite' | 'sansProfil' | 'sansCandidature',
    string
  >;
  let tenantA: string;
  let etuA1: Etu;
  let etuA2: Etu;
  let etuB: Etu;
  let ensA1: Ens;
  let ensA2: Ens;
  let ensB: Ens;
  const ref = {} as Record<
    'ecole' | 'filiere' | 'niveau' | 'annee1' | 'annee2' | 'matiere',
    string
  >;

  const get = (url: string, token?: string) => {
    const req = request(app.getHttpServer()).get(url);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  async function structure(tenantId: string, label: string) {
    const ecole = await prisma.ecole.create({
      data: { tenantId, nom: `École ${label}`, code: `E-${label}-${suffix}` },
    });
    const filiere = await prisma.filiere.create({
      data: { ecoleId: ecole.id, nom: 'ISM', code: `F-${label}`, cycle: 'BSC' },
    });
    const niveau = await prisma.niveau.create({
      data: { filiereId: filiere.id, nom: 'Licence 1', code: 'L1', ordre: 1 },
    });
    const mk = (libelle: string, year: number) =>
      prisma.anneeAcademique.create({
        data: {
          tenantId,
          libelle: `${libelle}-${label}-${suffix}`,
          dateDebut: new Date(`${year}-09-01`),
          dateFin: new Date(`${year + 1}-07-31`),
        },
      });
    const annee1 = await mk('A1', 2026);
    const annee2 = await mk('A2', 2027);
    const matiere = await prisma.matiere.create({
      data: {
        niveauId: niveau.id,
        anneeAcademiqueId: annee1.id,
        nom: `Algo ${label}`,
        code: `M-${label}`,
      },
    });
    // Une matière par année : un enseignant n'est affecté qu'une fois à une matière
    const matiere2 = await prisma.matiere.create({
      data: {
        niveauId: niveau.id,
        anneeAcademiqueId: annee2.id,
        nom: `Réseaux ${label}`,
        code: `R-${label}`,
      },
    });
    return { ecole, filiere, niveau, annee1, annee2, matiere, matiere2 };
  }

  async function etudiant(
    tenantId: string,
    s: Awaited<ReturnType<typeof structure>>,
    nbInscriptions: number,
  ): Promise<Etu> {
    const n = ++counter;
    const email = `etu${n}-${suffix}@example.test`;
    const user = await createUser(
      prisma,
      tenantId,
      email,
      'Password123',
      Role.ETUDIANT,
    );
    const dossier = `MOI-${suffix}-${n}`;
    const candidature = await prisma.candidature.create({
      data: {
        tenantId,
        nom: 'Cand',
        prenom: `E${n}`,
        email,
        dateNaissance: new Date('2005-01-15'),
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
        filiereId: s.filiere.id,
        anneeAcademiqueId: s.annee1.id,
        numeroDossier: dossier,
        statut: 'ACCEPTE',
      },
    });
    const matricule = `IUC-MOI-${suffix}-${n}`;
    const e = await prisma.etudiant.create({
      data: {
        userId: user.id,
        tenantId,
        matricule,
        dateNaissance: new Date('2005-01-15'),
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
        candidatureId: candidature.id,
      },
    });
    const inscriptions: string[] = [];
    for (const annee of [s.annee1, s.annee2].slice(0, nbInscriptions)) {
      inscriptions.push(
        (
          await prisma.inscription.create({
            data: {
              etudiantId: e.id,
              niveauId: s.niveau.id,
              anneeAcademiqueId: annee.id,
              createdBy: user.id,
            },
          })
        ).id,
      );
    }
    return {
      token: await login(app, email, 'Password123'),
      etudiant: e.id,
      matricule,
      dossier,
      inscriptions,
    };
  }

  async function enseignant(
    tenantId: string,
    s: Awaited<ReturnType<typeof structure>>,
    nbAffectations: number,
  ): Promise<Ens> {
    const n = ++counter;
    const email = `ens${n}-${suffix}@example.test`;
    const user = await createUser(
      prisma,
      tenantId,
      email,
      'Password123',
      Role.ENSEIGNANT,
    );
    const e = await prisma.enseignant.create({
      data: { userId: user.id, tenantId, type: 'PERMANENT' },
    });
    const affectations: string[] = [];
    for (const annee of [s.annee1, s.annee2].slice(0, nbAffectations)) {
      affectations.push(
        (
          await prisma.affectation.create({
            data: {
              enseignantId: e.id,
              matiereId: annee === s.annee1 ? s.matiere.id : s.matiere2.id,
              anneeAcademiqueId: annee.id,
            },
          })
        ).id,
      );
    }
    return {
      token: await login(app, email, 'Password123'),
      enseignant: e.id,
      affectations,
    };
  }

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    tenantA = (await createTenant(prisma, `${suffix}-a`)).id;
    const tenantB = (await createTenant(prisma, `${suffix}-b`)).id;
    tenants.push(tenantA, tenantB);
    const sA = await structure(tenantA, 'a');
    const sB = await structure(tenantB, 'b');
    ref.annee1 = sA.annee1.id;
    ref.matiere = sA.matiere.id;

    // Deux étudiants et deux enseignants du MÊME établissement, un voisin ailleurs
    etuA1 = await etudiant(tenantA, sA, 2);
    etuA2 = await etudiant(tenantA, sA, 1);
    etuB = await etudiant(tenantB, sB, 1);
    ensA1 = await enseignant(tenantA, sA, 2);
    ensA2 = await enseignant(tenantA, sA, 1);
    ensB = await enseignant(tenantB, sB, 1);

    for (const [key, role] of [
      ['admin', Role.ADMIN],
      ['scolarite', Role.SCOLARITE],
      ['sansProfil', Role.ETUDIANT],
    ] as const) {
      const email = `${key}-${suffix}@example.test`;
      await createUser(prisma, tenantA, email, 'Password123', role);
      tokens[key] = await login(app, email, 'Password123');
    }
    // Étudiant avec profil mais sans candidature d'origine (inscrit directement)
    const email = `sans-cand-${suffix}@example.test`;
    const user = await createUser(
      prisma,
      tenantA,
      email,
      'Password123',
      Role.ETUDIANT,
    );
    await prisma.etudiant.create({
      data: {
        userId: user.id,
        tenantId: tenantA,
        matricule: `IUC-SC-${suffix}`,
        dateNaissance: new Date('2005-01-15'),
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
      },
    });
    tokens.sansCandidature = await login(app, email, 'Password123');
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

  describe('étudiant', () => {
    it('GET /etudiants/me : chacun voit son propre profil, jamais celui d’un autre', async () => {
      for (const [mine, other] of [
        [etuA1, etuA2],
        [etuA2, etuA1],
        [etuB, etuA1],
      ]) {
        const { body } = await get('/etudiants/me', mine.token).expect(200);
        expect(body.id).toBe(mine.etudiant);
        expect(body.matricule).toBe(mine.matricule);
        expect(JSON.stringify(body)).not.toContain(other.matricule);
        expect(body.userId).toBeUndefined();
        expect(body.tenantId).toBeUndefined();
      }
    });

    it('GET /etudiants/me/inscriptions : uniquement les siennes', async () => {
      const a1 = (
        await get('/etudiants/me/inscriptions', etuA1.token).expect(200)
      ).body;
      const a2 = (
        await get('/etudiants/me/inscriptions', etuA2.token).expect(200)
      ).body;
      const b = (
        await get('/etudiants/me/inscriptions', etuB.token).expect(200)
      ).body;
      const ids = (list: { id: string }[]) => list.map((i) => i.id).sort();
      expect(ids(a1)).toEqual([...etuA1.inscriptions].sort());
      expect(ids(a2)).toEqual([...etuA2.inscriptions].sort());
      expect(ids(b)).toEqual([...etuB.inscriptions].sort());
      expect(ids(a1).some((id) => ids(a2).includes(id))).toBe(false);
      expect(a1[0].createdBy).toBeUndefined();
    });

    it('GET /etudiants/me/candidature : uniquement sa candidature d’origine', async () => {
      for (const [mine, other] of [
        [etuA1, etuA2],
        [etuA2, etuA1],
      ]) {
        const { body } = await get(
          '/etudiants/me/candidature',
          mine.token,
        ).expect(200);
        expect(body.numeroDossier).toBe(mine.dossier);
        expect(JSON.stringify(body)).not.toContain(other.dossier);
        expect(body.email).toBeUndefined();
        expect(body.historiques).toBeUndefined();
      }
    });

    it('ignore tout identifiant fourni dans l’URL : l’identité vient du JWT', async () => {
      for (const path of [
        '/etudiants/me',
        '/etudiants/me/inscriptions',
        '/etudiants/me/candidature',
      ]) {
        const { body } = await get(
          `${path}?id=${etuA2.etudiant}&etudiantId=${etuA2.etudiant}&userId=${etuA2.etudiant}`,
          etuA1.token,
        ).expect(200);
        expect(JSON.stringify(body)).not.toContain(etuA2.matricule);
        expect(JSON.stringify(body)).not.toContain(etuA2.dossier);
      }
      const { body } = await get(
        `/etudiants/me?id=${etuA2.etudiant}`,
        etuA1.token,
      ).expect(200);
      expect(body.id).toBe(etuA1.etudiant);
    });

    it('un étudiant ne peut pas lire d’autres étudiants par les routes du personnel', async () => {
      await get('/etudiants', etuA1.token).expect(403);
      await get(`/etudiants/${etuA2.etudiant}`, etuA1.token).expect(403);
      await get(`/etudiants/${etuA1.etudiant}`, etuA1.token).expect(403);
      await get('/inscriptions', etuA1.token).expect(403);
    });

    it('réservé au rôle ETUDIANT (403) et à un jeton valide (401)', async () => {
      for (const token of [tokens.admin, tokens.scolarite, ensA1.token]) {
        await get('/etudiants/me', token).expect(403);
        await get('/etudiants/me/inscriptions', token).expect(403);
        await get('/etudiants/me/candidature', token).expect(403);
      }
      await get('/etudiants/me').expect(401);
    });

    it('404 sans profil étudiant, et sans candidature d’origine', async () => {
      await get('/etudiants/me', tokens.sansProfil).expect(404);
      await get('/etudiants/me/candidature', tokens.sansCandidature).expect(
        404,
      );
      const { body } = await get(
        '/etudiants/me/inscriptions',
        tokens.sansProfil,
      ).expect(200);
      expect(body).toEqual([]);
    });

    it('le personnel garde ses routes sur /etudiants/:id', async () => {
      await get(`/etudiants/${etuA1.etudiant}`, tokens.scolarite).expect(200);
      await get(`/etudiants/${etuA1.etudiant}`, tokens.admin).expect(200);
    });
  });

  describe('enseignant', () => {
    it('GET /enseignants/me : chacun voit son propre profil', async () => {
      for (const mine of [ensA1, ensA2, ensB]) {
        const { body } = await get('/enseignants/me', mine.token).expect(200);
        expect(body.id).toBe(mine.enseignant);
        expect(body.userId).toBeUndefined();
      }
      const a1 = (await get('/enseignants/me', ensA1.token)).body;
      const a2 = (await get('/enseignants/me', ensA2.token)).body;
      expect(a1.id).not.toBe(a2.id);
      expect(a1.user.email).not.toBe(a2.user.email);
    });

    it('GET /enseignants/me/affectations : uniquement les siennes', async () => {
      const ids = async (e: Ens) =>
        (
          (await get('/enseignants/me/affectations', e.token).expect(200))
            .body as {
            id: string;
          }[]
        )
          .map((a) => a.id)
          .sort();
      expect(await ids(ensA1)).toEqual([...ensA1.affectations].sort());
      expect(await ids(ensA2)).toEqual([...ensA2.affectations].sort());
      expect(await ids(ensB)).toEqual([...ensB.affectations].sort());
      const { body } = await get('/enseignants/me/affectations', ensA2.token);
      expect(body[0].matiere.nom).toBeDefined();
      expect(body[0].anneeAcademique.libelle).toBeDefined();
      expect(body[0].enseignantId).toBeUndefined();
    });

    it('ignore tout identifiant fourni dans l’URL', async () => {
      const { body } = await get(
        `/enseignants/me?id=${ensA2.enseignant}&enseignantId=${ensA2.enseignant}`,
        ensA1.token,
      ).expect(200);
      expect(body.id).toBe(ensA1.enseignant);
      const aff = (
        await get(
          `/enseignants/me/affectations?enseignantId=${ensA2.enseignant}`,
          ensA1.token,
        ).expect(200)
      ).body as { id: string }[];
      expect(aff.map((a) => a.id).sort()).toEqual(
        [...ensA1.affectations].sort(),
      );
    });

    it('un enseignant ne peut pas lire d’autres enseignants par les routes du personnel', async () => {
      await get('/enseignants', ensA1.token).expect(403);
      await get(`/enseignants/${ensA2.enseignant}`, ensA1.token).expect(403);
      await get(
        `/enseignants/${ensA2.enseignant}/affectations`,
        ensA1.token,
      ).expect(403);
    });

    it('réservé au rôle ENSEIGNANT (403) et à un jeton valide (401)', async () => {
      for (const token of [tokens.admin, tokens.scolarite, etuA1.token]) {
        await get('/enseignants/me', token).expect(403);
        await get('/enseignants/me/affectations', token).expect(403);
      }
      await get('/enseignants/me').expect(401);
    });

    it('le personnel garde ses routes sur /enseignants/:id', async () => {
      await get(`/enseignants/${ensA1.enseignant}`, tokens.scolarite).expect(
        200,
      );
      await get(
        `/enseignants/${ensA1.enseignant}/affectations`,
        tokens.admin,
      ).expect(200);
    });
  });
});
