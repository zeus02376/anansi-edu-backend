import { INestApplication } from '@nestjs/common';
import { Role, StatutCandidature } from '@prisma/client';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  cleanupTenant,
  createE2eApp,
  createTenant,
  describeWithTestDatabase,
  uniqueSuffix,
} from './e2e-helpers';
import {
  appel,
  Compte,
  creerCompte,
  creerEleve,
  creerStructure,
  Fixtures,
  suivant,
} from './notes-fixtures';

describeWithTestDatabase('Matricule IUC des étudiants (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  const suffix = uniqueSuffix();
  const tenants: string[] = [];
  let tenantA: string;
  let scolarite: Compte;
  let admin: Compte;
  let adminB: Compte;
  let prof: Compte;
  let eleveCompte: Compte;
  let filiere: string;
  let annee: string;

  const FORMAT = 'format IUC';
  /** Un matricule valide, unique pour ce test. */
  const matricule = () =>
    `IUC26E${String(suivant() % 10_000_000).padStart(7, '0')}`;

  async function candidatureAcceptee() {
    const n = suivant();
    return (
      await prisma.candidature.create({
        data: {
          tenantId: tenantA,
          nom: 'Cand',
          prenom: `C${n}`,
          email: `cand${n}-${suffix}@example.test`,
          dateNaissance: new Date('2005-01-15'),
          lieuNaissance: 'Douala',
          nationalite: 'Camerounaise',
          filiereId: filiere,
          anneeAcademiqueId: annee,
          numeroDossier: `MAT-${suffix}-${n}`,
          statut: StatutCandidature.ACCEPTE,
        },
      })
    ).id;
  }
  const creer = async (extra: object = {}, status = 201) => {
    const candidatureId = await candidatureAcceptee();
    return appel(app, 'post', scolarite.token, '/etudiants', {
      candidatureId,
      ...extra,
    }).expect(status);
  };
  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    fx = { app, prisma, suffix };
    tenantA = (await createTenant(prisma, `${suffix}-a`)).id;
    const tenantB = (await createTenant(prisma, `${suffix}-b`)).id;
    tenants.push(tenantA, tenantB);
    const a = await creerStructure(fx, tenantA, 'a');
    annee = await a.annee('A1', 2026);
    const ecole = await prisma.ecole.findFirstOrThrow({
      where: { tenantId: tenantA },
    });
    filiere = (
      await prisma.filiere.findFirstOrThrow({ where: { ecoleId: ecole.id } })
    ).id;
    scolarite = await creerCompte(fx, tenantA, Role.SCOLARITE);
    admin = await creerCompte(fx, tenantA, Role.ADMIN);
    prof = await creerCompte(fx, tenantA, Role.ENSEIGNANT);
    eleveCompte = await creerCompte(fx, tenantA, Role.ETUDIANT);
    adminB = await creerCompte(fx, await tenantB, Role.ADMIN);
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

  describe('création (POST /etudiants)', () => {
    it('reste facultatif : sans matricule IUC, il vaut null et le matricule interne est toujours généré', async () => {
      const r = await creer({}, 201);
      expect(r.body.matriculeIuc).toBeNull();
      expect(r.body.matricule).toMatch(/^IUC-\d{4}-\d{5}$/);
    });

    it('accepte un matricule IUC conforme et le conserve tel quel, sans toucher au matricule interne', async () => {
      const valeur = matricule();
      const r = await creer({ matriculeIuc: `  ${valeur}  ` }, 201);
      expect(r.body.matriculeIuc).toBe(valeur);
      expect(r.body.matricule).toMatch(/^IUC-\d{4}-\d{5}$/);
      const base = await prisma.etudiant.findUniqueOrThrow({
        where: { id: r.body.id },
      });
      expect(base.matriculeIuc).toBe(valeur);
    });

    it.each([
      'iuc26E1234567', // minuscules
      'IUC26e1234567',
      'IUC2E1234567', // année sur 1 chiffre
      'IUC26E123456', // 6 chiffres
      'IUC26E12345678', // 8 chiffres
      'IUC26X1234567', // mauvaise lettre
      'IUC-26-E1234567',
      'IUC26E12345A7',
      'XIUC26E1234567',
      'IUC26E1234567 suite',
      '',
    ])(
      'rejette (400, message clair) le format invalide « %s », sans créer d’étudiant',
      async (invalide) => {
        const avant = await prisma.etudiant.count({
          where: { tenantId: tenantA },
        });
        const r = await creer({ matriculeIuc: invalide }, 400);
        expect(JSON.stringify(r.body.message)).toContain(FORMAT);
        expect(
          await prisma.etudiant.count({ where: { tenantId: tenantA } }),
        ).toBe(avant);
      },
    );

    it('rejette (409, message clair) un matricule IUC déjà attribué, sans créer ni compte orphelin', async () => {
      const valeur = matricule();
      await creer({ matriculeIuc: valeur }, 201);
      const avant = await prisma.user.count({ where: { tenantId: tenantA } });
      const r = await creer({ matriculeIuc: valeur }, 409);
      expect(r.body.message).toBe(
        'Ce matricule IUC est déjà attribué à un autre étudiant',
      );
      expect(await prisma.user.count({ where: { tenantId: tenantA } })).toBe(
        avant,
      );
    });

    it('deux créations simultanées avec le même matricule : une seule réussit, l’autre un 409 clair', async () => {
      const valeur = matricule();
      const [c1, c2] = [
        await candidatureAcceptee(),
        await candidatureAcceptee(),
      ];
      const post = (candidatureId: string) =>
        appel(app, 'post', scolarite.token, '/etudiants', {
          candidatureId,
          matriculeIuc: valeur,
        });
      const [r1, r2] = await Promise.all([post(c1), post(c2)]);
      expect([r1.status, r2.status].sort()).toEqual([201, 409]);
      expect(JSON.stringify([r1.body, r2.body])).not.toMatch(/prisma|P20\d\d/i);
      expect(
        await prisma.etudiant.count({ where: { matriculeIuc: valeur } }),
      ).toBe(1);
    });

    it('plusieurs étudiants sans matricule IUC coexistent (unique seulement si non nul)', async () => {
      await creer({}, 201);
      await creer({}, 201);
      expect(
        await prisma.etudiant.count({
          where: { tenantId: tenantA, matriculeIuc: null },
        }),
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe('modification (PATCH /etudiants/:id)', () => {
    it('définit, modifie puis efface le matricule IUC', async () => {
      const e = await creerEleve(fx, tenantA, await creerNiveau(), annee);
      const v1 = matricule();
      const v2 = matricule();
      let r = await appel(
        app,
        'patch',
        scolarite.token,
        `/etudiants/${e.etudiant}`,
        { matriculeIuc: v1 },
      ).expect(200);
      expect(r.body.matriculeIuc).toBe(v1);
      r = await appel(app, 'patch', admin.token, `/etudiants/${e.etudiant}`, {
        matriculeIuc: v2,
      }).expect(200);
      expect(r.body.matriculeIuc).toBe(v2);
      // Le remettre à l'identique n'est pas un doublon de lui-même
      await appel(app, 'patch', scolarite.token, `/etudiants/${e.etudiant}`, {
        matriculeIuc: v2,
      }).expect(200);
      r = await appel(
        app,
        'patch',
        scolarite.token,
        `/etudiants/${e.etudiant}`,
        { matriculeIuc: null },
      ).expect(200);
      expect(r.body.matriculeIuc).toBeNull();
      expect(r.body.user).toEqual(
        expect.objectContaining({ nom: expect.any(String) }),
      );
    });

    it('rejette un format invalide (400), un corps vide (400) et un doublon (409), sans rien modifier', async () => {
      const [a, b] = [
        await creerEleve(fx, tenantA, await creerNiveau(), annee),
        await creerEleve(fx, tenantA, await creerNiveau(), annee),
      ];
      const pris = matricule();
      await appel(app, 'patch', scolarite.token, `/etudiants/${a.etudiant}`, {
        matriculeIuc: pris,
      }).expect(200);

      const invalide = await appel(
        app,
        'patch',
        scolarite.token,
        `/etudiants/${b.etudiant}`,
        {
          matriculeIuc: 'IUC26E12',
        },
      ).expect(400);
      expect(JSON.stringify(invalide.body.message)).toContain(FORMAT);
      await appel(
        app,
        'patch',
        scolarite.token,
        `/etudiants/${b.etudiant}`,
        {},
      ).expect(400);
      const doublon = await appel(
        app,
        'patch',
        scolarite.token,
        `/etudiants/${b.etudiant}`,
        {
          matriculeIuc: pris,
        },
      ).expect(409);
      expect(doublon.body.message).toBe(
        'Ce matricule IUC est déjà attribué à un autre étudiant',
      );
      await appel(app, 'patch', scolarite.token, `/etudiants/${b.etudiant}`, {
        matriculeIuc: pris,
        nom: 'Autre',
      }).expect(400); // seul le matricule IUC est modifiable

      expect(
        (await prisma.etudiant.findUniqueOrThrow({ where: { id: b.etudiant } }))
          .matriculeIuc,
      ).toBeNull();
      expect(
        (await prisma.etudiant.findUniqueOrThrow({ where: { id: a.etudiant } }))
          .matriculeIuc,
      ).toBe(pris);
    });

    it('isolation par établissement (404) et rôles (403 / 401)', async () => {
      const e = await creerEleve(fx, tenantA, await creerNiveau(), annee);
      await appel(app, 'patch', adminB.token, `/etudiants/${e.etudiant}`, {
        matriculeIuc: matricule(),
      }).expect(404);
      expect(
        (await prisma.etudiant.findUniqueOrThrow({ where: { id: e.etudiant } }))
          .matriculeIuc,
      ).toBeNull();
      for (const compte of [prof, eleveCompte]) {
        await appel(app, 'patch', compte.token, `/etudiants/${e.etudiant}`, {
          matriculeIuc: matricule(),
        }).expect(403);
      }
      await appel(app, 'patch', undefined, `/etudiants/${e.etudiant}`, {
        matriculeIuc: matricule(),
      }).expect(401);
    });
  });

  describe('affichage', () => {
    it('apparaît dans la liste, le détail et le profil « moi » de l’étudiant', async () => {
      const valeur = matricule();
      const cree = (await creer({ matriculeIuc: valeur }, 201)).body;
      const liste = (
        await appel(app, 'get', scolarite.token, '/etudiants').expect(200)
      ).body;
      expect(
        liste.find((x: { id: string }) => x.id === cree.id).matriculeIuc,
      ).toBe(valeur);
      const detail = (
        await appel(
          app,
          'get',
          scolarite.token,
          `/etudiants/${cree.id}`,
        ).expect(200)
      ).body;
      expect(detail.matriculeIuc).toBe(valeur);

      // Profil « moi » : compte étudiant lié à l'étudiant créé
      const compte = await prisma.etudiant.findUniqueOrThrow({
        where: { id: cree.id },
        include: { user: true },
      });
      const { login } = await import('./e2e-helpers');
      const jeton = await login(
        app,
        compte.user.email,
        cree.motDePasseTemporaire,
      );
      // Mot de passe provisoire : changement obligatoire avant d'utiliser les autres routes
      await appel(app, 'patch', jeton, '/auth/change-password', {
        motDePasseActuel: cree.motDePasseTemporaire,
        nouveauMotDePasse: 'Definitif123',
      }).expect(200);
      const moi = (await appel(app, 'get', jeton, '/etudiants/me').expect(200))
        .body;
      expect(moi.matriculeIuc).toBe(valeur);
    });
  });

  async function creerNiveau() {
    const filiereRow = await prisma.filiere.findUniqueOrThrow({
      where: { id: filiere },
    });
    const n = suivant();
    return (
      await prisma.niveau.create({
        data: {
          filiereId: filiereRow.id,
          nom: `N${n}`,
          code: `N${n}`,
          ordre: n,
        },
      })
    ).id;
  }
});
