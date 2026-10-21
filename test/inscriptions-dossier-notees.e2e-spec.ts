import { INestApplication } from '@nestjs/common';
import { EtatNote, Role, StatutInscription } from '@prisma/client';
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
  suivant,
} from './notes-fixtures';

describeWithTestDatabase(
  'Dossier étudiant enrichi et inscriptions notées (e2e)',
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
    let matiere: string;
    let scolarite: Compte;
    let adminB: Compte;
    let createurId: string;

    const call = (
      method: 'get' | 'put',
      token: string,
      url: string,
      body?: object,
    ) => appel(app, method, token, url, body);

    /** Élève inscrit en niveau 1 / année 1, avec ou sans note. */
    async function eleve(
      options: { note?: EtatNote; statut?: StatutInscription } = {},
    ): Promise<Eleve> {
      const e = await creerEleve(fx, tenantA, niveau1, annee1, options.statut);
      if (options.note) await noter(e, options.note);
      return e;
    }

    async function noter(e: Eleve, etat: EtatNote) {
      const evaluation = await prisma.evaluation.create({
        data: {
          matiereId: matiere,
          nom: `Éval ${suivant()}-${suffix}`,
          type: 'DEVOIR',
          creePar: createurId,
        },
      });
      return prisma.note.create({
        data: {
          evaluationId: evaluation.id,
          inscriptionId: e.inscription,
          etat,
          valeur: etat === EtatNote.NOTEE ? 12 : null,
          saisiePar: createurId,
        },
      });
    }

    /** Corps complet du PUT (le DTO est complet) ; `surcharge` change des champs. */
    const corps = (e: Eleve, surcharge: object = {}) => ({
      etudiantId: e.etudiant,
      niveauId: niveau1,
      anneeAcademiqueId: annee1,
      statut: 'VALIDE',
      fraisPayes: false,
      ...surcharge,
    });

    const lire = (id: string) =>
      prisma.inscription.findUniqueOrThrow({ where: { id } });

    beforeAll(async () => {
      ({ app, prisma, close } = await createE2eApp());
      fx = { app, prisma, suffix };
      tenantA = (await createTenant(prisma, `${suffix}-a`)).id;
      const tenantB = (await createTenant(prisma, `${suffix}-b`)).id;
      tenants.push(tenantA, tenantB);

      const a = await creerStructure(fx, tenantA, 'a');
      niveau1 = await a.niveau('N1', 1);
      niveau2 = await a.niveau('N2', 2);
      annee1 = await a.annee('A1', 2026);
      annee2 = await a.annee('A2', 2027);
      matiere = await creerMatiere(fx, niveau1, annee1, 'M1');
      scolarite = await creerCompte(fx, tenantA, Role.SCOLARITE);
      createurId = scolarite.user;
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

    describe('GET /etudiants/:id', () => {
      it('renvoie le niveau et l’année de chaque inscription, avec des champs explicites', async () => {
        const e = await eleve();
        const autre = await prisma.inscription.create({
          data: {
            etudiantId: e.etudiant,
            niveauId: niveau2,
            anneeAcademiqueId: annee2,
            statut: StatutInscription.EN_ATTENTE,
            dateInscription: new Date(Date.now() + 60_000),
            createdBy: createurId,
          },
        });

        const { body } = await call(
          'get',
          scolarite.token,
          `/etudiants/${e.etudiant}`,
        ).expect(200);

        expect(Object.keys(body).sort()).toEqual(
          [
            'candidatureId',
            'dateNaissance',
            'id',
            'inscriptions',
            'lieuNaissance',
            'matricule',
            'matriculeIuc',
            'nationalite',
            'photoUrl',
            'user',
          ].sort(),
        );
        expect(Object.keys(body.user).sort()).toEqual(
          ['email', 'id', 'nom', 'prenom'].sort(),
        );
        expect(body.inscriptions).toHaveLength(2);
        // Plus récente d'abord
        expect(body.inscriptions.map((i: { id: string }) => i.id)).toEqual([
          autre.id,
          e.inscription,
        ]);
        const [recente, ancienne] = body.inscriptions;
        expect(Object.keys(recente).sort()).toEqual(
          [
            'anneeAcademique',
            'dateInscription',
            'fraisPayes',
            'id',
            'niveau',
            'rythme',
            'statut',
          ].sort(),
        );
        expect(Object.keys(recente.niveau).sort()).toEqual(
          ['code', 'id', 'nom', 'ordre'].sort(),
        );
        expect(Object.keys(recente.anneeAcademique).sort()).toEqual(
          ['dateDebut', 'dateFin', 'id', 'libelle'].sort(),
        );
        expect(recente).toMatchObject({
          statut: 'EN_ATTENTE',
          niveau: { id: niveau2, code: 'N2', ordre: 2 },
          anneeAcademique: { id: annee2 },
        });
        expect(ancienne).toMatchObject({
          statut: 'VALIDE',
          fraisPayes: false,
          niveau: { id: niveau1, code: 'N1', nom: 'N1', ordre: 1 },
          anneeAcademique: { id: annee1 },
        });
        // Rien d'interne ne sort : ni établissement, ni auteur, ni clés étrangères
        const texte = JSON.stringify(body);
        for (const interne of [
          'tenantId',
          'userId',
          'createdBy',
          'etudiantId',
          'niveauId',
          'anneeAcademiqueId',
          'motDePasseHash',
        ]) {
          expect(texte).not.toContain(`"${interne}"`);
        }
      });

      it('étudiant sans inscription : liste vide ; autre établissement : 404', async () => {
        const e = await eleve();
        await prisma.inscription.delete({ where: { id: e.inscription } });
        const { body } = await call(
          'get',
          scolarite.token,
          `/etudiants/${e.etudiant}`,
        ).expect(200);
        expect(body.inscriptions).toEqual([]);

        await call('get', adminB.token, `/etudiants/${e.etudiant}`).expect(404);
      });
    });

    describe('PUT /inscriptions/:id sur une inscription notée', () => {
      it.each([
        ['le niveau', { niveauId: () => niveau2 }, /le niveau/],
        [
          'l’année académique',
          { anneeAcademiqueId: () => annee2 },
          /l’année académique/,
        ],
        ['le statut', { statut: () => 'SUSPENDU' }, /le statut/],
      ])(
        'refuse en 409 de modifier %s, sans rien changer',
        async (_label, changement, attendu) => {
          const e = await eleve({ note: EtatNote.NOTEE });
          const surcharge = Object.fromEntries(
            Object.entries(changement).map(([k, v]) => [k, v()]),
          );

          const reponse = await call(
            'put',
            scolarite.token,
            `/inscriptions/${e.inscription}`,
            corps(e, surcharge),
          ).expect(409);

          expect(reponse.body.message).toMatch(attendu);
          expect(reponse.body.message).toContain('porte déjà des notes');
          expect(reponse.body.message).toContain('Traitez d’abord');
          const apres = await lire(e.inscription);
          expect(apres).toMatchObject({
            niveauId: niveau1,
            anneeAcademiqueId: annee1,
            statut: 'VALIDE',
          });
        },
      );

      it('nomme tous les champs refusés quand plusieurs changent', async () => {
        const e = await eleve({ note: EtatNote.NOTEE });
        const reponse = await call(
          'put',
          scolarite.token,
          `/inscriptions/${e.inscription}`,
          corps(e, {
            niveauId: niveau2,
            anneeAcademiqueId: annee2,
            statut: 'REJETE',
          }),
        ).expect(409);
        expect(reponse.body.message).toContain(
          'le niveau, l’année académique, le statut',
        );
      });

      it('une note absente ou dispensée protège aussi l’inscription', async () => {
        for (const etat of [EtatNote.ABSENT, EtatNote.DISPENSE]) {
          const e = await eleve({ note: etat });
          await call(
            'put',
            scolarite.token,
            `/inscriptions/${e.inscription}`,
            corps(e, { niveauId: niveau2 }),
          ).expect(409);
        }
      });

      it('refuse aussi de rattacher l’inscription (et ses notes) à un autre étudiant', async () => {
        const e = await eleve({ note: EtatNote.NOTEE });
        const autre = await eleve();
        const reponse = await call(
          'put',
          scolarite.token,
          `/inscriptions/${e.inscription}`,
          corps(e, { etudiantId: autre.etudiant, anneeAcademiqueId: annee2 }),
        ).expect(409);
        expect(reponse.body.message).toContain('l’étudiant');
        expect((await lire(e.inscription)).etudiantId).toBe(e.etudiant);
      });

      it('accepte le changement des frais seuls, même notée', async () => {
        const e = await eleve({ note: EtatNote.NOTEE });
        const reponse = await call(
          'put',
          scolarite.token,
          `/inscriptions/${e.inscription}`,
          corps(e, { fraisPayes: true }),
        ).expect(200);
        expect(reponse.body.fraisPayes).toBe(true);
        expect(await lire(e.inscription)).toMatchObject({
          fraisPayes: true,
          niveauId: niveau1,
          anneeAcademiqueId: annee1,
          statut: 'VALIDE',
        });
      });

      it('accepte un corps sans statut (inchangé) et un statut identique, même notée', async () => {
        const e = await eleve({ note: EtatNote.NOTEE });
        const sansStatut = corps(e, { fraisPayes: true }) as Record<
          string,
          unknown
        >;
        delete sansStatut.statut;
        await call(
          'put',
          scolarite.token,
          `/inscriptions/${e.inscription}`,
          sansStatut,
        ).expect(200);
        await call(
          'put',
          scolarite.token,
          `/inscriptions/${e.inscription}`,
          corps(e),
        ).expect(200);
        expect((await lire(e.inscription)).statut).toBe('VALIDE');
      });

      it('le refus ne dépend que des notes : une fois la note retirée, la modification passe', async () => {
        const e = await eleve();
        const note = await noter(e, EtatNote.NOTEE);
        await call(
          'put',
          scolarite.token,
          `/inscriptions/${e.inscription}`,
          corps(e, { niveauId: niveau2 }),
        ).expect(409);

        await prisma.note.delete({ where: { id: note.id } });
        await call(
          'put',
          scolarite.token,
          `/inscriptions/${e.inscription}`,
          corps(e, { niveauId: niveau2 }),
        ).expect(200);
        expect((await lire(e.inscription)).niveauId).toBe(niveau2);
      });
    });

    describe('PUT /inscriptions/:id sur une inscription sans note', () => {
      it('accepte le changement de niveau, d’année et de statut', async () => {
        const e = await eleve();
        const reponse = await call(
          'put',
          scolarite.token,
          `/inscriptions/${e.inscription}`,
          corps(e, {
            niveauId: niveau2,
            anneeAcademiqueId: annee2,
            statut: 'SUSPENDU',
            fraisPayes: true,
          }),
        ).expect(200);
        expect(reponse.body).toMatchObject({
          niveauId: niveau2,
          anneeAcademiqueId: annee2,
          statut: 'SUSPENDU',
          fraisPayes: true,
        });
      });

      it('les notes d’une autre inscription du même étudiant ne bloquent pas celle-ci', async () => {
        const e = await eleve({ note: EtatNote.NOTEE });
        const deuxieme = await prisma.inscription.create({
          data: {
            etudiantId: e.etudiant,
            niveauId: niveau1,
            anneeAcademiqueId: annee2,
            createdBy: createurId,
          },
        });
        await call('put', scolarite.token, `/inscriptions/${deuxieme.id}`, {
          etudiantId: e.etudiant,
          niveauId: niveau2,
          anneeAcademiqueId: annee2,
          statut: 'VALIDE',
        }).expect(200);
      });

      it('inscription inconnue ou d’un autre établissement : 404', async () => {
        const e = await eleve();
        await call(
          'put',
          adminB.token,
          `/inscriptions/${e.inscription}`,
          corps(e),
        ).expect(404);
      });
    });
  },
);
