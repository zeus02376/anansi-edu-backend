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

describeWithTestDatabase('Relevé de notes : moyennes à la volée (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  const suffix = uniqueSuffix();
  const tenants: string[] = [];
  let scolarite: Compte;
  let adminB: Compte;
  let prof: Compte;
  let etudiantCompte: Compte;
  let annee1: string;
  let annee2: string;
  let niveau1: string;
  let niveau2: string;
  let s1: Eleve; // étudiant du relevé
  let s1Annee2: Eleve; // la même personne, inscription de l'année 2
  let s2: Eleve; // même classe, notes différentes (ne doit jamais se mélanger)
  let vide: Eleve; // aucune note
  let m: Record<'M1' | 'M2' | 'M3' | 'M4' | 'M5', string>;

  const releve = (token: string, etudiant: string, query = '') =>
    appel(app, 'get', token, `/etudiants/${etudiant}/releve${query}`);

  /** Évaluation (en base) avec des notes par inscription. */
  async function evaluation(
    matiereId: string,
    nom: string,
    options: {
      coefficient: number;
      bareme: number;
      statut?: StatutEvaluation;
      notes: [Eleve, EtatNote, number | null][];
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
      },
    });
    for (const [eleve, etat, valeur] of options.notes) {
      await prisma.note.create({
        data: {
          evaluationId: e.id,
          inscriptionId: eleve.inscription,
          etat,
          valeur,
          saisiePar: 'seed',
        },
      });
    }
    return e.id;
  }

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    fx = { app, prisma, suffix };
    const tenantA = (await createTenant(prisma, `${suffix}-a`)).id;
    const tenantB = (await createTenant(prisma, `${suffix}-b`)).id;
    tenants.push(tenantA, tenantB);

    const a = await creerStructure(fx, tenantA, 'a');
    niveau1 = await a.niveau('N1', 1);
    niveau2 = await a.niveau('N2', 2);
    annee1 = await a.annee('A1', 2026);
    annee2 = await a.annee('A2', 2027);

    // Matières de l'année 1 (niveau 1), avec des coefficients différents
    m = {
      M1: await creerMatiere(fx, niveau1, annee1, 'M1', 2),
      M2: await creerMatiere(fx, niveau1, annee1, 'M2', 3),
      M3: await creerMatiere(fx, niveau1, annee1, 'M3', 1),
      M4: await creerMatiere(fx, niveau1, annee1, 'M4', 5),
      M5: await creerMatiere(fx, niveau2, annee2, 'M5', 1),
    };
    s1 = await creerEleve(fx, tenantA, niveau1, annee1);
    s2 = await creerEleve(fx, tenantA, niveau1, annee1);
    vide = await creerEleve(fx, tenantA, niveau1, annee1);
    // Le même étudiant s1 est ensuite inscrit en année 2 (niveau 2)
    const inscriptionAnnee2 = await prisma.inscription.create({
      data: {
        etudiantId: s1.etudiant,
        niveauId: niveau2,
        anneeAcademiqueId: annee2,
        statut: 'VALIDE',
        createdBy: s1.user,
      },
    });
    s1Annee2 = { ...s1, inscription: inscriptionAnnee2.id };

    // M1 (coef 2) : devoir /20 coef 1 = 12 ; examen /40 coef 2 = 30 (→ 15) ; TP coef 1 ABSENT (→ 0) ;
    //   dispensé coef 5 (exclu) ; brouillon coef 3 = 20 (exclu) ; publiée sans note pour s1 (exclue)
    await evaluation(m.M1, 'Devoir', {
      coefficient: 1,
      bareme: 20,
      notes: [
        [s1, 'NOTEE', 12],
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
    await evaluation(m.M1, 'Brouillon', {
      coefficient: 3,
      bareme: 20,
      statut: StatutEvaluation.BROUILLON,
      notes: [[s1, 'NOTEE', 20]],
    });
    await evaluation(m.M1, 'Sans note pour s1', {
      coefficient: 4,
      bareme: 20,
      notes: [[s2, 'NOTEE', 20]],
    });
    // M2 (coef 3) : un examen /20 coef 1 = 14
    await evaluation(m.M2, 'Examen M2', {
      coefficient: 1,
      bareme: 20,
      notes: [
        [s1, 'NOTEE', 14],
        [s2, 'NOTEE', 2],
      ],
    });
    // M3 (coef 1) : seulement un brouillon → aucune moyenne
    await evaluation(m.M3, 'Brouillon M3', {
      coefficient: 1,
      bareme: 20,
      statut: StatutEvaluation.BROUILLON,
      notes: [[s1, 'NOTEE', 18]],
    });
    // M4 (coef 5) : seulement une dispense → aucune moyenne
    await evaluation(m.M4, 'Dispense M4', {
      coefficient: 1,
      bareme: 20,
      notes: [[s1, 'DISPENSE', null]],
    });
    // Année 2 — M5 (coef 1) : un devoir /10 = 7 → 14/20
    await evaluation(m.M5, 'Devoir M5', {
      coefficient: 1,
      bareme: 10,
      notes: [[s1Annee2, 'NOTEE', 7]],
    });

    scolarite = await creerCompte(fx, tenantA, Role.SCOLARITE);
    prof = await creerCompte(fx, tenantA, Role.ENSEIGNANT);
    etudiantCompte = await creerCompte(fx, tenantA, Role.ETUDIANT);
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

  const matiere = (body: any, annee: string, code: string) =>
    body.annees
      .find((x: any) => x.annee.id === annee)
      .matieres.find((x: any) => x.code === code);

  it('calcule la moyenne de matière : barèmes, absent = 0, dispensé exclu, brouillon et non-notée exclus', async () => {
    const { body } = await releve(
      scolarite.token,
      s1.etudiant,
      `?anneeId=${annee1}`,
    ).expect(200);
    // (12×1 + 15×2 + 0×1) ÷ (1 + 2 + 1) = 42 ÷ 4 = 10,5
    expect(matiere(body, annee1, 'M1').moyenne).toBe(10.5);
    expect(matiere(body, annee1, 'M2').moyenne).toBe(14);
    expect(matiere(body, annee1, 'M3').moyenne).toBeNull();
    expect(matiere(body, annee1, 'M4').moyenne).toBeNull();
  });

  it('calcule la moyenne générale pondérée par le coefficient des matières (matières sans moyenne ignorées)', async () => {
    const { body } = await releve(
      scolarite.token,
      s1.etudiant,
      `?anneeId=${annee1}`,
    ).expect(200);
    // (10,5×2 + 14×3) ÷ (2 + 3) = 63 ÷ 5 = 12,6 ; M3 (coef 1) et M4 (coef 5) n'entrent pas dans le calcul
    expect(body.annees[0].moyenneGenerale).toBe(12.6);
  });

  it('détaille chaque évaluation : comptée ou non, note sur 20, brouillons absents', async () => {
    const { body } = await releve(
      scolarite.token,
      s1.etudiant,
      `?anneeId=${annee1}`,
    ).expect(200);
    const evals = Object.fromEntries(
      matiere(body, annee1, 'M1').evaluations.map((e: any) => [e.nom, e]),
    ) as Record<string, any>;
    expect(evals['Devoir']).toMatchObject({
      comptee: true,
      note: { etat: 'NOTEE', valeur: 12, sur20: 12 },
    });
    expect(evals['Examen']).toMatchObject({
      comptee: true,
      bareme: 40,
      note: { valeur: 30, sur20: 15 },
    });
    expect(evals['TP']).toMatchObject({
      comptee: true,
      note: { etat: 'ABSENT', valeur: null, sur20: 0 },
    });
    expect(evals['Dispense']).toMatchObject({
      comptee: false,
      note: { etat: 'DISPENSE', sur20: null },
    });
    expect(evals['Sans note pour s1']).toMatchObject({
      comptee: false,
      note: null,
    });
    expect(evals['Brouillon']).toBeUndefined();
    expect(matiere(body, annee1, 'M3').evaluations).toEqual([]);
  });

  it('ne mélange jamais les notes de deux étudiants d’une même classe', async () => {
    const { body } = await releve(
      scolarite.token,
      s2.etudiant,
      `?anneeId=${annee1}`,
    ).expect(200);
    // s2 : devoir 4 ; examen 10/40 → 5 ; TP 20 ; « sans note pour s1 » coef 4 = 20 ; dispense et brouillon absents
    // M1 = (4×1 + 5×2 + 20×1 + 20×4) ÷ (1 + 2 + 1 + 4) = 114 ÷ 8 = 14,25
    expect(matiere(body, annee1, 'M1').moyenne).toBe(14.25);
    expect(matiere(body, annee1, 'M2').moyenne).toBe(2);
    // (14,25×2 + 2×3) ÷ 5 = 34,5 ÷ 5 = 6,9
    expect(body.annees[0].moyenneGenerale).toBe(6.9);
  });

  it('un étudiant sans note a des moyennes nulles, pas d’erreur', async () => {
    const { body } = await releve(scolarite.token, vide.etudiant).expect(200);
    expect(body.annees).toHaveLength(1);
    expect(body.annees[0].moyenneGenerale).toBeNull();
    expect(body.annees[0].matieres.every((x: any) => x.moyenne === null)).toBe(
      true,
    );
    expect(body.annees[0].matieres).toHaveLength(4); // les matières du niveau et de l'année restent listées
  });

  it('sans anneeId, renvoie toutes les années (la plus récente d’abord) ; avec anneeId, une seule', async () => {
    const { body } = await releve(scolarite.token, s1.etudiant).expect(200);
    expect(body.annees.map((x: any) => x.annee.id)).toEqual([annee2, annee1]);
    expect(matiere(body, annee2, 'M5').moyenne).toBe(14); // 7/10 → 14/20
    expect(body.annees[0].moyenneGenerale).toBe(14);
    expect(body.annees[1].moyenneGenerale).toBe(12.6);
    expect(body.etudiant).toMatchObject({
      id: s1.etudiant,
      matriculeIuc: null,
    });
    expect(JSON.stringify(body)).not.toContain('@example.test');

    const une = await releve(
      scolarite.token,
      s1.etudiant,
      `?anneeId=${annee2}`,
    ).expect(200);
    expect(une.body.annees).toHaveLength(1);
  });

  it('calcule à la volée : une correction ou une dépublication change le relevé sans rien recalculer', async () => {
    const note = await prisma.note.findFirstOrThrow({
      where: { inscriptionId: s1.inscription, evaluation: { nom: 'Devoir' } },
    });
    await appel(app, 'put', scolarite.token, `/notes/${note.id}`, {
      valeur: 20,
      motif: 'Recorrection',
    }).expect(200);
    let r = (
      await releve(scolarite.token, s1.etudiant, `?anneeId=${annee1}`).expect(
        200,
      )
    ).body;
    // (20 + 30 + 0) ÷ 4 = 12,5 ; général (12,5×2 + 14×3) ÷ 5 = 13,4
    expect(matiere(r, annee1, 'M1').moyenne).toBe(12.5);
    expect(r.annees[0].moyenneGenerale).toBe(13.4);

    const examen = await prisma.evaluation.findFirstOrThrow({
      where: { matiereId: m.M1, nom: 'Examen' },
    });
    await appel(
      app,
      'post',
      scolarite.token,
      `/evaluations/${examen.id}/depublier`,
      {
        motif: 'Contrôle',
      },
    ).expect(200);
    r = (
      await releve(scolarite.token, s1.etudiant, `?anneeId=${annee1}`).expect(
        200,
      )
    ).body;
    // Examen retiré : (20×1 + 0×1) ÷ 2 = 10
    expect(matiere(r, annee1, 'M1').moyenne).toBe(10);
  });

  it('isolation par établissement : 404 pour un autre établissement (étudiant et année)', async () => {
    await releve(adminB.token, s1.etudiant).expect(404);
    await releve(adminB.token, vide.etudiant).expect(404);
    await releve(
      scolarite.token,
      s1.etudiant,
      `?anneeId=${
        (
          await prisma.anneeAcademique.create({
            data: {
              tenantId: tenants[1],
              libelle: `B-${suffix}`,
              dateDebut: new Date('2026-09-01'),
              dateFin: new Date('2027-07-31'),
            },
          })
        ).id
      }`,
    ).expect(404);
    await releve(
      scolarite.token,
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);
  });

  it('réservé au personnel : 403 pour l’enseignant et l’étudiant (même pour son propre relevé), 401 sans jeton', async () => {
    await releve(prof.token, s1.etudiant).expect(403);
    await releve(etudiantCompte.token, s1.etudiant).expect(403);
    await appel(
      app,
      'get',
      undefined,
      `/etudiants/${s1.etudiant}/releve`,
    ).expect(401);
  });
});
