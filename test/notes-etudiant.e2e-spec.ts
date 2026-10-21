import { INestApplication } from '@nestjs/common';
import {
  EtatNote,
  Role,
  StatutEvaluation,
  TypeEvaluation,
} from '@prisma/client';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  cleanupTenant,
  createE2eApp,
  createTenant,
  describeWithTestDatabase,
  login,
  uniqueSuffix,
} from './e2e-helpers';
import {
  appel,
  Compte,
  creerCompte,
  creerEleve,
  creerMatiere,
  creerStructure,
  Eleve,
  Fixtures,
} from './notes-fixtures';

type Json = any;

describeWithTestDatabase('Notes : consultation par l’étudiant (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  const suffix = uniqueSuffix();
  const tenants: string[] = [];
  let tenantA: string;
  let annee1: string;
  let annee2: string;
  let anneeVide: string;
  let anneeB: string;
  let s1: Eleve;
  let s2: Eleve;
  let sB: Eleve;
  let t1: string; // jetons des comptes étudiants
  let t2: string;
  let tB: string;
  let scolarite: Compte;
  let adminB: Compte;
  let prof: Compte;
  const m = {} as Record<'M1' | 'M2' | 'M3' | 'M5' | 'MB', string>;

  const mesNotes = (token: string | undefined, query = '') =>
    appel(app, 'get', token, `/etudiants/me/notes${query}`);
  const releve = (etudiant: string, query = '') =>
    appel(app, 'get', scolarite.token, `/etudiants/${etudiant}/releve${query}`);

  async function evaluation(
    matiereId: string,
    nom: string,
    options: {
      coefficient: number;
      bareme: number;
      statut?: StatutEvaluation;
      notes: [Eleve, EtatNote, number | null, string?][];
    },
  ) {
    const e = await prisma.evaluation.create({
      data: {
        matiereId,
        nom,
        type: TypeEvaluation.DEVOIR,
        coefficient: options.coefficient,
        bareme: options.bareme,
        statut: options.statut ?? StatutEvaluation.PUBLIEE,
        creePar: 'seed',
        publiePar: 'seed',
      },
    });
    for (const [eleve, etat, valeur, commentaire] of options.notes) {
      await prisma.note.create({
        data: {
          evaluationId: e.id,
          inscriptionId: eleve.inscription,
          etat,
          valeur,
          commentaire: commentaire ?? null,
          saisiePar: 'seed',
        },
      });
    }
    return e.id;
  }

  /** Toutes les clés d'un document JSON, à tous les niveaux. */
  const cles = (valeur: unknown, trouvees = new Set<string>()): Set<string> => {
    if (Array.isArray(valeur)) valeur.forEach((v) => cles(v, trouvees));
    else if (valeur && typeof valeur === 'object') {
      for (const [k, v] of Object.entries(valeur)) {
        trouvees.add(k);
        cles(v, trouvees);
      }
    }
    return trouvees;
  };
  const matiere = (body: Json, annee: string, code: string) =>
    body.annees
      .find((x: Json) => x.annee.id === annee)
      .matieres.find((x: Json) => x.code === code);

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    fx = { app, prisma, suffix };
    tenantA = (await createTenant(prisma, `${suffix}-a`)).id;
    const tenantB = (await createTenant(prisma, `${suffix}-b`)).id;
    tenants.push(tenantA, tenantB);

    const a = await creerStructure(fx, tenantA, 'a');
    const niveau1 = await a.niveau('N1', 1);
    const niveau2 = await a.niveau('N2', 2);
    annee1 = await a.annee('A1', 2026);
    annee2 = await a.annee('A2', 2027);
    anneeVide = await a.annee('A3', 2028);
    m.M1 = await creerMatiere(fx, niveau1, annee1, 'M1', 2);
    m.M2 = await creerMatiere(fx, niveau1, annee1, 'M2', 3);
    m.M3 = await creerMatiere(fx, niveau1, annee1, 'M3', 1);
    m.M5 = await creerMatiere(fx, niveau2, annee2, 'M5', 1);
    s1 = await creerEleve(fx, tenantA, niveau1, annee1);
    s2 = await creerEleve(fx, tenantA, niveau1, annee1);
    const inscriptionAnnee2 = await prisma.inscription.create({
      data: {
        etudiantId: s1.etudiant,
        niveauId: niveau2,
        anneeAcademiqueId: annee2,
        statut: 'VALIDE',
        createdBy: s1.user,
      },
    });
    const s1Annee2: Eleve = { ...s1, inscription: inscriptionAnnee2.id };

    // M1 (coef 2) pour s1 : 12 ; 30/40 → 15 ; absent → 0 ; dispensé (exclu) ; BROUILLON avec une note de 20 (jamais visible)
    await evaluation(m.M1, 'Devoir', {
      coefficient: 1,
      bareme: 20,
      notes: [
        [s1, 'NOTEE', 12, 'Appréciation interne'],
        [s2, 'NOTEE', 4],
      ],
    });
    await evaluation(m.M1, 'Examen', {
      coefficient: 2,
      bareme: 40,
      notes: [
        [s1, 'NOTEE', 30],
        [s2, 'NOTEE', 10],
      ],
    });
    await evaluation(m.M1, 'TP', {
      coefficient: 1,
      bareme: 20,
      notes: [
        [s1, 'ABSENT', null],
        [s2, 'NOTEE', 20],
      ],
    });
    await evaluation(m.M1, 'Dispense', {
      coefficient: 5,
      bareme: 20,
      notes: [[s1, 'DISPENSE', null]],
    });
    await evaluation(m.M1, 'Brouillon secret', {
      coefficient: 3,
      bareme: 20,
      statut: StatutEvaluation.BROUILLON,
      notes: [
        [s1, 'NOTEE', 20],
        [s2, 'NOTEE', 20],
      ],
    });
    await evaluation(m.M2, 'Examen M2', {
      coefficient: 1,
      bareme: 20,
      notes: [
        [s1, 'NOTEE', 14],
        [s2, 'NOTEE', 2],
      ],
    });
    await evaluation(m.M3, 'Brouillon M3', {
      coefficient: 1,
      bareme: 20,
      statut: StatutEvaluation.BROUILLON,
      notes: [[s1, 'NOTEE', 18]],
    });
    await evaluation(m.M5, 'Devoir M5', {
      coefficient: 1,
      bareme: 10,
      notes: [[s1Annee2, 'NOTEE', 7]],
    });

    const tenantBStructure = await creerStructure(fx, tenantB, 'b');
    const niveauB = await tenantBStructure.niveau('N1', 1);
    anneeB = await tenantBStructure.annee('A1', 2026);
    m.MB = await creerMatiere(fx, niveauB, anneeB, 'MB', 1);
    sB = await creerEleve(fx, tenantB, niveauB, anneeB);
    await evaluation(m.MB, 'Examen B', {
      coefficient: 1,
      bareme: 20,
      notes: [[sB, 'NOTEE', 19]],
    });

    t1 = await login(app, s1.email, 'Password123');
    t2 = await login(app, s2.email, 'Password123');
    tB = await login(app, sB.email, 'Password123');
    scolarite = await creerCompte(fx, tenantA, Role.SCOLARITE);
    prof = await creerCompte(fx, tenantA, Role.ENSEIGNANT);
    adminB = await creerCompte(fx, tenantB, Role.ADMIN);
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

  describe('contenu et calcul', () => {
    it('renvoie mes notes publiées et mes moyennes, marquées provisoires', async () => {
      const { body } = await mesNotes(t1, `?anneeId=${annee1}`).expect(200);
      expect(body.annees).toHaveLength(1);
      const annee = body.annees[0];
      expect(annee).toMatchObject({
        provisoire: true,
        moyenneGenerale: 12.6,
        statutInscription: 'VALIDE',
      });
      expect(annee.niveau).toMatchObject({ code: 'N1' });
      // (12×1 + 15×2 + 0×1) ÷ 4 = 10,5 ; M2 = 14 ; M3 (brouillon seul) sans moyenne
      expect(matiere(body, annee1, 'M1').moyenne).toBe(10.5);
      expect(matiere(body, annee1, 'M2').moyenne).toBe(14);
      expect(matiere(body, annee1, 'M3').moyenne).toBeNull();
      const evals = Object.fromEntries(
        matiere(body, annee1, 'M1').evaluations.map((e: Json) => [e.nom, e]),
      ) as Record<string, Json>;
      expect(evals['Examen']).toMatchObject({
        comptee: true,
        bareme: 40,
        note: { valeur: 30, sur20: 15 },
      });
      expect(evals['TP']).toMatchObject({
        comptee: true,
        note: { etat: 'ABSENT', sur20: 0 },
      });
      expect(evals['Dispense']).toMatchObject({
        comptee: false,
        note: { etat: 'DISPENSE' },
      });
    });

    it('n’affiche jamais un brouillon, même avec une note dessus', async () => {
      const { body } = await mesNotes(t1).expect(200);
      expect(JSON.stringify(body)).not.toContain('Brouillon');
      expect(JSON.stringify(body)).not.toContain('secret');
      expect(
        matiere(body, annee1, 'M1')
          .evaluations.map((e: Json) => e.nom)
          .sort(),
      ).toEqual(['Devoir', 'Dispense', 'Examen', 'TP']);
      expect(matiere(body, annee1, 'M3').evaluations).toEqual([]);
      // La note de 20 du brouillon n'a aucune influence sur la moyenne
      expect(matiere(body, annee1, 'M1').moyenne).toBe(10.5);
    });

    it('suit la publication en direct : une dépublication retire l’évaluation et recalcule', async () => {
      const examen = await prisma.evaluation.findFirstOrThrow({
        where: { matiereId: m.M1, nom: 'Examen' },
      });
      await appel(
        app,
        'post',
        scolarite.token,
        `/evaluations/${examen.id}/depublier`,
        { motif: 'Contrôle' },
      ).expect(200);
      let { body } = await mesNotes(t1, `?anneeId=${annee1}`).expect(200);
      expect(
        matiere(body, annee1, 'M1').evaluations.map((e: Json) => e.nom),
      ).not.toContain('Examen');
      expect(matiere(body, annee1, 'M1').moyenne).toBe(6); // (12 + 0) ÷ 2
      await appel(
        app,
        'post',
        scolarite.token,
        `/evaluations/${examen.id}/publier`,
      ).expect(200);
      ({ body } = await mesNotes(t1, `?anneeId=${annee1}`).expect(200));
      expect(matiere(body, annee1, 'M1').moyenne).toBe(10.5);
    });
  });

  describe('cohérence avec le relevé du personnel', () => {
    /** Retire ce qui diffère volontairement entre les deux routes (provisoire, commentaire). */
    const normaliser = (annees: Json[]) =>
      annees.map((annee) => ({
        annee: annee.annee,
        niveau: annee.niveau,
        statutInscription: annee.statutInscription,
        moyenneGenerale: annee.moyenneGenerale,
        matieres: annee.matieres.map((matiere: Json) => ({
          ...matiere,
          evaluations: matiere.evaluations.map(
            ({ note, ...evaluation }: Json) => ({
              ...evaluation,
              note: note && {
                etat: note.etat,
                valeur: note.valeur,
                sur20: note.sur20,
              },
            }),
          ),
        })),
      }));

    it.each(['s1', 's2'] as const)(
      'les moyennes et notes de %s sont identiques à celles du relevé personnel (toutes années)',
      async (qui) => {
        const [eleve, token] = qui === 's1' ? [s1, t1] : [s2, t2];
        const etudiant = (await mesNotes(token).expect(200)).body;
        const personnel = (await releve(eleve.etudiant).expect(200)).body;
        expect(normaliser(etudiant.annees)).toEqual(
          normaliser(personnel.annees),
        );
        expect(etudiant.annees.length).toBeGreaterThan(0);
      },
    );

    it('même cohérence pour chaque année demandée', async () => {
      for (const annee of [annee1, annee2]) {
        const etudiant = (await mesNotes(t1, `?anneeId=${annee}`).expect(200))
          .body;
        const personnel = (
          await releve(s1.etudiant, `?anneeId=${annee}`).expect(200)
        ).body;
        expect(normaliser(etudiant.annees)).toEqual(
          normaliser(personnel.annees),
        );
      }
    });
  });

  describe('filtrage par année', () => {
    it('sans anneeId : toutes mes années, la plus récente d’abord', async () => {
      const { body } = await mesNotes(t1).expect(200);
      expect(body.annees.map((x: Json) => x.annee.id)).toEqual([
        annee2,
        annee1,
      ]);
      expect(body.annees[0].moyenneGenerale).toBe(14); // 7/10 → 14/20
      expect(matiere(body, annee2, 'M5').moyenne).toBe(14);
    });

    it('avec anneeId : uniquement cette année', async () => {
      const { body } = await mesNotes(t1, `?anneeId=${annee2}`).expect(200);
      expect(body.annees.map((x: Json) => x.annee.id)).toEqual([annee2]);
    });

    it('une année de mon établissement où je ne suis pas inscrit donne une liste vide ; celle d’un autre établissement, 404', async () => {
      expect(
        (await mesNotes(t1, `?anneeId=${anneeVide}`).expect(200)).body.annees,
      ).toEqual([]);
      await mesNotes(t1, `?anneeId=${anneeB}`).expect(404);
    });
  });

  describe('isolation par identité', () => {
    it('chaque étudiant ne reçoit que ses propres notes, jamais celles d’un autre, même de sa classe', async () => {
      const a = (await mesNotes(t1, `?anneeId=${annee1}`).expect(200)).body;
      const b = (await mesNotes(t2, `?anneeId=${annee1}`).expect(200)).body;
      // s2 : (4×1 + 5×2 + 20×1) ÷ 4 = 8,5 ; M2 = 2 ; général (8,5×2 + 2×3) ÷ 5 = 4,6
      expect(matiere(b, annee1, 'M1').moyenne).toBe(8.5);
      expect(matiere(b, annee1, 'M2').moyenne).toBe(2);
      expect(b.annees[0].moyenneGenerale).toBe(4.6);
      expect(a.annees[0].moyenneGenerale).toBe(12.6);
      expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
      // Rien de l'autre étudiant dans la réponse
      for (const [moi, autre] of [
        [a, s2],
        [b, s1],
      ] as const) {
        const texte = JSON.stringify(moi);
        for (const secret of [
          autre.etudiant,
          autre.inscription,
          autre.user,
          autre.email,
        ]) {
          expect(texte).not.toContain(secret);
        }
      }
      // Un étudiant d'un autre établissement ne voit que le sien
      const voisin = (await mesNotes(tB).expect(200)).body;
      expect(voisin.annees).toHaveLength(1);
      expect(matiere(voisin, anneeB, 'MB').moyenne).toBe(19);
      expect(JSON.stringify(voisin)).not.toContain(annee1);
    });

    it('un identifiant fourni dans l’URL ne change rien : rejeté, jamais de données d’un autre', async () => {
      for (const parametre of ['etudiantId', 'userId', 'id', 'inscriptionId']) {
        const valeur =
          parametre === 'userId'
            ? s2.user
            : parametre === 'inscriptionId'
              ? s2.inscription
              : s2.etudiant;
        const r = await mesNotes(t1, `?${parametre}=${valeur}`);
        expect([200, 400]).toContain(r.status);
        if (r.status === 200) {
          expect(r.body.annees[0].moyenneGenerale).toBe(14);
        }
        expect(JSON.stringify(r.body)).not.toContain(s2.etudiant);
      }
      // Les routes du personnel restent interdites à un étudiant
      await appel(app, 'get', t1, `/etudiants/${s2.etudiant}/releve`).expect(
        403,
      );
      await appel(app, 'get', t1, `/etudiants/${s1.etudiant}/releve`).expect(
        403,
      );
    });

    it('ne contient ni moyenne de classe, ni rang, ni identifiant interne de compte', async () => {
      const { body } = await mesNotes(t1).expect(200);
      const interdites = [
        'rang',
        'classement',
        'moyenneClasse',
        'moyenneDeLaClasse',
        'userId',
        'tenantId',
        'inscriptionId',
        'etudiantId',
        'creePar',
        'publiePar',
        'saisiePar',
        'commentaire',
        'email',
        'matricule',
        'matriculeIuc',
      ];
      const trouvees = cles(body);
      for (const cle of interdites) expect(trouvees.has(cle)).toBe(false);
    });

    it('ne transmet pas le commentaire d’une note (visible seulement du personnel)', async () => {
      const { body } = await mesNotes(t1, `?anneeId=${annee1}`).expect(200);
      expect(JSON.stringify(body)).not.toContain('Appréciation interne');
      const personnel = (
        await releve(s1.etudiant, `?anneeId=${annee1}`).expect(200)
      ).body;
      expect(JSON.stringify(personnel)).toContain('Appréciation interne');
    });
  });

  describe('accès', () => {
    it('réservé au rôle ETUDIANT : 403 pour le personnel et l’enseignant, 401 sans jeton', async () => {
      for (const token of [scolarite.token, prof.token, adminB.token]) {
        await mesNotes(token).expect(403);
      }
      await mesNotes(undefined).expect(401);
    });

    it('404 pour un compte ETUDIANT sans profil étudiant', async () => {
      const sansProfil = await creerCompte(fx, tenantA, Role.ETUDIANT);
      await mesNotes(sansProfil.token).expect(404);
    });
  });
});
