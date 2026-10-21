import { INestApplication } from '@nestjs/common';
import { Role, StatutInscription } from '@prisma/client';
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
  creerProf,
  creerStructure,
  Eleve,
  Fixtures,
  Prof,
} from './notes-fixtures';

type Corps = Record<string, unknown>;
type SeanceVue = Record<string, unknown> & { id: string; date: string };

describeWithTestDatabase(
  'Planning : affectation, publication et consultation enseignant/étudiant (e2e)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let close: () => Promise<void>;
    let fx: Fixtures;
    const suffix = uniqueSuffix();
    const tenants: string[] = [];
    let tenantA: string;

    let niveau1: string;
    let niveau2: string;
    let annee1: string;
    let annee2: string;
    let matiere1: string; // niveau 1, année 1
    let matiere2: string; // niveau 2, année 1
    let matiere1A2: string; // niveau 1, année 2
    let niveauB: string;
    let matiereB: string;
    let salle1: string;
    let profA: Prof; // affecté à matiere1
    let profB: Prof; // affecté à matiere2
    let profC: Prof; // aucune affectation
    let profD: Prof; // affecté seulement à matiere1A2 (année 2)
    let profB2: Prof; // autre établissement
    let scolarite: Compte;
    let sansProfilEtudiant: Compte;
    let sansProfilEnseignant: Compte;
    let adminB: Compte;
    let e1: Eleve & { token: string }; // niveau 1, année 1, VALIDE, Jour
    let e2: Eleve & { token: string }; // niveau 2, année 1, VALIDE, Jour
    let e3: Eleve & { token: string }; // niveau 1, année 1, VALIDE, Soir
    let e4: Eleve & { token: string }; // niveau 1, année 1, EN_ATTENTE
    let e5: Eleve & { token: string }; // niveau 1, année 1, SUSPENDU
    let e6: Eleve & { token: string }; // niveau 1, année 2, VALIDE
    let e7: Eleve & { token: string }; // niveau 1 année 1 + année 2, VALIDE
    let eB: Eleve & { token: string }; // autre établissement

    const niveauDe = () => ({
      [matiere1]: niveau1,
      [matiere2]: niveau2,
      [matiere1A2]: niveau1,
    });
    const call = (
      method: 'get' | 'post' | 'put' | 'delete',
      token: string | undefined,
      url: string,
      body?: object,
    ) => appel(app, method, token, url, body);
    const sc = () => scolarite.token;

    const ajouter = (date: string, jours: number) =>
      new Date(Date.parse(`${date}T00:00:00.000Z`) + jours * 86_400_000)
        .toISOString()
        .slice(0, 10);
    // Une date par test (tous les 3 jours) : les conflits ne fuient pas d'un test à l'autre
    let compteur = 0;
    const jour = () => ajouter('2035-01-01', 3 * compteur++);

    /** Séance de référence : matiere1, profA, 08:00–09:50, jour. */
    const corps = (date: string, surcharge: Corps = {}): Corps => ({
      date,
      heureDebut: 480,
      heureFin: 590,
      type: 'CM',
      matiereIds: [matiere1],
      enseignantId: profA.enseignant,
      ...surcharge,
    });
    const creer = (c: Corps, token = sc()) =>
      call('post', token, '/seances', c);
    const publier = (
      niveauId: string,
      du: string,
      au = du,
      extra: Corps = {},
    ) =>
      call('post', sc(), '/planning/publier', { niveauId, du, au, ...extra });
    const depublier = (
      niveauId: string,
      du: string,
      au = du,
      extra: Corps = {},
    ) =>
      call('post', sc(), '/planning/depublier', { niveauId, du, au, ...extra });

    /** Crée une séance et, par défaut, la publie (par niveau de sa première matière). */
    async function seance(
      date: string,
      surcharge: Corps = {},
      etat: 'publiee' | 'brouillon' = 'publiee',
    ): Promise<SeanceVue> {
      const c = corps(date, surcharge);
      const { body } = await creer(c).expect(201);
      if (etat === 'publiee') {
        const matiereId = (c.matiereIds as string[])[0];
        await publier(niveauDe()[matiereId], date).expect(200);
      }
      return body;
    }

    const mesSeances = async (
      token: string,
      role: 'enseignants' | 'etudiants',
      du: string,
      au = du,
    ) =>
      (
        await call(
          'get',
          token,
          `/${role}/me/seances?du=${du}&au=${au}`,
        ).expect(200)
      ).body as SeanceVue[];
    const idsEns = async (p: Prof, du: string, au = du) =>
      (await mesSeances(p.token, 'enseignants', du, au)).map((s) => s.id);
    const idsEtu = async (e: { token: string }, du: string, au = du) =>
      (await mesSeances(e.token, 'etudiants', du, au)).map((s) => s.id);

    async function eleve(
      niveauId: string,
      anneeId: string,
      statut: StatutInscription = StatutInscription.VALIDE,
      tenant = tenantA,
    ) {
      const e = await creerEleve(fx, tenant, niveauId, anneeId, statut);
      return { ...e, token: await login(app, e.email, 'Password123') };
    }

    beforeAll(async () => {
      ({ app, prisma, close } = await createE2eApp());
      fx = { app, prisma, suffix };
      tenantA = (await createTenant(prisma, `${suffix}-a`)).id;
      const tenantBId = (await createTenant(prisma, `${suffix}-b`)).id;
      tenants.push(tenantA, tenantBId);

      const campus = await prisma.campus.create({
        data: { tenantId: tenantA, nom: `Logbessou ${suffix}`, code: 'LOG' },
      });
      salle1 = (
        await prisma.salle.create({
          data: { campusId: campus.id, code: 'BL100', nom: 'Salle 100' },
        })
      ).id;

      const a = await creerStructure(fx, tenantA, 'a');
      niveau1 = await a.niveau('N1', 1);
      niveau2 = await a.niveau('N2', 2);
      annee1 = await a.annee('A1', 2026);
      annee2 = await a.annee('A2', 2027);
      matiere1 = await creerMatiere(fx, niveau1, annee1, 'M1');
      matiere2 = await creerMatiere(fx, niveau2, annee1, 'M2');
      matiere1A2 = await creerMatiere(fx, niveau1, annee2, 'M1A2');
      profA = await creerProf(fx, tenantA, [matiere1]);
      profB = await creerProf(fx, tenantA, [matiere2]);
      profC = await creerProf(fx, tenantA, []);
      profD = await creerProf(fx, tenantA, [matiere1A2]);
      scolarite = await creerCompte(fx, tenantA, Role.SCOLARITE);
      sansProfilEtudiant = await creerCompte(fx, tenantA, Role.ETUDIANT);
      sansProfilEnseignant = await creerCompte(fx, tenantA, Role.ENSEIGNANT);

      e1 = await eleve(niveau1, annee1);
      e2 = await eleve(niveau2, annee1);
      e3 = await eleve(niveau1, annee1);
      await prisma.inscription.update({
        where: { id: e3.inscription },
        data: { rythme: 'SOIR' },
      });
      e4 = await eleve(niveau1, annee1, StatutInscription.EN_ATTENTE);
      e5 = await eleve(niveau1, annee1, StatutInscription.SUSPENDU);
      e6 = await eleve(niveau1, annee2);
      e7 = await eleve(niveau1, annee1);
      await prisma.inscription.create({
        data: {
          etudiantId: e7.etudiant,
          niveauId: niveau1,
          anneeAcademiqueId: annee2,
          statut: StatutInscription.VALIDE,
          createdBy: scolarite.user,
        },
      });

      const b = await creerStructure(fx, tenantBId, 'b');
      niveauB = await b.niveau('N1', 1);
      const anneeB = await b.annee('A1', 2026);
      matiereB = await creerMatiere(fx, niveauB, anneeB, 'MB');
      profB2 = await creerProf(fx, tenantBId, [matiereB]);
      adminB = await creerCompte(fx, tenantBId, Role.ADMIN);
      eB = await eleve(niveauB, anneeB, StatutInscription.VALIDE, tenantBId);
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

    // ------------------------------------------------------------------
    describe('exigence d’affectation à la création', () => {
      const compter = (date: string) =>
        prisma.seance.count({ where: { date: new Date(date) } });

      it('refuse (409) un enseignant sans affectation sur les matières de la séance', async () => {
        const date = jour();
        const reponse = await creer(
          corps(date, { enseignantId: profC.enseignant }),
        ).expect(409);
        expect(reponse.body.message).toContain('n’est affecté à aucune');
        expect(reponse.body.message).toContain('affectez-le d’abord');
        // Un enseignant affecté à une autre matière ne suffit pas
        await creer(corps(date, { enseignantId: profB.enseignant })).expect(
          409,
        );
        expect(await compter(date)).toBe(0);
      });

      it('refuse aussi en dryRun (ce n’est pas un conflit d’horaire)', async () => {
        const date = jour();
        const reponse = await creer(
          corps(date, { enseignantId: profC.enseignant, dryRun: true }),
        ).expect(409);
        expect(reponse.body.message).toContain('n’est affecté à aucune');
        expect(reponse.body.conflits).toBeUndefined();
      });

      it('refuse une série entière, sans rien créer', async () => {
        const debut = jour();
        const fin = ajouter(debut, 14);
        const reponse = await call('post', sc(), '/seances/serie', {
          dateDebut: debut,
          dateFin: fin,
          joursSemaine: [1, 2, 3, 4, 5, 6, 7],
          heureDebut: 480,
          heureFin: 590,
          type: 'CM',
          matiereIds: [matiere1],
          enseignantId: profC.enseignant,
        }).expect(409);
        expect(reponse.body.message).toContain('n’est affecté à aucune');
        expect(
          await prisma.seance.count({
            where: { date: { gte: new Date(debut), lte: new Date(fin) } },
          }),
        ).toBe(0);
      });

      it('accepte un enseignant affecté à au moins une des matières liées', async () => {
        const date = jour();
        const { body } = await creer(
          corps(date, {
            matiereIds: [matiere1, matiere2],
            enseignantId: profB.enseignant, // affecté à matiere2 seulement
          }),
        ).expect(201);
        expect(body.matieres).toHaveLength(2);
      });

      it('exige l’affectation pour la même année académique que les matières', async () => {
        const date = jour();
        // profD est affecté à matiere1A2 (année 2), pas à matiere1 (année 1)
        await creer(corps(date, { enseignantId: profD.enseignant })).expect(
          409,
        );
        await creer(
          corps(date, {
            matiereIds: [matiere1A2],
            enseignantId: profD.enseignant,
          }),
        ).expect(201);
        // Affectation enregistrée avec une autre année que celle de la matière : refusée
        const decalee = await creerProf(fx, tenantA, []);
        await prisma.affectation.create({
          data: {
            enseignantId: decalee.enseignant,
            matiereId: matiere2,
            anneeAcademiqueId: annee2,
          },
        });
        await creer(
          corps(jour(), {
            matiereIds: [matiere2],
            enseignantId: decalee.enseignant,
          }),
        ).expect(409);
      });

      it('sans enseignant, aucun contrôle d’affectation', async () => {
        await creer(corps(jour(), { enseignantId: undefined })).expect(201);
      });

      it('un enseignant d’un autre établissement reste introuvable (404)', async () => {
        await creer(corps(jour(), { enseignantId: profB2.enseignant })).expect(
          404,
        );
      });

      it('s’applique aussi à la modification de l’enseignant ou des matières', async () => {
        const date = jour();
        const { id } = (await creer(corps(date)).expect(201)).body;
        await call('put', sc(), `/seances/${id}`, {
          enseignantId: profC.enseignant,
        }).expect(409);
        await call('put', sc(), `/seances/${id}`, {
          matiereIds: [matiere2], // profA n'est pas affecté à matiere2
        }).expect(409);
        await call('put', sc(), `/seances/${id}`, {
          enseignantId: profB.enseignant,
          matiereIds: [matiere2],
        }).expect(200);
        // Retirer l'enseignant est toujours possible
        await call('put', sc(), `/seances/${id}`, {
          enseignantId: null,
        }).expect(200);
        // Changer seulement l'horaire d'une séance déjà en place n'est pas bloqué
        await call('put', sc(), `/seances/${id}`, { heureFin: 600 }).expect(
          200,
        );
      });

      it('une modification en série refuse tout si un enseignant n’est pas affecté', async () => {
        const debut = jour();
        const serie = (
          await call('post', sc(), '/seances/serie', {
            dateDebut: debut,
            dateFin: ajouter(debut, 2),
            joursSemaine: [1, 2, 3, 4, 5, 6, 7],
            heureDebut: 480,
            heureFin: 590,
            type: 'CM',
            matiereIds: [matiere1],
            enseignantId: profA.enseignant,
          }).expect(201)
        ).body;
        await call('put', sc(), `/seances/${serie.seances[0].id}`, {
          portee: 'serie',
          enseignantId: profC.enseignant,
        }).expect(409);
        expect(
          await prisma.seance.count({
            where: { serieId: serie.serieId, enseignantId: profA.enseignant },
          }),
        ).toBe(3);
      });
    });

    // ------------------------------------------------------------------
    describe('publication', () => {
      const statuts = async (du: string, au = du) =>
        (
          await call('get', sc(), `/seances?du=${du}&au=${au}`).expect(200)
        ).body.map((s: { id: string; statut: string }) => [s.id, s.statut]);

      it('est créée en brouillon, publiée par niveau et période, sans toucher aux autres niveaux ni périodes', async () => {
        const lundi = jour();
        const mardi = ajouter(lundi, 1);
        const hors = ajouter(lundi, 2);
        const a = await seance(lundi, {}, 'brouillon');
        const b = await seance(mardi, {}, 'brouillon');
        const c = await seance(hors, {}, 'brouillon');
        const autreNiveau = await seance(
          lundi,
          { matiereIds: [matiere2], enseignantId: profB.enseignant },
          'brouillon',
        );
        expect(a.statut).toBe('BROUILLON');

        const reponse = await publier(niveau1, lundi, mardi).expect(200);
        expect(reponse.body).toMatchObject({
          action: 'PUBLICATION',
          niveauId: niveau1,
          du: lundi,
          au: mardi,
          rythme: null,
          nombre: 2,
          dejaDansCetEtat: 0,
        });
        const etats = Object.fromEntries(await statuts(lundi, hors));
        expect(etats[a.id]).toBe('PUBLIEE');
        expect(etats[b.id]).toBe('PUBLIEE');
        expect(etats[c.id]).toBe('BROUILLON'); // hors période
        expect(etats[autreNiveau.id]).toBe('BROUILLON'); // autre niveau

        // Idempotent : rien de plus à publier
        const encore = await publier(niveau1, lundi, mardi).expect(200);
        expect(encore.body).toMatchObject({ nombre: 0, dejaDansCetEtat: 2 });
      });

      it('peut se limiter à un rythme (Jour ou Soir)', async () => {
        const date = jour();
        const jourSeance = await seance(date, {}, 'brouillon');
        const soir = await seance(
          date,
          { rythme: 'SOIR', enseignantId: undefined },
          'brouillon',
        );
        const r = await publier(niveau1, date, date, { rythme: 'SOIR' }).expect(
          200,
        );
        expect(r.body).toMatchObject({ rythme: 'SOIR', nombre: 1 });
        const etats = Object.fromEntries(await statuts(date));
        expect(etats[soir.id]).toBe('PUBLIEE');
        expect(etats[jourSeance.id]).toBe('BROUILLON');
      });

      it('ignore les séances annulées jamais publiées, mais la dépublication retire aussi les annulées', async () => {
        const date = jour();
        const annulee = await seance(date, {}, 'brouillon');
        await call('post', sc(), `/seances/${annulee.id}/annuler`, {
          motif: 'Férié',
        }).expect(200);
        await publier(niveau1, date).expect(200);
        expect(Object.fromEntries(await statuts(date))[annulee.id]).toBe(
          'BROUILLON',
        );

        // Publiée puis annulée : toujours publiée (les étudiants voient l'annulation)
        const autre = await seance(ajouter(date, 1));
        await call('post', sc(), `/seances/${autre.id}/annuler`, {
          motif: 'Grève',
        }).expect(200);
        expect(
          Object.fromEntries(await statuts(ajouter(date, 1)))[autre.id],
        ).toBe('PUBLIEE');
        const r = await depublier(niveau1, ajouter(date, 1)).expect(200);
        expect(r.body).toMatchObject({ action: 'DEPUBLICATION', nombre: 1 });
        expect(
          Object.fromEntries(await statuts(ajouter(date, 1)))[autre.id],
        ).toBe('BROUILLON');
      });

      it('dépublier renvoie en brouillon, republier remet en ligne', async () => {
        const date = jour();
        const s = await seance(date);
        expect(Object.fromEntries(await statuts(date))[s.id]).toBe('PUBLIEE');
        const retiree = await depublier(niveau1, date).expect(200);
        expect(retiree.body).toMatchObject({ nombre: 1, dejaDansCetEtat: 0 });
        expect(Object.fromEntries(await statuts(date))[s.id]).toBe('BROUILLON');
        const encore = await depublier(niveau1, date).expect(200);
        expect(encore.body).toMatchObject({ nombre: 0, dejaDansCetEtat: 1 });
        await publier(niveau1, date).expect(200);
        expect(Object.fromEntries(await statuts(date))[s.id]).toBe('PUBLIEE');
      });

      it('une séance créée après la publication reste en brouillon jusqu’à la prochaine', async () => {
        const date = jour();
        await seance(date);
        const tardive = await seance(
          date,
          { heureDebut: 600, heureFin: 700, enseignantId: undefined },
          'brouillon',
        );
        expect(Object.fromEntries(await statuts(date))[tardive.id]).toBe(
          'BROUILLON',
        );
      });

      it('une séance commune à plusieurs niveaux change d’état pour tous ses niveaux', async () => {
        const date = jour();
        const commune = await seance(
          date,
          { matiereIds: [matiere1, matiere2], enseignantId: profA.enseignant },
          'brouillon',
        );
        await publier(niveau2, date).expect(200); // publiée via le niveau 2
        expect(await idsEtu(e1, date)).toEqual([commune.id]); // visible du niveau 1
        expect(await idsEtu(e2, date)).toEqual([commune.id]);
        await depublier(niveau1, date).expect(200); // retirée via le niveau 1
        expect(await idsEtu(e2, date)).toEqual([]);
      });

      it('valide la demande : niveau, période, établissement et rôles', async () => {
        const date = jour();
        for (const url of ['/planning/publier', '/planning/depublier']) {
          await call('post', sc(), url, { du: date, au: date }).expect(400);
          await call('post', sc(), url, {
            niveauId: niveau1,
            du: date,
            au: ajouter(date, -1),
          }).expect(400);
          await call('post', sc(), url, {
            niveauId: niveau1,
            du: date,
            au: ajouter(date, 400),
          }).expect(400);
          await call('post', sc(), url, {
            niveauId: niveau1,
            du: '2035-02-30',
            au: date,
          }).expect(400);
          await call('post', sc(), url, {
            niveauId: niveau1,
            du: date,
            au: date,
            rythme: 'NUIT',
          }).expect(400);
          // Niveau d'un autre établissement : 404
          await call('post', adminB.token, url, {
            niveauId: niveau1,
            du: date,
            au: date,
          }).expect(404);
          await call('post', sc(), url, {
            niveauId: niveauB,
            du: date,
            au: date,
          }).expect(404);
          for (const token of [profA.token, e1.token]) {
            await call('post', token, url, {
              niveauId: niveau1,
              du: date,
              au: date,
            }).expect(403);
          }
          await call('post', undefined, url, {}).expect(401);
        }
      });

      it('un autre établissement ne peut pas publier ni dépublier nos séances', async () => {
        const date = jour();
        const s = await seance(date, {}, 'brouillon');
        await call('post', adminB.token, '/planning/publier', {
          niveauId: niveauB,
          du: date,
          au: date,
        }).expect(200); // son propre niveau, aucune séance de A concernée
        expect(Object.fromEntries(await statuts(date))[s.id]).toBe('BROUILLON');
      });
    });

    // ------------------------------------------------------------------
    describe('enseignant : mes séances (identité du JWT)', () => {
      it('ne voit que ses séances publiées, pas celles des autres enseignants', async () => {
        const date = jour();
        const sA = await seance(date);
        const sB = await seance(date, {
          matiereIds: [matiere2],
          enseignantId: profB.enseignant,
        });
        expect(await idsEns(profA, date)).toEqual([sA.id]);
        expect(await idsEns(profB, date)).toEqual([sB.id]);
        // Un enseignant sans affectation ne voit rien, même désigné sur une séance publiée
        const seanceC = await prisma.seance.create({
          data: {
            date: new Date(date),
            heureDebut: 700,
            heureFin: 800,
            type: 'TD',
            statut: 'PUBLIEE',
            creePar: scolarite.user,
            enseignantId: profC.enseignant,
            matieres: { create: [{ matiereId: matiere1 }] },
          },
        });
        expect(await idsEns(profC, date)).toEqual([]);
        expect(await idsEns(profA, date)).not.toContain(seanceC.id);
      });

      it('exige l’affectation à la matière de chaque séance : une séance sur une matière non affectée reste invisible', async () => {
        const date = jour();
        const visible = await seance(date);
        // Séance publiée (insérée hors API, avant l'exigence) sur une matière où profA n'est pas affecté
        const horsAffectation = await prisma.seance.create({
          data: {
            date: new Date(date),
            heureDebut: 700,
            heureFin: 800,
            type: 'TD',
            statut: 'PUBLIEE',
            creePar: scolarite.user,
            enseignantId: profA.enseignant,
            matieres: { create: [{ matiereId: matiere2 }] },
          },
        });
        expect(await idsEns(profA, date)).toEqual([visible.id]);
        expect(await idsEns(profA, date)).not.toContain(horsAffectation.id);
      });

      it('un brouillon n’est jamais visible, même par l’enseignant concerné', async () => {
        const date = jour();
        const s = await seance(date, {}, 'brouillon');
        expect(await idsEns(profA, date)).toEqual([]);
        const hebdo = await call(
          'get',
          profA.token,
          '/enseignants/me/planning/hebdo?semaine=2035-W01',
        ).expect(200);
        expect(JSON.stringify(hebdo.body)).not.toContain(s.id);
        await publier(niveau1, date).expect(200);
        expect(await idsEns(profA, date)).toEqual([s.id]);
      });

      it('dépublication puis republication : la séance disparaît puis revient', async () => {
        const date = jour();
        const s = await seance(date);
        expect(await idsEns(profA, date)).toEqual([s.id]);
        await depublier(niveau1, date).expect(200);
        expect(await idsEns(profA, date)).toEqual([]);
        await publier(niveau1, date).expect(200);
        expect(await idsEns(profA, date)).toEqual([s.id]);
      });

      it('une affectation retirée fait disparaître les séances correspondantes', async () => {
        const date = jour();
        const s = await seance(date);
        const affectation = await prisma.affectation.findFirstOrThrow({
          where: { enseignantId: profA.enseignant, matiereId: matiere1 },
        });
        await prisma.affectation.delete({ where: { id: affectation.id } });
        expect(await idsEns(profA, date)).toEqual([]);
        await prisma.affectation.create({
          data: {
            enseignantId: affectation.enseignantId,
            matiereId: affectation.matiereId,
            anneeAcademiqueId: affectation.anneeAcademiqueId,
          },
        });
        expect(await idsEns(profA, date)).toEqual([s.id]);
      });

      it('une affectation d’une autre année que celle de la matière ne donne pas accès aux séances', async () => {
        const date = jour();
        const decalee = await creerProf(fx, tenantA, []);
        await prisma.affectation.create({
          data: {
            enseignantId: decalee.enseignant,
            matiereId: matiere2, // matière de l'année 1, affectation enregistrée en année 2
            anneeAcademiqueId: annee2,
          },
        });
        await prisma.seance.create({
          data: {
            date: new Date(date),
            heureDebut: 480,
            heureFin: 590,
            type: 'CM',
            statut: 'PUBLIEE',
            creePar: scolarite.user,
            enseignantId: decalee.enseignant,
            matieres: { create: [{ matiereId: matiere2 }] },
          },
        });
        expect(await idsEns(decalee, date)).toEqual([]);
      });

      it('expose des champs explicites : enseignant par nom/prénom seulement, rien d’interne', async () => {
        const date = jour();
        await seance(date, { salleId: salle1 });
        const [vue] = await mesSeances(profA.token, 'enseignants', date);
        expect(Object.keys(vue).sort()).toEqual(
          [
            'annulee',
            'date',
            'enseignant',
            'heureDebut',
            'heureFin',
            'id',
            'jourSemaine',
            'matieres',
            'rythme',
            'salle',
            'type',
          ].sort(),
        );
        expect(vue).toMatchObject({
          date,
          heureDebut: 480,
          heureFin: 590,
          type: 'CM',
          rythme: 'JOUR',
          annulee: false,
          salle: { code: 'BL100', nom: 'Salle 100', campus: { code: 'LOG' } },
          matieres: [
            { code: 'M1', niveau: { code: 'N1', filiere: { nom: 'ISM' } } },
          ],
        });
        expect(Object.keys(vue.enseignant as object).sort()).toEqual([
          'nom',
          'prenom',
        ]);
        const texte = JSON.stringify(vue);
        for (const interne of [
          'creePar',
          'serieId',
          'statut',
          'motifAnnulation',
          'userId',
          'tenantId',
          'enseignantId',
          'salleId',
          'campusId',
          scolarite.user,
          profA.user,
          profA.enseignant,
        ]) {
          expect(texte).not.toContain(interne);
        }
      });

      it('signale une séance annulée sans en donner le motif', async () => {
        const date = jour();
        const s = await seance(date);
        await call('post', sc(), `/seances/${s.id}/annuler`, {
          motif: 'Raison interne confidentielle',
        }).expect(200);
        const [vue] = await mesSeances(profA.token, 'enseignants', date);
        expect(vue.annulee).toBe(true);
        expect(JSON.stringify(vue)).not.toContain('confidentielle');
      });

      it('liste par période (bornée) et vue hebdomadaire ISO sur sept jours', async () => {
        // Semaine 2027-W05 : du lundi 2027-02-01 au dimanche 2027-02-07
        const lundi = '2027-02-01';
        const dimanche = '2027-02-07';
        const s1 = await seance(lundi, { heureDebut: 480, heureFin: 590 });
        const s2 = await seance(dimanche, { heureDebut: 480, heureFin: 590 });
        const horsSemaine = await seance(ajouter(dimanche, 1));
        const hebdo = (
          await call(
            'get',
            profA.token,
            '/enseignants/me/planning/hebdo?semaine=2027-W05',
          ).expect(200)
        ).body;
        expect(hebdo).toMatchObject({
          semaine: '2027-W05',
          du: lundi,
          au: dimanche,
        });
        expect(hebdo.jours).toHaveLength(7);
        expect(
          hebdo.jours.map((j: { jourSemaine: number }) => j.jourSemaine),
        ).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(hebdo.jours[0].seances.map((s: SeanceVue) => s.id)).toEqual([
          s1.id,
        ]);
        expect(hebdo.jours[6].seances.map((s: SeanceVue) => s.id)).toEqual([
          s2.id,
        ]);
        expect(hebdo.jours[3].seances).toEqual([]);
        expect(JSON.stringify(hebdo)).not.toContain(horsSemaine.id);

        const liste = await idsEns(profA, lundi, ajouter(dimanche, 1));
        expect(liste).toEqual([s1.id, s2.id, horsSemaine.id]);
      });

      it('valide la période et la semaine', async () => {
        const t = profA.token;
        await call('get', t, '/enseignants/me/seances').expect(400);
        await call(
          'get',
          t,
          '/enseignants/me/seances?du=2035-01-10&au=2035-01-01',
        ).expect(400);
        await call(
          'get',
          t,
          '/enseignants/me/seances?du=2035-01-01&au=2036-06-01',
        ).expect(400);
        await call('get', t, '/enseignants/me/planning/hebdo').expect(400);
        for (const semaine of ['2027-W53', '2027-W00', '2027W05', '2027-W5']) {
          await call(
            'get',
            t,
            `/enseignants/me/planning/hebdo?semaine=${semaine}`,
          ).expect(400);
        }
        const bissextile = await call(
          'get',
          t,
          '/enseignants/me/planning/hebdo?semaine=2026-W53',
        ).expect(200);
        expect(bissextile.body).toMatchObject({
          du: '2026-12-28',
          au: '2027-01-03',
        });
      });

      it('réservé aux enseignants : 401, 403 pour l’étudiant et le personnel, 404 sans profil', async () => {
        const urls = [
          '/enseignants/me/seances?du=2035-01-01&au=2035-01-07',
          '/enseignants/me/planning/hebdo?semaine=2035-W01',
        ];
        for (const url of urls) {
          await call('get', undefined, url).expect(401);
          for (const token of [e1.token, sc(), adminB.token]) {
            await call('get', token, url).expect(403);
          }
          await call('get', sansProfilEnseignant.token, url).expect(404);
        }
      });

      it('un enseignant d’un autre établissement ne voit rien des séances de celui-ci', async () => {
        const date = jour();
        await seance(date);
        expect(await idsEns(profB2, date)).toEqual([]);
      });
    });

    // ------------------------------------------------------------------
    describe('étudiant : mes séances (identité du JWT, inscriptions VALIDE)', () => {
      it('ne voit que les séances publiées de son niveau, de son année et de son rythme', async () => {
        const date = jour();
        const n1 = await seance(date); // niveau 1, année 1, Jour
        const n2 = await seance(date, {
          matiereIds: [matiere2],
          enseignantId: profB.enseignant,
        });
        const soir = await seance(date, {
          rythme: 'SOIR',
          enseignantId: undefined,
        });
        const annee2Seance = await seance(date, {
          matiereIds: [matiere1A2],
          enseignantId: profD.enseignant,
          heureDebut: 700,
          heureFin: 800,
        });
        expect(await idsEtu(e1, date)).toEqual([n1.id]);
        expect(await idsEtu(e2, date)).toEqual([n2.id]);
        expect(await idsEtu(e3, date)).toEqual([soir.id]); // Soir
        expect(await idsEtu(e6, date)).toEqual([annee2Seance.id]); // année 2
        // Deux inscriptions VALIDE (années 1 et 2) : les deux plannings
        expect(await idsEtu(e7, date)).toEqual([n1.id, annee2Seance.id]);
      });

      it('un brouillon n’est jamais visible, même de l’étudiant concerné', async () => {
        const date = jour();
        const s = await seance(date, {}, 'brouillon');
        expect(await idsEtu(e1, date)).toEqual([]);
        const hebdo = await call(
          'get',
          e1.token,
          '/etudiants/me/planning/hebdo?semaine=2035-W01',
        ).expect(200);
        expect(JSON.stringify(hebdo.body)).not.toContain(s.id);
        await publier(niveau1, date).expect(200);
        expect(await idsEtu(e1, date)).toEqual([s.id]);
      });

      it('dépublication puis republication : la séance disparaît puis revient', async () => {
        const date = jour();
        const s = await seance(date);
        expect(await idsEtu(e1, date)).toEqual([s.id]);
        await depublier(niveau1, date).expect(200);
        expect(await idsEtu(e1, date)).toEqual([]);
        await publier(niveau1, date).expect(200);
        expect(await idsEtu(e1, date)).toEqual([s.id]);
      });

      it('EN_ATTENTE et SUSPENDU ne voient rien ; l’inscription validée donne accès', async () => {
        const date = jour();
        const s = await seance(date);
        expect(await idsEtu(e4, date)).toEqual([]);
        expect(await idsEtu(e5, date)).toEqual([]);
        await prisma.inscription.update({
          where: { id: e4.inscription },
          data: { statut: 'VALIDE' },
        });
        expect(await idsEtu(e4, date)).toEqual([s.id]);
        await prisma.inscription.update({
          where: { id: e4.inscription },
          data: { statut: 'REJETE' },
        });
        expect(await idsEtu(e4, date)).toEqual([]);
        await prisma.inscription.update({
          where: { id: e4.inscription },
          data: { statut: 'EN_ATTENTE' },
        });
      });

      it('sur une séance commune, ne liste que ses propres matières', async () => {
        const date = jour();
        const commune = await seance(date, {
          matiereIds: [matiere1, matiere2],
          enseignantId: profA.enseignant,
        });
        const [vue1] = await mesSeances(e1.token, 'etudiants', date);
        const [vue2] = await mesSeances(e2.token, 'etudiants', date);
        expect(vue1.id).toBe(commune.id);
        expect(vue2.id).toBe(commune.id);
        expect(
          (vue1.matieres as { code: string }[]).map((m) => m.code),
        ).toEqual(['M1']);
        expect(
          (vue2.matieres as { code: string }[]).map((m) => m.code),
        ).toEqual(['M2']);
      });

      it('expose des champs explicites : enseignant par nom/prénom seulement, rien d’interne', async () => {
        const date = jour();
        await seance(date, { salleId: salle1 });
        const [vue] = await mesSeances(e1.token, 'etudiants', date);
        expect(Object.keys(vue).sort()).toEqual(
          [
            'annulee',
            'date',
            'enseignant',
            'heureDebut',
            'heureFin',
            'id',
            'jourSemaine',
            'matieres',
            'rythme',
            'salle',
            'type',
          ].sort(),
        );
        expect(Object.keys(vue.enseignant as object).sort()).toEqual([
          'nom',
          'prenom',
        ]);
        expect(vue.salle).toMatchObject({
          code: 'BL100',
          campus: { code: 'LOG' },
        });
        const texte = JSON.stringify(vue);
        for (const interne of [
          'creePar',
          'serieId',
          'statut',
          'motifAnnulation',
          'userId',
          'tenantId',
          'enseignantId',
          'salleId',
          'campusId',
          scolarite.user,
          profA.user,
          profA.enseignant,
        ]) {
          expect(texte).not.toContain(interne);
        }
      });

      it('une séance annulée est signalée sans motif', async () => {
        const date = jour();
        const s = await seance(date);
        await call('post', sc(), `/seances/${s.id}/annuler`, {
          motif: 'Motif interne',
        }).expect(200);
        const [vue] = await mesSeances(e1.token, 'etudiants', date);
        expect(vue.annulee).toBe(true);
        expect(JSON.stringify(vue)).not.toContain('Motif interne');
      });

      it('vue hebdomadaire ISO : sept jours, séances du bon jour', async () => {
        // Semaine 2027-W10 : du lundi 2027-03-08 au dimanche 2027-03-14
        const lundi = '2027-03-08';
        const s = await seance(ajouter(lundi, 2), {
          heureDebut: 480,
          heureFin: 590,
        });
        const hebdo = (
          await call(
            'get',
            e1.token,
            '/etudiants/me/planning/hebdo?semaine=2027-W10',
          ).expect(200)
        ).body;
        expect(hebdo).toMatchObject({
          semaine: '2027-W10',
          du: lundi,
          au: '2027-03-14',
        });
        expect(hebdo.jours).toHaveLength(7);
        expect(hebdo.jours[2].seances.map((x: SeanceVue) => x.id)).toEqual([
          s.id,
        ]);
        expect(hebdo.jours[2].jourSemaine).toBe(3);
        await call(
          'get',
          e1.token,
          '/etudiants/me/planning/hebdo?semaine=2027-W53',
        ).expect(400);
        await call('get', e1.token, '/etudiants/me/seances').expect(400);
      });

      it('un étudiant d’un autre établissement ne voit rien, et inversement', async () => {
        const date = jour();
        const s = await seance(date);
        expect(await idsEtu(eB, date)).toEqual([]);
        // Séance de l'autre établissement, publiée : invisible de nos étudiants
        const chezB = await prisma.seance.create({
          data: {
            date: new Date(date),
            heureDebut: 480,
            heureFin: 590,
            type: 'CM',
            statut: 'PUBLIEE',
            creePar: adminB.user,
            matieres: { create: [{ matiereId: matiereB }] },
          },
        });
        expect(await idsEtu(eB, date)).toEqual([chezB.id]);
        expect(await idsEtu(e1, date)).toEqual([s.id]);
      });

      it('réservé aux étudiants : 401, 403 pour l’enseignant et le personnel, 404 sans profil', async () => {
        const urls = [
          '/etudiants/me/seances?du=2035-01-01&au=2035-01-07',
          '/etudiants/me/planning/hebdo?semaine=2035-W01',
        ];
        for (const url of urls) {
          await call('get', undefined, url).expect(401);
          for (const token of [profA.token, sc(), adminB.token]) {
            await call('get', token, url).expect(403);
          }
          await call('get', sansProfilEtudiant.token, url).expect(404);
        }
      });
    });

    describe('rythme de l’inscription', () => {
      it('vaut Jour par défaut et se règle à la modification d’une inscription', async () => {
        const nouvelEleve = await creerEleve(
          fx,
          tenantA,
          niveau2,
          annee1,
          StatutInscription.VALIDE,
        );
        const inscription = await prisma.inscription.findUniqueOrThrow({
          where: { id: nouvelEleve.inscription },
        });
        expect(inscription.rythme).toBe('JOUR');
        const corpsPut = {
          etudiantId: nouvelEleve.etudiant,
          niveauId: niveau2,
          anneeAcademiqueId: annee1,
          statut: 'VALIDE',
          rythme: 'SOIR',
        };
        const { body } = await call(
          'put',
          sc(),
          `/inscriptions/${nouvelEleve.inscription}`,
          corpsPut,
        ).expect(200);
        expect(body.rythme).toBe('SOIR');
        await call('put', sc(), `/inscriptions/${nouvelEleve.inscription}`, {
          ...corpsPut,
          rythme: 'NUIT',
        }).expect(400);
        // Sans rythme dans le corps, il reste inchangé
        const { rythme, ...sansRythme } = corpsPut;
        expect(rythme).toBe('SOIR');
        await call(
          'put',
          sc(),
          `/inscriptions/${nouvelEleve.inscription}`,
          sansRythme,
        ).expect(200);
        expect(
          (
            await prisma.inscription.findUniqueOrThrow({
              where: { id: nouvelEleve.inscription },
            })
          ).rythme,
        ).toBe('SOIR');
      });

      it('apparaît dans les inscriptions de l’étudiant connecté', async () => {
        const { body } = await call(
          'get',
          e3.token,
          '/etudiants/me/inscriptions',
        ).expect(200);
        expect(body[0].rythme).toBe('SOIR');
      });
    });
  },
);
