import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
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
  creerMatiere,
  creerProf,
  creerStructure,
  Fixtures,
  Prof,
} from './notes-fixtures';

// 08:00–09:50, 09:50–11:40 (bloc consécutif), 09:00–10:30 (chevauchement partiel)
const H0800 = 480;
const H0950 = 590;
const H1140 = 700;
const H0900 = 540;
const H1030 = 630;

describeWithTestDatabase(
  'Planning : salles et séances du personnel (e2e)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let close: () => Promise<void>;
    let fx: Fixtures;
    const suffix = uniqueSuffix();
    const tenants: string[] = [];
    let tenantA: string;

    let campusA: string;
    let campusA2: string;
    let campusB: string;
    let salle1: string;
    let salle2: string;
    let salleB: string;
    let niveau1: string;
    let niveau2: string;
    let niveau3: string;
    let matiere1: string; // niveau 1, année 1
    let matiere1bis: string; // niveau 1, année 1
    let matiere2: string; // niveau 2, année 1
    let matiere3: string; // niveau 3, année 1
    let matiereAnnee2: string; // niveau 1, année 2
    let matiereB: string;
    let ens1: Prof;
    let ens2: Prof;
    let ensB: Prof;
    let scolarite: Compte;
    let adminA: Compte;
    let adminB: Compte;
    let etudiant: Compte;

    const call = (
      method: 'get' | 'post' | 'put' | 'delete',
      token: string | undefined,
      url: string,
      body?: object,
    ) => appel(app, method, token, url, body);
    const sc = () => scolarite.token;

    // Chaque test prend sa propre date (tous les 3 jours, pour laisser le lendemain libre) :
    // les conflits ne fuient pas d'un test à l'autre
    let compteurJours = 0;
    const jourSuivant = () => ajouter('2027-01-04', 3 * compteurJours++);
    const ajouter = (date: string, jours: number) =>
      new Date(Date.parse(`${date}T00:00:00.000Z`) + jours * 86_400_000)
        .toISOString()
        .slice(0, 10);

    type Corps = Record<string, unknown>;
    /** Séance de référence : niveau 1, enseignant 1, salle 1, 08:00–09:50, jour. */
    const base = (date: string, surcharge: Corps = {}): Corps => ({
      date,
      heureDebut: H0800,
      heureFin: H0950,
      type: 'CM',
      matiereIds: [matiere1],
      enseignantId: ens1.enseignant,
      salleId: salle1,
      ...surcharge,
    });
    const creer = (corps: Corps, token = sc()) =>
      call('post', token, '/seances', corps);
    /** Séance qui ne partage ni enseignant, ni salle, ni classe avec `base`. */
    const disjointe = (): Corps => ({
      matiereIds: [matiere2],
      enseignantId: ens2.enseignant,
      salleId: salle2,
    });
    const lister = (du: string, au: string, query = '', token = sc()) =>
      call('get', token, `/seances?du=${du}&au=${au}${query}`);
    const compter = async (du: string, au: string) =>
      (await lister(du, au).expect(200)).body.length as number;

    beforeAll(async () => {
      ({ app, prisma, close } = await createE2eApp());
      fx = { app, prisma, suffix };
      tenantA = (await createTenant(prisma, `${suffix}-a`)).id;
      const tenantB = (await createTenant(prisma, `${suffix}-b`)).id;
      tenants.push(tenantA, tenantB);

      campusA = (
        await prisma.campus.create({
          data: { tenantId: tenantA, nom: `Logbessou ${suffix}`, code: 'LOG' },
        })
      ).id;
      campusA2 = (
        await prisma.campus.create({
          data: { tenantId: tenantA, nom: `Bonanjo ${suffix}`, code: 'BON' },
        })
      ).id;
      campusB = (
        await prisma.campus.create({
          data: { tenantId: tenantB, nom: `Autre ${suffix}`, code: 'AUT' },
        })
      ).id;
      salle1 = (
        await prisma.salle.create({
          data: { campusId: campusA, code: 'BL100' },
        })
      ).id;
      salle2 = (
        await prisma.salle.create({
          data: { campusId: campusA, code: 'BK312' },
        })
      ).id;
      salleB = (
        await prisma.salle.create({
          data: { campusId: campusB, code: 'BL100' },
        })
      ).id;

      const a = await creerStructure(fx, tenantA, 'a');
      niveau1 = await a.niveau('N1', 1);
      niveau2 = await a.niveau('N2', 2);
      niveau3 = await a.niveau('N3', 3);
      const annee1 = await a.annee('A1', 2026);
      const annee2 = await a.annee('A2', 2027);
      matiere1 = await creerMatiere(fx, niveau1, annee1, 'M1');
      matiere1bis = await creerMatiere(fx, niveau1, annee1, 'M1B');
      matiere2 = await creerMatiere(fx, niveau2, annee1, 'M2');
      matiere3 = await creerMatiere(fx, niveau3, annee1, 'M3');
      matiereAnnee2 = await creerMatiere(fx, niveau1, annee2, 'M1A2');
      ens1 = await creerProf(fx, tenantA, [matiere1]);
      ens2 = await creerProf(fx, tenantA, [matiere2]);
      scolarite = await creerCompte(fx, tenantA, Role.SCOLARITE);
      adminA = await creerCompte(fx, tenantA, Role.ADMIN);
      etudiant = await creerCompte(fx, tenantA, Role.ETUDIANT);

      const b = await creerStructure(fx, tenantB, 'b');
      const niveauB = await b.niveau('N1', 1);
      const anneeB = await b.annee('A1', 2026);
      matiereB = await creerMatiere(fx, niveauB, anneeB, 'MB');
      ensB = await creerProf(fx, tenantB, [matiereB]);
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

    describe('rôles', () => {
      it('réservé à ADMIN et SCOLARITE : 401 sans jeton, 403 pour l’enseignant et l’étudiant', async () => {
        const routes: [Parameters<typeof call>[0], string, object?][] = [
          ['post', '/salles', { campusId: campusA, code: 'X' }],
          ['get', '/salles'],
          ['get', '/salles/x'],
          ['put', '/salles/x', { code: 'X' }],
          ['delete', '/salles/x'],
          ['post', '/seances', {}],
          ['post', '/seances/serie', {}],
          ['get', '/seances?du=2027-01-04&au=2027-01-10'],
          ['get', '/seances/x'],
          ['put', '/seances/x', {}],
          ['post', '/seances/x/annuler', { motif: 'm' }],
          ['delete', '/seances/x'],
          ['get', '/planning/conflits?du=2027-01-04&au=2027-01-10'],
        ];
        for (const [method, url, body] of routes) {
          await call(method, undefined, url, body).expect(401);
          for (const token of [ens1.token, etudiant.token]) {
            await call(method, token, url, body).expect(403);
          }
        }
      });

      it('l’administrateur accède aux mêmes routes que la scolarité', async () => {
        await call('get', adminA.token, '/salles').expect(200);
        await creer(base(jourSuivant(), disjointe()), adminA.token).expect(201);
      });
    });

    describe('salles', () => {
      it('crée une salle, refuse un code déjà pris dans le campus, l’accepte dans un autre campus', async () => {
        const { body } = await call('post', sc(), '/salles', {
          campusId: campusA,
          code: '  AMPHI-1 ',
          nom: 'Amphithéâtre',
          type: 'amphi',
          capacite: 300,
        }).expect(201);
        expect(body).toMatchObject({
          code: 'AMPHI-1',
          nom: 'Amphithéâtre',
          type: 'amphi',
          capacite: 300,
          campus: { id: campusA, code: 'LOG' },
        });
        const doublon = await call('post', sc(), '/salles', {
          campusId: campusA,
          code: 'AMPHI-1',
        }).expect(409);
        expect(doublon.body.message).toContain('existe déjà dans ce campus');
        await call('post', sc(), '/salles', {
          campusId: campusA2,
          code: 'AMPHI-1',
        }).expect(201);
      });

      it('valide les champs (capacité positive, code obligatoire, champ inconnu)', async () => {
        for (const corps of [
          { campusId: campusA, code: 'V1', capacite: 0 },
          { campusId: campusA, code: '   ' },
          { campusId: campusA, code: 'V2', tenantId: 'x' },
          { code: 'V3' },
        ]) {
          await call('post', sc(), '/salles', corps).expect(400);
        }
      });

      it('PUT remplace les champs mais ne change pas le campus', async () => {
        const { body: salle } = await call('post', sc(), '/salles', {
          campusId: campusA,
          code: 'P1',
          nom: 'Ancien nom',
          capacite: 40,
        }).expect(201);
        const { body } = await call('put', sc(), `/salles/${salle.id}`, {
          code: 'P1-bis',
          type: 'labo informatique',
        }).expect(200);
        expect(body).toMatchObject({
          code: 'P1-bis',
          nom: null,
          capacite: null,
          type: 'labo informatique',
          campus: { id: campusA },
        });
        await call('put', sc(), `/salles/${salle.id}`, {
          code: 'P1',
          campusId: campusA2,
        }).expect(400);
        await call('put', sc(), `/salles/${salle.id}`, {
          code: 'BL100',
        }).expect(409);
      });

      it('liste les salles de l’établissement, filtrables par campus', async () => {
        const tout = (await call('get', sc(), '/salles').expect(200)).body;
        const ids = tout.map((s: { id: string }) => s.id);
        expect(ids).toEqual(expect.arrayContaining([salle1, salle2]));
        expect(ids).not.toContain(salleB);
        const duCampus = (
          await call('get', sc(), `/salles?campusId=${campusA2}`).expect(200)
        ).body;
        expect(
          duCampus.every((s: { campusId: string }) => s.campusId === campusA2),
        ).toBe(true);
      });

      it('refuse la suppression si des séances à venir l’utilisent, puis si des séances passées l’utilisent', async () => {
        const { body: salle } = await call('post', sc(), '/salles', {
          campusId: campusA,
          code: 'DEL-1',
        }).expect(201);
        await creer(
          base(jourSuivant(), { ...disjointe(), salleId: salle.id }),
        ).expect(201);
        const aVenir = await call('delete', sc(), `/salles/${salle.id}`).expect(
          409,
        );
        expect(aVenir.body.message).toContain('séance(s) à venir');

        await prisma.seance.updateMany({
          where: { salleId: salle.id },
          data: { date: new Date('2020-01-06') },
        });
        const passees = await call(
          'delete',
          sc(),
          `/salles/${salle.id}`,
        ).expect(409);
        expect(passees.body.message).toContain('séances passées');

        await prisma.seance.deleteMany({ where: { salleId: salle.id } });
        await call('delete', sc(), `/salles/${salle.id}`).expect(200);
        await call('get', sc(), `/salles/${salle.id}`).expect(404);
      });
    });

    describe('création d’une séance', () => {
      it('crée une séance : jour de la semaine déduit de la date, brouillon, matières et salle', async () => {
        const date = '2026-12-07'; // un lundi
        const { body } = await creer(base(date)).expect(201);
        expect(body).toMatchObject({
          date,
          jourSemaine: 1,
          heureDebut: H0800,
          heureFin: H0950,
          type: 'CM',
          rythme: 'JOUR',
          statut: 'BROUILLON',
          annulee: false,
          serieId: null,
          creePar: scolarite.user,
          enseignant: { id: ens1.enseignant },
          salle: { id: salle1, code: 'BL100', campus: { code: 'LOG' } },
          matieres: [
            {
              id: matiere1,
              code: 'M1',
              niveau: { id: niveau1, filiere: { nom: 'ISM' } },
            },
          ],
        });
        // Dimanche : 7 (les examens ont lieu le week-end)
        const dimanche = await creer(base('2026-12-13', disjointe())).expect(
          201,
        );
        expect(dimanche.body.jourSemaine).toBe(7);
      });

      it('le jour de la semaine n’est jamais saisi : champ refusé', async () => {
        await creer(base(jourSuivant(), { jourSemaine: 3 })).expect(400);
      });

      it('enseignant et salle sont facultatifs (examen sans salle)', async () => {
        const { body } = await creer({
          date: jourSuivant(),
          heureDebut: 480,
          heureFin: 660,
          type: 'EXAMEN',
          matiereIds: [matiere1],
        }).expect(201);
        expect(body).toMatchObject({
          enseignant: null,
          salle: null,
          type: 'EXAMEN',
        });
      });

      it('refuse les données invalides en 400', async () => {
        const date = jourSuivant();
        const invalides: Corps[] = [
          base(date, { heureFin: H0800 }), // fin = début
          base(date, { heureDebut: 600, heureFin: 500 }),
          base(date, { heureDebut: -1 }),
          base(date, { heureFin: 1441 }),
          base('2027-02-30'), // jour inexistant
          base('05/01/2027'),
          base(date, { type: 'COURS' }),
          base(date, { matiereIds: [] }),
          base(date, { matiereIds: [matiere1, matiere1] }),
          base(date, { rythme: 'NUIT' }),
          base(date, { creePar: 'x' }),
          base(date, { matiereIds: [matiere1, matiereAnnee2] }), // deux années
        ];
        for (const corps of invalides) await creer(corps).expect(400);
      });

      it('la base refuse elle-même un intervalle horaire invalide', async () => {
        await expect(
          prisma.seance.create({
            data: {
              date: new Date('2027-07-05'),
              heureDebut: 600,
              heureFin: 600,
              type: 'CM',
              creePar: scolarite.user,
            },
          }),
        ).rejects.toThrow();
      });
    });

    describe('conflits : enseignant', () => {
      it('refuse un chevauchement partiel avec le même enseignant (409 qui liste la séance en conflit)', async () => {
        const date = jourSuivant();
        const existante = (await creer(base(date)).expect(201)).body;
        const reponse = await creer(
          base(date, {
            ...disjointe(),
            enseignantId: ens1.enseignant,
            heureDebut: H0900,
            heureFin: H1030,
          }),
        ).expect(409);
        expect(reponse.body.message).toContain('enseignant déjà occupé');
        expect(reponse.body.message).toContain(`le ${date} 09:00–10:30`);
        expect(reponse.body.conflits).toHaveLength(1);
        expect(reponse.body.conflits[0]).toMatchObject({
          type: 'ENSEIGNANT',
          date,
          avec: { id: existante.id, heureDebut: H0800, heureFin: H0950 },
        });
        expect(await compter(date, date)).toBe(1);
      });

      it('refuse l’inclusion et l’égalité des horaires', async () => {
        const date = jourSuivant();
        await creer(base(date)).expect(201);
        for (const horaire of [
          { heureDebut: 500, heureFin: 520 },
          { heureDebut: H0800, heureFin: H0950 },
          { heureDebut: 400, heureFin: 800 },
        ]) {
          await creer(
            base(date, {
              ...disjointe(),
              enseignantId: ens1.enseignant,
              ...horaire,
            }),
          ).expect(409);
        }
      });

      it('accepte les blocs consécutifs (fin exclue) avant et après, et un autre jour', async () => {
        const date = jourSuivant();
        await creer(base(date)).expect(201);
        const memeEns = { ...disjointe(), enseignantId: ens1.enseignant };
        await creer(
          base(date, { ...memeEns, heureDebut: H0950, heureFin: H1140 }),
        ).expect(201);
        await creer(
          base(date, { ...memeEns, heureDebut: 360, heureFin: H0800 }),
        ).expect(201);
        await creer(base(ajouter(date, 1), memeEns)).expect(201);
      });

      it('un autre enseignant au même horaire ne bloque pas', async () => {
        const date = jourSuivant();
        await creer(base(date)).expect(201);
        await creer(base(date, disjointe())).expect(201);
      });
    });

    describe('conflits : salle', () => {
      const autreEns = () => ({
        matiereIds: [matiere2],
        enseignantId: ens2.enseignant,
      });

      it('refuse un chevauchement partiel dans la même salle', async () => {
        const date = jourSuivant();
        const existante = (await creer(base(date)).expect(201)).body;
        const reponse = await creer(
          base(date, { ...autreEns(), heureDebut: H0900, heureFin: H1030 }),
        ).expect(409);
        expect(reponse.body.message).toContain('salle déjà occupée');
        expect(reponse.body.conflits).toHaveLength(1);
        expect(reponse.body.conflits[0]).toMatchObject({
          type: 'SALLE',
          avec: { id: existante.id, salle: { id: salle1, code: 'BL100' } },
        });
      });

      it('accepte les blocs consécutifs dans la même salle et une autre salle au même horaire', async () => {
        const date = jourSuivant();
        await creer(base(date)).expect(201);
        await creer(
          base(date, { ...autreEns(), heureDebut: H0950, heureFin: H1140 }),
        ).expect(201);
        await creer(base(date, { ...autreEns(), salleId: salle2 })).expect(201);
      });

      it('sans salle, deux séances simultanées ne se bloquent pas sur ce critère', async () => {
        const date = jourSuivant();
        const sansSalle = { enseignantId: undefined, salleId: undefined };
        await creer(
          base(date, { ...sansSalle, matiereIds: [matiere1] }),
        ).expect(201);
        await creer(
          base(date, { ...sansSalle, matiereIds: [matiere2] }),
        ).expect(201);
      });
    });

    describe('conflits : classe (niveau + rythme)', () => {
      const autreClasse = () => ({
        enseignantId: ens2.enseignant,
        salleId: salle2,
      });

      it('refuse deux séances du même niveau qui se chevauchent', async () => {
        const date = jourSuivant();
        const existante = (await creer(base(date)).expect(201)).body;
        const reponse = await creer(
          base(date, { ...autreClasse(), heureDebut: H0900, heureFin: H1030 }),
        ).expect(409);
        expect(reponse.body.message).toContain('classe déjà en cours');
        expect(reponse.body.conflits[0]).toMatchObject({
          type: 'CLASSE',
          avec: { id: existante.id },
        });
        expect(reponse.body.conflits).toHaveLength(1);
      });

      it('accepte des blocs consécutifs pour la même classe', async () => {
        const date = jourSuivant();
        await creer(base(date)).expect(201);
        await creer(
          base(date, { ...autreClasse(), heureDebut: H0950, heureFin: H1140 }),
        ).expect(201);
      });

      it('accepte un autre niveau, et le même niveau en rythme Soir', async () => {
        const date = jourSuivant();
        await creer(base(date)).expect(201);
        await creer(
          base(date, { ...autreClasse(), matiereIds: [matiere2] }),
        ).expect(201);
        await creer(
          base(date, {
            rythme: 'SOIR',
            enseignantId: undefined,
            salleId: undefined,
          }),
        ).expect(201);
      });

      it('deux matières du même niveau = une seule classe : la séance ne se bloque pas elle-même', async () => {
        const date = jourSuivant();
        await creer(base(date, { matiereIds: [matiere1, matiere1bis] })).expect(
          201,
        );
      });

      it('signale ensemble tous les critères en conflit', async () => {
        const date = jourSuivant();
        await creer(base(date)).expect(201);
        const reponse = await creer(base(date)).expect(409);
        expect(
          reponse.body.conflits.map((c: { type: string }) => c.type).sort(),
        ).toEqual(['CLASSE', 'ENSEIGNANT', 'SALLE']);
      });
    });

    describe('séance commune à plusieurs matières', () => {
      it('ne se bloque pas elle-même, mais bloque les séances de chacune de ses classes', async () => {
        const date = jourSuivant();
        const commune = (
          await creer(
            base(date, { matiereIds: [matiere1, matiere2, matiere3] }),
          ).expect(201)
        ).body;
        expect(commune.matieres).toHaveLength(3);

        // Une séance du niveau 3 au même horaire (autre enseignant, autre salle) est en conflit de classe
        const reponse = await creer(
          base(date, {
            matiereIds: [matiere3],
            enseignantId: ens2.enseignant,
            salleId: salle2,
          }),
        ).expect(409);
        expect(reponse.body.conflits[0]).toMatchObject({
          type: 'CLASSE',
          avec: { id: commune.id },
        });
      });

      it('la modifier sans changer son créneau ne la met pas en conflit avec elle-même', async () => {
        const date = jourSuivant();
        const commune = (
          await creer(base(date, { matiereIds: [matiere1, matiere2] })).expect(
            201,
          )
        ).body;
        await call('put', sc(), `/seances/${commune.id}`, {
          heureDebut: H0800,
          heureFin: H0950,
          type: 'TD',
        }).expect(200);
        const lue = (
          await call('get', sc(), `/seances/${commune.id}`).expect(200)
        ).body;
        expect(lue.type).toBe('TD');
      });
    });

    describe('séance annulée', () => {
      it('est ignorée par la détection de conflits (les trois types)', async () => {
        const date = jourSuivant();
        const existante = (await creer(base(date)).expect(201)).body;
        await creer(base(date)).expect(409);

        const annulee = (
          await call('post', sc(), `/seances/${existante.id}/annuler`, {
            motif: '  Enseignant absent ',
          }).expect(200)
        ).body;
        expect(annulee).toMatchObject({
          annulee: true,
          motifAnnulation: 'Enseignant absent',
        });
        expect(annulee.annuleLe).toBeTruthy();

        // Même enseignant, même salle, même classe, même horaire : accepté
        await creer(base(date)).expect(201);
        // L'annulée reste visible dans la liste
        const liste = (await lister(date, date).expect(200)).body;
        expect(liste).toHaveLength(2);
        expect(
          liste.filter((s: { annulee: boolean }) => s.annulee),
        ).toHaveLength(1);
      });

      it('exige un motif, ne s’annule qu’une fois et ne se modifie plus', async () => {
        const date = jourSuivant();
        const { id } = (await creer(base(date)).expect(201)).body;
        await call('post', sc(), `/seances/${id}/annuler`, {}).expect(400);
        await call('post', sc(), `/seances/${id}/annuler`, {
          motif: '   ',
        }).expect(400);
        await call('post', sc(), `/seances/${id}/annuler`, {
          motif: 'Férié',
        }).expect(200);
        await call('post', sc(), `/seances/${id}/annuler`, {
          motif: 'Encore',
        }).expect(409);
        const modif = await call('put', sc(), `/seances/${id}`, {
          heureFin: H1140,
        }).expect(409);
        expect(modif.body.message).toContain('annulée');
      });

      it('les séances annulées sont aussi ignorées par l’audit', async () => {
        const date = jourSuivant();
        const a = (await creer(base(date)).expect(201)).body;
        await prisma.seance.create({
          data: {
            date: new Date(date),
            heureDebut: H0900,
            heureFin: H1030,
            type: 'TD',
            enseignantId: ens1.enseignant,
            creePar: scolarite.user,
            matieres: { create: [{ matiereId: matiere2 }] },
          },
        });
        const avant = (
          await call(
            'get',
            sc(),
            `/planning/conflits?du=${date}&au=${date}`,
          ).expect(200)
        ).body;
        expect(avant.nombre).toBe(1);
        await call('post', sc(), `/seances/${a.id}/annuler`, {
          motif: 'x',
        }).expect(200);
        const apres = (
          await call(
            'get',
            sc(),
            `/planning/conflits?du=${date}&au=${date}`,
          ).expect(200)
        ).body;
        expect(apres.nombre).toBe(0);
      });
    });

    describe('création concurrente', () => {
      it('des demandes simultanées en conflit : une seule réussit, les autres reçoivent le 409 clair', async () => {
        // Plusieurs tours : sans transaction sérialisable, deux demandes finissent par se croiser
        for (let tour = 0; tour < 6; tour++) {
          const date = jourSuivant();
          const reponses = await Promise.all(
            Array.from({ length: 8 }, () => creer(base(date))),
          );
          const reussies = reponses.filter((r) => r.status === 201);
          expect(reussies).toHaveLength(1);
          for (const refusee of reponses.filter((r) => r.status !== 201)) {
            expect(refusee.status).toBe(409);
            expect(refusee.body.message).toMatch(
              /Conflit d’horaire|en même temps/,
            );
          }
          expect(await compter(date, date)).toBe(1);
        }
      });
    });

    describe('création en série', () => {
      // Séries : 2028 (lundi 3 janvier 2028), loin des séances unitaires
      const serie = (
        debut: string,
        fin: string,
        surcharge: Corps = {},
      ): Corps => ({
        dateDebut: debut,
        dateFin: fin,
        joursSemaine: [1, 3],
        heureDebut: H0800,
        heureFin: H0950,
        type: 'CM',
        matiereIds: [matiere1],
        enseignantId: ens1.enseignant,
        salleId: salle1,
        ...surcharge,
      });
      const creerSerie = (corps: Corps) =>
        call('post', sc(), '/seances/serie', corps);
      let bloc = 0;
      /** Fenêtre de 4 semaines propre à chaque test. */
      const fenetre = () => {
        const debut = ajouter('2028-01-03', 70 * bloc++); // un lundi
        return { debut, fin: ajouter(debut, 27) };
      };

      it('crée les séances hebdomadaires d’une période : bons jours, même série, tout enregistré', async () => {
        const { debut, fin } = fenetre();
        const { body } = await creerSerie(serie(debut, fin)).expect(201);
        expect(body.nombre).toBe(8); // 4 lundis + 4 mercredis
        expect(body.serieId).toBeTruthy();
        expect(body.seances).toHaveLength(8);
        expect(
          body.seances.every(
            (s: { serieId: string }) => s.serieId === body.serieId,
          ),
        ).toBe(true);
        expect(
          body.seances.map((s: { jourSemaine: number }) => s.jourSemaine),
        ).toEqual([1, 3, 1, 3, 1, 3, 1, 3]);
        expect(body.seances[0].date).toBe(debut);
        expect(await compter(debut, fin)).toBe(8);
      });

      it('dryRun sans conflit : 200, séances prévues, rien créé', async () => {
        const { debut, fin } = fenetre();
        const { body } = await creerSerie(
          serie(debut, fin, { dryRun: true }),
        ).expect(200);
        expect(body).toMatchObject({ dryRun: true, nombre: 8, conflits: [] });
        expect(body.seances[1]).toMatchObject({
          date: ajouter(debut, 2),
          jourSemaine: 3,
          heureDebut: H0800,
        });
        expect(await compter(debut, fin)).toBe(0);
      });

      it('dryRun avec conflits : 200 qui liste chaque conflit, sans rien créer', async () => {
        const { debut, fin } = fenetre();
        const mercredi = ajouter(debut, 9); // le mercredi de la deuxième semaine
        const existante = (await creer(base(mercredi, disjointe())).expect(201))
          .body;
        const { body } = await creerSerie(
          serie(debut, fin, {
            dryRun: true,
            ...{
              matiereIds: [matiere2],
              enseignantId: ens2.enseignant,
              salleId: salle2,
            },
          }),
        ).expect(200);
        expect(body.dryRun).toBe(true);
        expect(body.conflits.length).toBeGreaterThan(0);
        expect(body.conflits[0]).toMatchObject({
          date: mercredi,
          avec: { id: existante.id },
        });
        expect(await compter(debut, fin)).toBe(1); // seule la séance préexistante
      });

      it('un conflit sur une seule date fait tout refuser (409) et ne crée rien', async () => {
        const { debut, fin } = fenetre();
        const lundi3 = ajouter(debut, 14);
        await creer(
          base(lundi3, { ...disjointe(), enseignantId: ens1.enseignant }),
        ).expect(201);
        const reponse = await creerSerie(serie(debut, fin)).expect(409);
        expect(reponse.body.message).toContain(`le ${lundi3} 08:00–09:50`);
        expect(reponse.body.message).toContain('Rien n’a été enregistré');
        expect(reponse.body.conflits).toHaveLength(1);
        expect(reponse.body.conflits[0]).toMatchObject({
          type: 'ENSEIGNANT',
          date: lundi3,
        });
        expect(await compter(debut, fin)).toBe(1);
      });

      it('refuse une période, des jours ou un volume incohérents', async () => {
        const { debut, fin } = fenetre();
        for (const corps of [
          serie(fin, debut), // fin avant début
          serie(debut, ajouter(debut, 1), { joursSemaine: [5] }), // aucun vendredi
          serie(debut, ajouter(debut, 500)), // plus de 400 jours
          serie(debut, ajouter(debut, 399), {
            joursSemaine: [1, 2, 3, 4, 5, 6, 7],
          }), // > 200 séances
          serie(debut, fin, { joursSemaine: [] }),
          serie(debut, fin, { joursSemaine: [0] }),
          serie(debut, fin, { joursSemaine: [8] }),
          serie(debut, fin, { joursSemaine: [1, 1] }),
          serie('2028-02-30', fin),
        ]) {
          await creerSerie(corps).expect(400);
        }
      });
    });

    describe('modification avec portée', () => {
      let blocPortee = 0;
      /** Série de 4 lundis, propre à chaque test. */
      async function nouvelleSerie(surcharge: Corps = {}) {
        const debut = ajouter('2029-01-01', 42 * blocPortee++); // un lundi
        const { body } = await call('post', sc(), '/seances/serie', {
          dateDebut: debut,
          dateFin: ajouter(debut, 21),
          joursSemaine: [1],
          heureDebut: H0800,
          heureFin: H0950,
          type: 'CM',
          matiereIds: [matiere1],
          enseignantId: ens1.enseignant,
          salleId: salle1,
          ...surcharge,
        }).expect(201);
        return {
          debut,
          fin: ajouter(debut, 21),
          serieId: body.serieId as string,
          seances: body.seances as { id: string; date: string }[],
        };
      }
      const lire = async (debut: string, fin: string) =>
        (await lister(debut, fin).expect(200)).body as {
          id: string;
          date: string;
          heureDebut: number;
          heureFin: number;
          salle: { id: string } | null;
          enseignant: { id: string } | null;
        }[];

      it('cette_seance : ne change que cette occurrence (y compris sa date)', async () => {
        const s = await nouvelleSerie();
        const { body } = await call(
          'put',
          sc(),
          `/seances/${s.seances[1].id}`,
          {
            heureDebut: H0950,
            heureFin: H1140,
            date: ajouter(s.debut, 9), // le mercredi suivant
          },
        ).expect(200);
        expect(body).toMatchObject({
          date: ajouter(s.debut, 9),
          jourSemaine: 3,
          heureDebut: H0950,
          serieId: s.serieId,
        });
        const toutes = await lire(s.debut, s.fin);
        expect(toutes.filter((x) => x.heureDebut === H0800)).toHaveLength(3);
      });

      it('suivantes : change cette occurrence et les suivantes, pas les précédentes', async () => {
        const s = await nouvelleSerie();
        const { body } = await call(
          'put',
          sc(),
          `/seances/${s.seances[1].id}`,
          {
            portee: 'suivantes',
            heureDebut: H0950,
            heureFin: H1140,
            salleId: salle2,
          },
        ).expect(200);
        expect(body).toMatchObject({ serieId: s.serieId, nombre: 3 });
        const toutes = await lire(s.debut, s.fin);
        expect(toutes.map((x) => x.heureDebut)).toEqual([
          H0800,
          H0950,
          H0950,
          H0950,
        ]);
        expect(toutes.map((x) => x.salle?.id)).toEqual([
          salle1,
          salle2,
          salle2,
          salle2,
        ]);
        expect(toutes.map((x) => x.date)).toEqual(s.seances.map((x) => x.date));
      });

      it('serie : change toutes les occurrences, retire l’enseignant avec null, ignore les annulées', async () => {
        const s = await nouvelleSerie();
        await call('post', sc(), `/seances/${s.seances[3].id}/annuler`, {
          motif: 'Férié',
        }).expect(200);
        const { body } = await call(
          'put',
          sc(),
          `/seances/${s.seances[0].id}`,
          {
            portee: 'serie',
            enseignantId: null,
            type: 'TD',
          },
        ).expect(200);
        expect(body.nombre).toBe(3);
        const toutes = await lire(s.debut, s.fin);
        const actives = toutes.filter((x) => x.id !== s.seances[3].id);
        expect(actives.every((x) => x.enseignant === null)).toBe(true);
        // L'annulée garde son enseignant : elle n'a pas été touchée
        expect(
          toutes.find((x) => x.id === s.seances[3].id)?.enseignant?.id,
        ).toBe(ens1.enseignant);
      });

      it('un conflit sur une occurrence fait tout refuser, rien n’est modifié', async () => {
        const s = await nouvelleSerie();
        // Occupe la salle 2 le troisième lundi à 09:50–11:40
        await creer(
          base(s.seances[2].date, {
            ...disjointe(),
            heureDebut: H0950,
            heureFin: H1140,
          }),
        ).expect(201);
        const reponse = await call('put', sc(), `/seances/${s.seances[0].id}`, {
          portee: 'serie',
          heureDebut: H0950,
          heureFin: H1140,
          salleId: salle2,
          matiereIds: [matiere3],
          enseignantId: ens1.enseignant,
        }).expect(409);
        expect(reponse.body.conflits).toHaveLength(1);
        expect(reponse.body.conflits[0]).toMatchObject({
          type: 'SALLE',
          date: s.seances[2].date,
        });
        const toutes = await lire(s.debut, s.fin);
        expect(toutes.filter((x) => x.heureDebut === H0800)).toHaveLength(4);
      });

      it('dryRun : renvoie les conflits sans rien modifier', async () => {
        const s = await nouvelleSerie();
        await creer(
          base(s.seances[1].date, {
            ...disjointe(),
            heureDebut: H0950,
            heureFin: H1140,
          }),
        ).expect(201);
        const { body } = await call(
          'put',
          sc(),
          `/seances/${s.seances[0].id}`,
          {
            portee: 'serie',
            heureDebut: H0950,
            heureFin: H1140,
            salleId: salle2,
            dryRun: true,
          },
        ).expect(200);
        expect(body).toMatchObject({ dryRun: true, nombre: 4 });
        expect(body.conflits).toHaveLength(1);
        const toutes = (await lire(s.debut, s.fin)).filter((x) =>
          s.seances.some((origine) => origine.id === x.id),
        );
        expect(toutes).toHaveLength(4);
        expect(toutes.every((x) => x.heureDebut === H0800)).toBe(true);
      });

      it('déplacer une séance sur un bloc consécutif est accepté, sur un chevauchement refusé', async () => {
        const date = jourSuivant();
        const premiere = (await creer(base(date)).expect(201)).body;
        const seconde = (
          await creer(
            base(date, {
              ...disjointe(),
              enseignantId: ens1.enseignant,
              heureDebut: H1140,
              heureFin: 800,
            }),
          ).expect(201)
        ).body;
        await call('put', sc(), `/seances/${seconde.id}`, {
          heureDebut: H0950,
          heureFin: H1140,
        }).expect(200);
        await call('put', sc(), `/seances/${seconde.id}`, {
          heureDebut: H0900,
        }).expect(409);
        expect(premiere.id).not.toBe(seconde.id);
      });

      it('refuse les demandes incohérentes en 400', async () => {
        const s = await nouvelleSerie();
        const unique = (
          await creer(base(jourSuivant(), disjointe())).expect(201)
        ).body;
        const id = s.seances[0].id;
        await call('put', sc(), `/seances/${id}`, {}).expect(400); // rien à modifier
        await call('put', sc(), `/seances/${id}`, {
          portee: 'serie',
          date: s.debut,
        }).expect(400);
        await call('put', sc(), `/seances/${id}`, {
          portee: 'toutes',
          type: 'TD',
        }).expect(400);
        await call('put', sc(), `/seances/${id}`, {
          heureDebut: 700,
          heureFin: 600,
        }).expect(400);
        await call('put', sc(), `/seances/${id}`, { matiereIds: [] }).expect(
          400,
        );
        await call('put', sc(), `/seances/${unique.id}`, {
          portee: 'serie',
          type: 'TD',
        }).expect(400);
        await call('put', sc(), `/seances/${unique.id}`, {
          portee: 'suivantes',
          type: 'TD',
        }).expect(400);
      });
    });

    describe('consultation et suppression', () => {
      it('liste par période, triée, avec les filtres niveau, enseignant, salle, type, statut et rythme', async () => {
        const date = ajouter('2030-01-07', 0);
        const a = (await creer(base(date)).expect(201)).body;
        const b = (
          await creer(
            base(date, {
              matiereIds: [matiere2],
              enseignantId: ens2.enseignant,
              salleId: salle2,
              heureDebut: H0950,
              heureFin: H1140,
              type: 'TP',
            }),
          ).expect(201)
        ).body;
        const c = (
          await creer(
            base(ajouter(date, 1), { rythme: 'SOIR', type: 'TD' }),
          ).expect(201)
        ).body;
        const periode = (await lister(date, ajouter(date, 1)).expect(200)).body;
        expect(periode.map((s: { id: string }) => s.id)).toEqual([
          a.id,
          b.id,
          c.id,
        ]);

        const ids = async (filtre: string) =>
          (await lister(date, ajouter(date, 1), filtre).expect(200)).body.map(
            (s: { id: string }) => s.id,
          );
        expect(await ids(`&niveauId=${niveau2}`)).toEqual([b.id]);
        expect(await ids(`&enseignantId=${ens1.enseignant}`)).toEqual([
          a.id,
          c.id,
        ]);
        expect(await ids(`&salleId=${salle2}`)).toEqual([b.id]);
        expect(await ids('&type=TP')).toEqual([b.id]);
        expect(await ids('&rythme=SOIR')).toEqual([c.id]);
        expect(await ids('&statut=PUBLIEE')).toEqual([]);
        expect(await ids('&statut=BROUILLON')).toEqual([a.id, b.id, c.id]);
        expect(await ids(`&niveauId=${niveau3}`)).toEqual([]);
        // La période borne la liste
        expect(
          (await lister(ajouter(date, 1), ajouter(date, 1)).expect(200)).body,
        ).toHaveLength(1);
      });

      it('exige une période valide et bornée', async () => {
        await call('get', sc(), '/seances').expect(400);
        await call('get', sc(), '/seances?du=2027-01-04').expect(400);
        await lister('2027-01-10', '2027-01-04').expect(400);
        await lister('2027-02-30', '2027-03-04').expect(400);
        await lister('2027-01-01', '2028-01-05').expect(400); // plus de 366 jours
        await lister('2027-01-01', '2027-12-31').expect(200);
        await call(
          'get',
          sc(),
          '/planning/conflits?du=2027-01-10&au=2027-01-04',
        ).expect(400);
        await lister('2027-01-04', '2027-01-10', '&type=COURS').expect(400);
      });

      it('consulte et supprime une séance (ses liens aux matières partent avec elle)', async () => {
        const date = jourSuivant();
        const { id } = (
          await creer(base(date, { matiereIds: [matiere1, matiere2] })).expect(
            201,
          )
        ).body;
        const lue = (await call('get', sc(), `/seances/${id}`).expect(200))
          .body;
        expect(lue.matieres).toHaveLength(2);
        await call('delete', sc(), `/seances/${id}`).expect(200);
        await call('get', sc(), `/seances/${id}`).expect(404);
        await call('delete', sc(), `/seances/${id}`).expect(404);
        expect(
          await prisma.seanceMatiere.count({ where: { seanceId: id } }),
        ).toBe(0);
      });
    });

    describe('audit des conflits', () => {
      it('liste les conflits existants des trois types sans rien bloquer', async () => {
        const date = ajouter('2031-01-06', 0);
        const nouvelle = (
          data: {
            heureDebut: number;
            heureFin: number;
            enseignantId?: string;
            salleId?: string;
          },
          matiereId: string,
        ) =>
          prisma.seance.create({
            data: {
              date: new Date(date),
              type: 'CM',
              creePar: scolarite.user,
              ...data,
              matieres: { create: [{ matiereId }] },
            },
          });
        // Insérées hors API : l'audit révèle ce que la création aurait refusé
        const s1 = await nouvelle(
          { heureDebut: H0800, heureFin: H0950, enseignantId: ens1.enseignant },
          matiere1,
        );
        const s2 = await nouvelle(
          { heureDebut: H0900, heureFin: H1030, enseignantId: ens1.enseignant },
          matiere2,
        );
        const s3 = await nouvelle(
          { heureDebut: H0900, heureFin: H1030, salleId: salle1 },
          matiere3,
        );
        const s4 = await nouvelle(
          { heureDebut: H0800, heureFin: H0950, salleId: salle1 },
          matiere1bis,
        );
        // Bloc consécutif : aucun conflit avec les précédentes
        await nouvelle(
          {
            heureDebut: H1140,
            heureFin: 800,
            enseignantId: ens1.enseignant,
            salleId: salle1,
          },
          matiere1,
        );

        const { body } = await call(
          'get',
          sc(),
          `/planning/conflits?du=${date}&au=${date}`,
        ).expect(200);
        const paires = body.conflits.map(
          (c: { type: string; seances: { id: string }[] }) =>
            `${c.type}:${c.seances
              .map((s) => s.id)
              .sort()
              .join('+')}`,
        );
        const paire = (type: string, a: { id: string }, b: { id: string }) =>
          `${type}:${[a.id, b.id].sort().join('+')}`;
        expect(paires).toContain(paire('ENSEIGNANT', s1, s2));
        expect(paires).toContain(paire('SALLE', s3, s4));
        expect(body.nombre).toBe(3);
        expect(paires).toContain(paire('CLASSE', s1, s4));
        expect(body.nombre).toBe(body.conflits.length);
        expect(body.du).toBe(date);
        for (const c of body.conflits) expect(c.date).toBe(date);
        // Rien n'est supprimé ni modifié par l'audit
        expect(await compter(date, date)).toBe(5);
      });

      it('une période sans conflit renvoie une liste vide', async () => {
        const date = jourSuivant();
        await creer(base(date)).expect(201);
        const { body } = await call(
          'get',
          sc(),
          `/planning/conflits?du=${date}&au=${date}`,
        ).expect(200);
        expect(body).toMatchObject({ nombre: 0, conflits: [] });
      });
    });

    describe('isolation par établissement', () => {
      let seanceA: string;
      let serieA: string[];
      const tb = () => adminB.token;

      beforeAll(async () => {
        seanceA = (await creer(base(ajouter('2032-01-05', 0))).expect(201)).body
          .id;
        const serie = await call('post', sc(), '/seances/serie', {
          dateDebut: '2032-02-02',
          dateFin: '2032-02-23',
          joursSemaine: [2],
          heureDebut: H0800,
          heureFin: H0950,
          type: 'TP',
          matiereIds: [matiere2],
          enseignantId: ens2.enseignant,
          salleId: salle2,
        }).expect(201);
        serieA = serie.body.seances.map((s: { id: string }) => s.id);
      });

      it('un autre établissement ne voit ni ne touche les séances (404)', async () => {
        await call('get', tb(), `/seances/${seanceA}`).expect(404);
        await call('put', tb(), `/seances/${seanceA}`, { type: 'TD' }).expect(
          404,
        );
        await call('put', tb(), `/seances/${serieA[1]}`, {
          portee: 'serie',
          type: 'TD',
        }).expect(404);
        await call('post', tb(), `/seances/${seanceA}/annuler`, {
          motif: 'x',
        }).expect(404);
        await call('delete', tb(), `/seances/${seanceA}`).expect(404);
        expect(
          await prisma.seance.count({ where: { id: seanceA, annuleLe: null } }),
        ).toBe(1);
        expect(
          await prisma.seance.count({
            where: { id: { in: serieA }, type: 'TP' },
          }),
        ).toBe(serieA.length);
      });

      it('les listes et l’audit sont limités à l’établissement', async () => {
        expect(
          (await lister('2032-01-01', '2032-12-31', '', tb()).expect(200)).body,
        ).toEqual([]);
        expect(
          (await lister('2032-01-01', '2032-12-31').expect(200)).body.length,
        ).toBeGreaterThan(0);
        // Filtres sur des identifiants d'un autre établissement : rien n'en sort
        expect(
          (
            await lister(
              '2032-01-01',
              '2032-12-31',
              `&salleId=${salle1}`,
              tb(),
            ).expect(200)
          ).body,
        ).toEqual([]);
        const audit = await call(
          'get',
          tb(),
          '/planning/conflits?du=2031-01-01&au=2031-12-31',
        ).expect(200);
        expect(audit.body.nombre).toBe(0);
      });

      it('créer ou modifier avec des références d’un autre établissement donne 404 sans rien créer', async () => {
        const date = ajouter('2033-01-03', 0);
        // L'administrateur B utilise une matière, un enseignant, une salle de A
        await creer(base(date), tb()).expect(404); // matière de A
        await creer(
          base(date, {
            matiereIds: [matiereB],
            enseignantId: ens1.enseignant,
            salleId: undefined,
          }),
          tb(),
        ).expect(404);
        await creer(
          base(date, {
            matiereIds: [matiereB],
            enseignantId: ensB.enseignant,
            salleId: salle1,
          }),
          tb(),
        ).expect(404);
        // Et l'inverse : A utilise la matière, l'enseignant ou la salle de B
        await creer(base(date, { matiereIds: [matiereB] })).expect(404);
        await creer(base(date, { enseignantId: ensB.enseignant })).expect(404);
        await creer(base(date, { salleId: salleB })).expect(404);
        await call('put', sc(), `/seances/${seanceA}`, {
          salleId: salleB,
        }).expect(404);
        await call('put', sc(), `/seances/${seanceA}`, {
          enseignantId: ensB.enseignant,
        }).expect(404);
        await call('put', sc(), `/seances/${seanceA}`, {
          matiereIds: [matiereB],
        }).expect(404);
        await call('post', sc(), '/seances/serie', {
          dateDebut: date,
          dateFin: ajouter(date, 7),
          joursSemaine: [1],
          heureDebut: H0800,
          heureFin: H0950,
          type: 'CM',
          matiereIds: [matiere1],
          salleId: salleB,
        }).expect(404);
        expect(await compter(date, ajouter(date, 7))).toBe(0);
        expect((await lister(date, date, '', tb()).expect(200)).body).toEqual(
          [],
        );
      });

      it('les salles d’un autre établissement sont introuvables, y compris à la création', async () => {
        await call('get', tb(), `/salles/${salle1}`).expect(404);
        await call('put', tb(), `/salles/${salle1}`, { code: 'PIRATE' }).expect(
          404,
        );
        await call('delete', tb(), `/salles/${salle1}`).expect(404);
        await call('post', tb(), '/salles', {
          campusId: campusA,
          code: 'PIRATE',
        }).expect(404);
        expect(
          await prisma.salle.count({ where: { id: salle1, code: 'BL100' } }),
        ).toBe(1);
        expect(
          (await call('get', tb(), '/salles').expect(200)).body.map(
            (s: { id: string }) => s.id,
          ),
        ).not.toContain(salle1);
      });

      it('un même créneau peut exister dans deux établissements sans conflit', async () => {
        const date = ajouter('2034-01-03', 0);
        await creer(base(date)).expect(201);
        // L'établissement B réserve « BL100 » (une autre salle qui porte le même code) au même horaire
        await prisma.seance.create({
          data: {
            date: new Date(date),
            heureDebut: H0800,
            heureFin: H0950,
            type: 'CM',
            creePar: adminB.user,
            salleId: salleB,
            enseignantId: ensB.enseignant,
            matieres: { create: [{ matiereId: matiereB }] },
          },
        });
        expect(await compter(date, date)).toBe(1);
        const audit = await call(
          'get',
          sc(),
          `/planning/conflits?du=${date}&au=${date}`,
        ).expect(200);
        expect(audit.body.nombre).toBe(0);
      });
    });
  },
);
