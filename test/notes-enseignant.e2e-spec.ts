import { INestApplication } from '@nestjs/common';
import { Role, StatutInscription } from '@prisma/client';
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

type Eleve = { inscription: string; etudiant: string };
type Prof = { token: string; enseignant: string; user: string };

describeWithTestDatabase('Notes : routes de l’enseignant (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const tenants: string[] = [];
  let counter = 0;
  let tenantA: string;
  const ref = {} as Record<
    'niveau' | 'autreNiveau' | 'annee' | 'autreAnnee' | 'm1' | 'm2' | 'mB',
    string
  >;
  let t1: Prof;
  let t2: Prof;
  let t3: Prof;
  let tb: Prof;
  const eleves = {} as Record<
    | 'valide1'
    | 'valide2'
    | 'attente'
    | 'suspendu'
    | 'autreNiveau'
    | 'autreAnnee'
    | 'voisinB',
    Eleve
  >;
  const tokens = {} as Record<'admin' | 'scolarite' | 'etudiant', string>;

  const call = (
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    token: string | undefined,
    url: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())[method](url);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  };
  const ME = '/enseignants/me';
  const evals = (m: string) => `${ME}/matieres/${m}/evaluations`;
  const ev = (id: string) => `${ME}/evaluations/${id}`;

  async function structure(tenantId: string, label: string) {
    const ecole = await prisma.ecole.create({
      data: { tenantId, nom: `École ${label}`, code: `E-${label}-${suffix}` },
    });
    const filiere = await prisma.filiere.create({
      data: { ecoleId: ecole.id, nom: 'ISM', code: `F-${label}`, cycle: 'BSC' },
    });
    const niveau = (code: string, ordre: number) =>
      prisma.niveau.create({
        data: { filiereId: filiere.id, nom: code, code, ordre },
      });
    const annee = (libelle: string, year: number) =>
      prisma.anneeAcademique.create({
        data: {
          tenantId,
          libelle: `${libelle}-${label}-${suffix}`,
          dateDebut: new Date(`${year}-09-01`),
          dateFin: new Date(`${year + 1}-07-31`),
        },
      });
    return { niveau, annee };
  }

  async function matiere(niveauId: string, anneeId: string, code: string) {
    return (
      await prisma.matiere.create({
        data: {
          niveauId,
          anneeAcademiqueId: anneeId,
          nom: `Matière ${code}`,
          code,
        },
      })
    ).id;
  }

  async function eleve(
    tenantId: string,
    niveauId: string,
    anneeId: string,
    statut: StatutInscription,
  ): Promise<Eleve> {
    const n = ++counter;
    const user = await createUser(
      prisma,
      tenantId,
      `eleve${n}-${suffix}@example.test`,
      'Password123',
      Role.ETUDIANT,
    );
    const etudiant = await prisma.etudiant.create({
      data: {
        userId: user.id,
        tenantId,
        matricule: `IUC-N-${suffix}-${n}`,
        dateNaissance: new Date('2005-01-15'),
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
      },
    });
    const inscription = await prisma.inscription.create({
      data: {
        etudiantId: etudiant.id,
        niveauId,
        anneeAcademiqueId: anneeId,
        statut,
        createdBy: user.id,
      },
    });
    return { inscription: inscription.id, etudiant: etudiant.id };
  }

  async function prof(tenantId: string, matieres: string[]): Promise<Prof> {
    const n = ++counter;
    const email = `prof${n}-${suffix}@example.test`;
    const user = await createUser(
      prisma,
      tenantId,
      email,
      'Password123',
      Role.ENSEIGNANT,
    );
    const enseignant = await prisma.enseignant.create({
      data: { userId: user.id, tenantId, type: 'PERMANENT' },
    });
    for (const matiereId of matieres) {
      const m = await prisma.matiere.findUniqueOrThrow({
        where: { id: matiereId },
      });
      await prisma.affectation.create({
        data: {
          enseignantId: enseignant.id,
          matiereId,
          anneeAcademiqueId: m.anneeAcademiqueId,
        },
      });
    }
    return {
      token: await login(app, email, 'Password123'),
      enseignant: enseignant.id,
      user: user.id,
    };
  }

  /** Crée une évaluation brouillon de l'enseignant sur une matière. */
  async function creer(
    p: Prof,
    matiereId: string,
    nom: string,
    extra: object = {},
  ) {
    const { body } = await call('post', p.token, evals(matiereId), {
      nom,
      type: 'DEVOIR',
      ...extra,
    }).expect(201);
    return body as { id: string; nom: string };
  }

  const ligne = (e: Eleve, valeur: number, extra: object = {}) => ({
    inscriptionId: e.inscription,
    valeur,
    ...extra,
  });
  const noterEn = (id: string, p: Prof, lignes: object[]) =>
    call('put', p.token, `${ev(id)}/notes`, { notes: lignes });

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    tenantA = (await createTenant(prisma, `${suffix}-a`)).id;
    const tenantB = (await createTenant(prisma, `${suffix}-b`)).id;
    tenants.push(tenantA, tenantB);

    const a = await structure(tenantA, 'a');
    ref.niveau = (await a.niveau('N1', 1)).id;
    ref.autreNiveau = (await a.niveau('N2', 2)).id;
    ref.annee = (await a.annee('A1', 2026)).id;
    ref.autreAnnee = (await a.annee('A2', 2027)).id;
    ref.m1 = await matiere(ref.niveau, ref.annee, 'M1');
    ref.m2 = await matiere(ref.niveau, ref.annee, 'M2');

    const { VALIDE, EN_ATTENTE, SUSPENDU } = StatutInscription;
    eleves.valide1 = await eleve(tenantA, ref.niveau, ref.annee, VALIDE);
    eleves.valide2 = await eleve(tenantA, ref.niveau, ref.annee, VALIDE);
    eleves.attente = await eleve(tenantA, ref.niveau, ref.annee, EN_ATTENTE);
    eleves.suspendu = await eleve(tenantA, ref.niveau, ref.annee, SUSPENDU);
    eleves.autreNiveau = await eleve(
      tenantA,
      ref.autreNiveau,
      ref.annee,
      VALIDE,
    );
    eleves.autreAnnee = await eleve(
      tenantA,
      ref.niveau,
      ref.autreAnnee,
      VALIDE,
    );

    t1 = await prof(tenantA, [ref.m1]);
    t2 = await prof(tenantA, [ref.m1]); // même matière que t1
    t3 = await prof(tenantA, [ref.m2]); // pas affecté à m1

    const b = await structure(tenantB, 'b');
    const niveauB = (await b.niveau('N1', 1)).id;
    const anneeB = (await b.annee('A1', 2026)).id;
    ref.mB = await matiere(niveauB, anneeB, 'MB');
    eleves.voisinB = await eleve(tenantB, niveauB, anneeB, VALIDE);
    tb = await prof(tenantB, [ref.mB]);

    for (const [key, role] of [
      ['admin', Role.ADMIN],
      ['scolarite', Role.SCOLARITE],
      ['etudiant', Role.ETUDIANT],
    ] as const) {
      const email = `${key}-${suffix}@example.test`;
      await createUser(prisma, tenantA, email, 'Password123', role);
      tokens[key] = await login(app, email, 'Password123');
    }
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

  describe('accès et rôles', () => {
    it('réservé à l’ENSEIGNANT : 403 pour les autres rôles, 401 sans jeton', async () => {
      for (const token of [tokens.admin, tokens.scolarite, tokens.etudiant]) {
        await call('get', token, evals(ref.m1)).expect(403);
        await call('post', token, evals(ref.m1), {
          nom: 'X',
          type: 'DEVOIR',
        }).expect(403);
        await call('get', token, `${ev('x')}/notes`).expect(403);
        await call('post', token, `${ev('x')}/publier`).expect(403);
      }
      await call('get', undefined, evals(ref.m1)).expect(401);
    });
  });

  describe('évaluations', () => {
    it('crée un brouillon avec coefficient 1 et barème 20 par défaut', async () => {
      const { body } = await call('post', t1.token, evals(ref.m1), {
        nom: '  Devoir par défaut  ',
        type: 'DEVOIR',
      }).expect(201);
      expect(body).toMatchObject({
        nom: 'Devoir par défaut',
        statut: 'BROUILLON',
        coefficient: 1,
        bareme: 20,
        matiereId: ref.m1,
      });
      expect(body.creePar).toBeUndefined();
    });

    it('refuse (400) les données invalides', async () => {
      const mauvais = [
        { nom: '', type: 'DEVOIR' },
        { nom: 'X', type: 'INCONNU' },
        { nom: 'X', type: 'DEVOIR', coefficient: 0 },
        { nom: 'X', type: 'DEVOIR', bareme: 1000 },
        { nom: 'X', type: 'DEVOIR', coefficient: 1.234 },
        { nom: 'X', type: 'DEVOIR', creePar: 'autre' },
      ];
      for (const body of mauvais) {
        await call('post', t1.token, evals(ref.m1), body).expect(400);
      }
    });

    it('refuse (409, message clair) un nom déjà utilisé pour la matière', async () => {
      await creer(t1, ref.m1, 'Nom unique');
      const doublon = await call('post', t1.token, evals(ref.m1), {
        nom: 'Nom unique',
        type: 'TP',
      }).expect(409);
      expect(doublon.body.message).toBe(
        'Une évaluation « Nom unique » existe déjà pour cette matière',
      );
    });

    it('modifie un brouillon, refuse un PATCH vide et un barème inférieur à une note', async () => {
      const e = await creer(t1, ref.m1, 'À modifier', { bareme: 20 });
      const modifiee = await call('patch', t1.token, ev(e.id), {
        nom: 'Modifiée',
        coefficient: 2.5,
        type: 'EXAMEN',
      }).expect(200);
      expect(modifiee.body).toMatchObject({
        nom: 'Modifiée',
        coefficient: 2.5,
        type: 'EXAMEN',
      });
      await call('patch', t1.token, ev(e.id), {}).expect(400);

      await noterEn(e.id, t1, [ligne(eleves.valide1, 15)]).expect(200);
      await call('patch', t1.token, ev(e.id), { bareme: 10 }).expect(409);
      await call('patch', t1.token, ev(e.id), { bareme: 15 }).expect(200);
    });

    it('supprime un brouillon avec ses notes', async () => {
      const e = await creer(t1, ref.m1, 'À supprimer');
      await noterEn(e.id, t1, [ligne(eleves.valide1, 10)]).expect(200);
      await call('delete', t1.token, ev(e.id)).expect(200);
      expect(await prisma.evaluation.count({ where: { id: e.id } })).toBe(0);
      expect(await prisma.note.count({ where: { evaluationId: e.id } })).toBe(
        0,
      );
      await call('get', t1.token, `${ev(e.id)}/notes`).expect(404);
    });
  });

  describe('isolation entre deux enseignants d’un même établissement', () => {
    let e1: { id: string; nom: string };

    beforeAll(async () => {
      e1 = await creer(t1, ref.m1, 'Évaluation de t1', { bareme: 20 });
      await noterEn(e1.id, t1, [
        ligne(eleves.valide1, 12),
        ligne(eleves.valide2, 14),
      ]).expect(200);
    });

    it('t2 (affecté à la même matière) ne voit pas les évaluations de t1', async () => {
      const mienne = await creer(t2, ref.m1, 'Évaluation de t2');
      const liste = (await call('get', t2.token, evals(ref.m1)).expect(200))
        .body as { id: string }[];
      expect(liste.map((x) => x.id)).toContain(mienne.id);
      expect(liste.map((x) => x.id)).not.toContain(e1.id);
      const listeT1 = (await call('get', t1.token, evals(ref.m1)).expect(200))
        .body as { id: string }[];
      expect(listeT1.map((x) => x.id)).toContain(e1.id);
      expect(listeT1.map((x) => x.id)).not.toContain(mienne.id);
    });

    it('t2 ne peut ni lire, ni modifier, ni supprimer, ni noter, ni publier celle de t1 (404, sans effet)', async () => {
      const avant = await prisma.evaluation.findUniqueOrThrow({
        where: { id: e1.id },
      });
      await call('get', t2.token, `${ev(e1.id)}/notes`).expect(404);
      await call('patch', t2.token, ev(e1.id), { nom: 'Piratée' }).expect(404);
      await noterEn(e1.id, t2, [ligne(eleves.valide1, 0)]).expect(404);
      await call('post', t2.token, `${ev(e1.id)}/publier`).expect(404);
      await call('delete', t2.token, ev(e1.id)).expect(404);

      const apres = await prisma.evaluation.findUniqueOrThrow({
        where: { id: e1.id },
      });
      expect(apres.nom).toBe(avant.nom);
      expect(apres.statut).toBe('BROUILLON');
      const notes = await prisma.note.findMany({
        where: { evaluationId: e1.id },
      });
      expect(notes.map((n) => n.valeur?.toNumber()).sort()).toEqual([12, 14]);
    });

    it('un paramètre d’URL ne change pas le périmètre (creePar, enseignantId)', async () => {
      const liste = (
        await call(
          'get',
          t2.token,
          `${evals(ref.m1)}?creePar=${t1.user}&enseignantId=${t1.enseignant}`,
        ).expect(200)
      ).body as { id: string }[];
      expect(liste.map((x) => x.id)).not.toContain(e1.id);
    });

    it('un enseignant non affecté à la matière ne peut ni lister ni créer (404)', async () => {
      await call('get', t3.token, evals(ref.m1)).expect(404);
      await call('post', t3.token, evals(ref.m1), {
        nom: 'X',
        type: 'DEVOIR',
      }).expect(404);
    });

    it('un nom pris par un collègue de la matière est refusé (409) sans révéler son contenu', async () => {
      const r = await call('post', t2.token, evals(ref.m1), {
        nom: e1.nom,
        type: 'DEVOIR',
      }).expect(409);
      expect(JSON.stringify(r.body)).not.toContain(t1.user);
    });

    it('perdre son affectation retire l’accès à ses évaluations', async () => {
      const e = await creer(t2, ref.m1, 'Avant désaffectation');
      await call('get', t2.token, `${ev(e.id)}/notes`).expect(200);
      await prisma.affectation.deleteMany({
        where: { enseignantId: t2.enseignant, matiereId: ref.m1 },
      });
      await call('get', t2.token, `${ev(e.id)}/notes`).expect(404);
      await call('get', t2.token, evals(ref.m1)).expect(404);
      await prisma.affectation.create({
        data: {
          enseignantId: t2.enseignant,
          matiereId: ref.m1,
          anneeAcademiqueId: ref.annee,
        },
      });
    });
  });

  describe('isolation par établissement', () => {
    let e1: { id: string };
    let eB: { id: string };

    beforeAll(async () => {
      e1 = await creer(t1, ref.m1, 'Évaluation établissement A');
      await noterEn(e1.id, t1, [ligne(eleves.valide1, 11)]).expect(200);
      eB = await creer(tb, ref.mB, 'Évaluation établissement B');
    });

    it('un enseignant d’un autre établissement reçoit 404 partout', async () => {
      await call('get', tb.token, evals(ref.m1)).expect(404);
      await call('post', tb.token, evals(ref.m1), {
        nom: 'X',
        type: 'DEVOIR',
      }).expect(404);
      await call('get', tb.token, `${ev(e1.id)}/notes`).expect(404);
      await call('patch', tb.token, ev(e1.id), { nom: 'X' }).expect(404);
      await noterEn(e1.id, tb, [ligne(eleves.valide1, 0)]).expect(404);
      await call('post', tb.token, `${ev(e1.id)}/publier`).expect(404);
      await call('delete', tb.token, ev(e1.id)).expect(404);
      expect(await prisma.evaluation.count({ where: { id: e1.id } })).toBe(1);
    });

    it('une inscription d’un autre établissement donne 404 et rien n’est enregistré', async () => {
      await noterEn(eB.id, tb, [ligne(eleves.valide1, 10)]).expect(404);
      await noterEn(e1.id, t1, [
        ligne(eleves.valide2, 10),
        ligne(eleves.voisinB, 10),
      ]).expect(404);
      expect(
        await prisma.note.count({
          where: { inscriptionId: eleves.voisinB.inscription },
        }),
      ).toBe(0);
      expect(
        await prisma.note.count({
          where: {
            evaluationId: e1.id,
            inscriptionId: eleves.valide2.inscription,
          },
        }),
      ).toBe(0);
    });

    it('une inscription inexistante donne le même 404', async () => {
      await noterEn(e1.id, t1, [
        { inscriptionId: '00000000-0000-4000-8000-000000000000', valeur: 10 },
      ]).expect(404);
    });
  });

  describe('grille et saisie', () => {
    let e: { id: string };

    beforeAll(async () => {
      e = await creer(t1, ref.m1, 'Grille', { bareme: 20 });
    });

    it('la grille ne contient que les inscrits VALIDE du niveau et de l’année de la matière', async () => {
      const { body } = await call('get', t1.token, `${ev(e.id)}/notes`).expect(
        200,
      );
      const inscriptions = body.notes
        .map((n: { inscriptionId: string }) => n.inscriptionId)
        .sort();
      expect(inscriptions).toEqual(
        [eleves.valide1.inscription, eleves.valide2.inscription].sort(),
      );
      expect(body.notes[0].note).toBeNull();
      expect(body.notes[0].etudiant).toEqual(
        expect.objectContaining({
          matricule: expect.any(String),
          nom: expect.any(String),
        }),
      );
      expect(JSON.stringify(body)).not.toContain('@example.test');
    });

    it.each(['attente', 'suspendu', 'autreNiveau', 'autreAnnee'] as const)(
      'refuse de noter un inscrit non notable (%s) : 400, rien d’enregistré, même pour les autres lignes',
      async (cle) => {
        const r = await noterEn(e.id, t1, [
          ligne(eleves.valide1, 10),
          ligne(eleves[cle], 10),
        ]).expect(400);
        expect(r.body.erreurs).toEqual([
          expect.objectContaining({
            inscriptionId: eleves[cle].inscription,
            code: 'NON_NOTABLE',
          }),
        ]);
        expect(await prisma.note.count({ where: { evaluationId: e.id } })).toBe(
          0,
        );
      },
    );

    it('contrôle chaque ligne (valeur, état) et n’enregistre rien si une seule est invalide', async () => {
      const r = await noterEn(e.id, t1, [
        ligne(eleves.valide1, 25),
        { inscriptionId: eleves.valide2.inscription, etat: 'NOTEE' },
      ]).expect(400);
      expect(r.body.erreurs.map((x: { code: string }) => x.code)).toEqual([
        'VALEUR_INVALIDE',
        'VALEUR_INVALIDE',
      ]);
      const absentAvecNote = await noterEn(e.id, t1, [
        ligne(eleves.valide1, 10, { etat: 'ABSENT' }),
      ]).expect(400);
      expect(absentAvecNote.body.erreurs[0].code).toBe('VALEUR_INVALIDE');
      expect(await prisma.note.count({ where: { evaluationId: e.id } })).toBe(
        0,
      );
    });

    it('refuse (400) les lignes mal formées : doublon, 3 décimales, négatif, lot vide ou trop grand', async () => {
      const l = ligne(eleves.valide1, 10);
      await noterEn(e.id, t1, [l, l]).expect(400);
      await noterEn(e.id, t1, [ligne(eleves.valide1, 10.123)]).expect(400);
      await noterEn(e.id, t1, [ligne(eleves.valide1, -1)]).expect(400);
      await noterEn(e.id, t1, []).expect(400);
      await noterEn(
        e.id,
        t1,
        Array.from({ length: 501 }, () => ligne(eleves.valide1, 10)),
      ).expect(400);
    });

    it('enregistre en lot, ABSENT et DISPENSE sans valeur, puis renvoie les jetons updatedAt', async () => {
      const r = await noterEn(e.id, t1, [
        ligne(eleves.valide1, 13.5, { commentaire: 'Bien' }),
        { inscriptionId: eleves.valide2.inscription, etat: 'ABSENT' },
      ]).expect(200);
      expect(r.body.enregistrees).toBe(2);
      const parInscription = Object.fromEntries(
        r.body.notes.map((n: { inscriptionId: string }) => [
          n.inscriptionId,
          n,
        ]),
      );
      expect(parInscription[eleves.valide1.inscription]).toMatchObject({
        valeur: 13.5,
        etat: 'NOTEE',
        commentaire: 'Bien',
      });
      expect(parInscription[eleves.valide2.inscription]).toMatchObject({
        valeur: null,
        etat: 'ABSENT',
      });
      const grille = (
        await call('get', t1.token, `${ev(e.id)}/notes`).expect(200)
      ).body;
      const ligne1 = grille.notes.find(
        (n: { inscriptionId: string }) =>
          n.inscriptionId === eleves.valide1.inscription,
      );
      expect(ligne1.note.valeur).toBe(13.5);
      expect(ligne1.note.updatedAt).toBe(
        parInscription[eleves.valide1.inscription].updatedAt,
      );
    });
  });

  describe('concurrence sur la saisie en lot', () => {
    let e: { id: string };
    let jetons: Record<string, string>;

    beforeEach(async () => {
      e = await creer(t1, ref.m1, `Concurrence ${++counter}`);
      const r = await noterEn(e.id, t1, [
        ligne(eleves.valide1, 10),
        ligne(eleves.valide2, 10),
      ]).expect(200);
      jetons = Object.fromEntries(
        r.body.notes.map((n: { inscriptionId: string; updatedAt: string }) => [
          n.inscriptionId,
          n.updatedAt,
        ]),
      );
    });

    const valeurs = async () =>
      Object.fromEntries(
        (await prisma.note.findMany({ where: { evaluationId: e.id } })).map(
          (n) => [n.inscriptionId, n.valeur?.toNumber()],
        ),
      );

    it('un updatedAt périmé donne un 409 explicite par ligne, sans rien enregistrer', async () => {
      // Une autre saisie passe avant : les jetons lus sont périmés
      await noterEn(e.id, t1, [
        ligne(eleves.valide1, 15, {
          updatedAt: jetons[eleves.valide1.inscription],
        }),
      ]).expect(200);

      const r = await noterEn(e.id, t1, [
        ligne(eleves.valide1, 5, {
          updatedAt: jetons[eleves.valide1.inscription],
        }),
        ligne(eleves.valide2, 6, {
          updatedAt: jetons[eleves.valide2.inscription],
        }),
      ]).expect(409);
      expect(r.body.erreurs).toEqual([
        expect.objectContaining({
          inscriptionId: eleves.valide1.inscription,
          code: 'CONFLIT',
        }),
      ]);
      expect(r.body.message).toContain('aucune note enregistrée');
      // Tout ou rien : la ligne valide2 n'a pas été écrite non plus
      expect(await valeurs()).toEqual({
        [eleves.valide1.inscription]: 15,
        [eleves.valide2.inscription]: 10,
      });
    });

    it('modifier une note existante sans updatedAt est un conflit', async () => {
      const r = await noterEn(e.id, t1, [ligne(eleves.valide1, 5)]).expect(409);
      expect(r.body.erreurs[0].code).toBe('CONFLIT');
      expect((await valeurs())[eleves.valide1.inscription]).toBe(10);
    });

    it('fournir un updatedAt pour une note inexistante est un conflit', async () => {
      const neuve = await creer(t1, ref.m1, `Sans note ${++counter}`);
      const r = await noterEn(neuve.id, t1, [
        ligne(eleves.valide1, 5, { updatedAt: '2026-01-01T00:00:00.000Z' }),
      ]).expect(409);
      expect(r.body.erreurs[0].code).toBe('CONFLIT');
    });

    it('deux saisies simultanées depuis la même lecture : une seule réussit, l’autre reçoit un 409 clair', async () => {
      const lignes = (valeur: number) => [
        ligne(eleves.valide1, valeur, {
          updatedAt: jetons[eleves.valide1.inscription],
        }),
        ligne(eleves.valide2, valeur, {
          updatedAt: jetons[eleves.valide2.inscription],
        }),
      ];
      const [r1, r2] = await Promise.all([
        noterEn(e.id, t1, lignes(16)),
        noterEn(e.id, t1, lignes(17)),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      const perdante = r1.status === 409 ? r1 : r2;
      const gagnante = r1.status === 200 ? 16 : 17;
      expect(typeof perdante.body.message).toBe('string');
      expect(perdante.body.statusCode).toBe(409);
      expect(JSON.stringify(perdante.body)).not.toMatch(/prisma|P20\d\d/i);
      // La saisie gagnante est enregistrée en entier, jamais mélangée à l'autre
      expect(await valeurs()).toEqual({
        [eleves.valide1.inscription]: gagnante,
        [eleves.valide2.inscription]: gagnante,
      });
    });

    it('deux premières saisies simultanées d’une même note : une seule réussit, l’autre un 409 clair', async () => {
      const neuve = await creer(t1, ref.m1, `Première saisie ${++counter}`);
      const [r1, r2] = await Promise.all([
        noterEn(neuve.id, t1, [ligne(eleves.valide1, 8)]),
        noterEn(neuve.id, t1, [ligne(eleves.valide1, 9)]),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      expect(JSON.stringify([r1.body, r2.body])).not.toMatch(/prisma|P20\d\d/i);
      expect(
        await prisma.note.count({ where: { evaluationId: neuve.id } }),
      ).toBe(1);
    });
  });

  describe('publication et verrouillage', () => {
    let e: { id: string };

    beforeAll(async () => {
      e = await creer(t1, ref.m1, 'À publier');
    });

    it('refuse (409) de publier une évaluation sans note', async () => {
      const r = await call('post', t1.token, `${ev(e.id)}/publier`).expect(409);
      expect(r.body.message).toContain('rien à publier');
    });

    it('publie, puis verrouille toute modification par l’enseignant', async () => {
      await noterEn(e.id, t1, [ligne(eleves.valide1, 12)]).expect(200);
      const publiee = await call(
        'post',
        t1.token,
        `${ev(e.id)}/publier`,
      ).expect(200);
      expect(publiee.body).toMatchObject({ statut: 'PUBLIEE' });
      expect(publiee.body.publieLe).toEqual(expect.any(String));
      const base = await prisma.evaluation.findUniqueOrThrow({
        where: { id: e.id },
      });
      expect(base).toMatchObject({ statut: 'PUBLIEE', publiePar: t1.user });

      const jeton = (
        await prisma.note.findFirstOrThrow({ where: { evaluationId: e.id } })
      ).updatedAt.toISOString();
      for (const r of [
        await call('patch', t1.token, ev(e.id), { nom: 'Changée' }).expect(409),
        await call('delete', t1.token, ev(e.id)).expect(409),
        await noterEn(e.id, t1, [
          ligne(eleves.valide1, 19, { updatedAt: jeton }),
        ]).expect(409),
        await noterEn(e.id, t1, [ligne(eleves.valide2, 19)]).expect(409),
        await call('post', t1.token, `${ev(e.id)}/publier`).expect(409),
      ]) {
        expect(r.body.message).toContain('publiée');
      }

      // Rien n'a bougé
      const apres = await prisma.evaluation.findUniqueOrThrow({
        where: { id: e.id },
      });
      expect(apres.nom).toBe('À publier');
      const notes = await prisma.note.findMany({
        where: { evaluationId: e.id },
      });
      expect(notes.map((n) => n.valeur?.toNumber())).toEqual([12]);
    });

    it('la lecture de la grille reste possible après publication', async () => {
      const { body } = await call('get', t1.token, `${ev(e.id)}/notes`).expect(
        200,
      );
      expect(body.evaluation.statut).toBe('PUBLIEE');
      expect(
        body.notes.find(
          (n: { inscriptionId: string }) =>
            n.inscriptionId === eleves.valide1.inscription,
        ).note.valeur,
      ).toBe(12);
    });

    it('t2 ne peut pas publier l’évaluation d’un collègue (404) et la publication de t1 n’est pas la sienne', async () => {
      const autre = await creer(t1, ref.m1, 'Publication isolée');
      await noterEn(autre.id, t1, [ligne(eleves.valide1, 9)]).expect(200);
      await call('post', t2.token, `${ev(autre.id)}/publier`).expect(404);
      expect(
        (await prisma.evaluation.findUniqueOrThrow({ where: { id: autre.id } }))
          .statut,
      ).toBe('BROUILLON');
    });

    it('deux publications simultanées : une seule réussit', async () => {
      const course = await creer(t1, ref.m1, `Course publication ${++counter}`);
      await noterEn(course.id, t1, [ligne(eleves.valide1, 9)]).expect(200);
      const [r1, r2] = await Promise.all([
        call('post', t1.token, `${ev(course.id)}/publier`),
        call('post', t1.token, `${ev(course.id)}/publier`),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    });
  });
});
