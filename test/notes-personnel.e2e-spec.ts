import { INestApplication } from '@nestjs/common';
import { Role, StatutInscription } from '@prisma/client';
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
  creerProf,
  creerStructure,
  Eleve,
  Fixtures,
  Prof,
  suivant,
} from './notes-fixtures';

describeWithTestDatabase(
  'Notes : corrections et consultation du personnel (e2e)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let close: () => Promise<void>;
    let fx: Fixtures;
    const suffix = uniqueSuffix();
    const tenants: string[] = [];
    let matiere: string;
    let matiereB: string;
    let annee: string;
    let v1: Eleve;
    let v2: Eleve;
    let suspendu: Eleve;
    let prof: Prof;
    let profB: Prof;
    let scolarite: Compte;
    let admin: Compte;
    let adminB: Compte;
    let etudiantCompte: Compte;

    const call = (
      method: 'get' | 'post' | 'patch' | 'put' | 'delete',
      token: string | undefined,
      url: string,
      body?: object,
    ) => appel(app, method, token, url, body);
    const ME = '/enseignants/me';

    /** Évaluation de `prof` avec les notes de v1 (12) et v2 (14) ; renvoie les ids de notes. */
    async function evaluation(
      options: { publier?: boolean; p?: Prof; m?: string } = {},
    ) {
      const p = options.p ?? prof;
      const m = options.m ?? matiere;
      const e = (
        await call('post', p.token, `${ME}/matieres/${m}/evaluations`, {
          nom: `Éval ${suivant()}`,
          type: 'DEVOIR',
        }).expect(201)
      ).body as { id: string };
      const eleves = m === matiere ? [v1, v2] : [];
      const saisie = eleves.length
        ? await call('put', p.token, `${ME}/evaluations/${e.id}/notes`, {
            notes: eleves.map((el, i) => ({
              inscriptionId: el.inscription,
              valeur: 12 + 2 * i,
            })),
          }).expect(200)
        : { body: { notes: [] } };
      if (options.publier) {
        await call('post', p.token, `${ME}/evaluations/${e.id}/publier`).expect(
          200,
        );
      }
      const notes = Object.fromEntries(
        saisie.body.notes.map(
          (n: { id: string; inscriptionId: string; updatedAt: string }) => [
            n.inscriptionId,
            { id: n.id, updatedAt: n.updatedAt },
          ],
        ),
      ) as Record<string, { id: string; updatedAt: string }>;
      return { id: e.id, notes };
    }

    beforeAll(async () => {
      ({ app, prisma, close } = await createE2eApp());
      fx = { app, prisma, suffix };
      const tenantA = (await createTenant(prisma, `${suffix}-a`)).id;
      const tenantB = (await createTenant(prisma, `${suffix}-b`)).id;
      tenants.push(tenantA, tenantB);

      const a = await creerStructure(fx, tenantA, 'a');
      const niveau = await a.niveau('N1');
      annee = await a.annee('A1', 2026);
      matiere = await creerMatiere(fx, niveau, annee, 'M1', 2);
      v1 = await creerEleve(fx, tenantA, niveau, annee);
      v2 = await creerEleve(fx, tenantA, niveau, annee);
      suspendu = await creerEleve(
        fx,
        tenantA,
        niveau,
        annee,
        StatutInscription.SUSPENDU,
      );
      prof = await creerProf(fx, tenantA, [matiere]);
      scolarite = await creerCompte(fx, tenantA, Role.SCOLARITE);
      admin = await creerCompte(fx, tenantA, Role.ADMIN);
      etudiantCompte = await creerCompte(fx, tenantA, Role.ETUDIANT);

      const b = await creerStructure(fx, tenantB, 'b');
      const niveauB = await b.niveau('N1');
      const anneeB = await b.annee('A1', 2026);
      matiereB = await creerMatiere(fx, niveauB, anneeB, 'MB');
      profB = await creerProf(fx, tenantB, [matiereB]);
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
      it('réservé à ADMIN et SCOLARITE : 403 pour l’enseignant et l’étudiant, 401 sans jeton', async () => {
        const routes: [Parameters<typeof call>[0], string, object?][] = [
          ['get', '/evaluations'],
          ['get', '/evaluations/x/notes'],
          ['post', '/evaluations/x/publier'],
          ['post', '/evaluations/x/depublier', { motif: 'm' }],
          ['put', '/notes/x', { motif: 'm', valeur: 1 }],
          ['get', '/notes/x/historique'],
          ['get', '/etudiants/x/releve'],
        ];
        for (const token of [prof.token, etudiantCompte.token]) {
          for (const [method, url, body] of routes) {
            await call(method, token, url, body).expect(403);
          }
        }
        for (const [method, url, body] of routes) {
          await call(method, undefined, url, body).expect(401);
        }
      });
    });

    describe('consultation et isolation par établissement', () => {
      let e: Awaited<ReturnType<typeof evaluation>>;

      beforeAll(async () => {
        e = await evaluation();
        // Une note sur une inscription devenue non VALIDE reste visible du personnel
        await prisma.note.create({
          data: {
            evaluationId: e.id,
            inscriptionId: suspendu.inscription,
            valeur: 9,
            saisiePar: prof.user,
          },
        });
      });

      it('liste les évaluations de l’établissement avec matière et créateur, filtrables', async () => {
        const toutes = (
          await call('get', scolarite.token, '/evaluations').expect(200)
        ).body;
        const trouvee = toutes.find((x: { id: string }) => x.id === e.id);
        expect(trouvee).toMatchObject({
          statut: 'BROUILLON',
          matiere: { id: matiere },
          createur: { id: prof.user },
        });
        expect(trouvee._count.notes).toBeGreaterThanOrEqual(2);
        expect(trouvee.creePar).toBeUndefined();

        const parMatiere = (
          await call(
            'get',
            admin.token,
            `/evaluations?matiereId=${matiere}`,
          ).expect(200)
        ).body;
        expect(
          parMatiere.every(
            (x: { matiereId: string }) => x.matiereId === matiere,
          ),
        ).toBe(true);
        const parAnnee = (
          await call(
            'get',
            admin.token,
            `/evaluations?anneeId=${annee}`,
          ).expect(200)
        ).body;
        expect(parAnnee.map((x: { id: string }) => x.id)).toContain(e.id);
      });

      it('la grille du personnel montre les notes, y compris d’une inscription non VALIDE', async () => {
        const { body } = await call(
          'get',
          scolarite.token,
          `/evaluations/${e.id}/notes`,
        ).expect(200);
        const parInscription = Object.fromEntries(
          body.notes.map((n: { inscriptionId: string }) => [
            n.inscriptionId,
            n,
          ]),
        );
        expect(parInscription[v1.inscription].note.valeur).toBe(12);
        expect(parInscription[suspendu.inscription]).toMatchObject({
          statutInscription: 'SUSPENDU',
          note: { valeur: 9 },
        });
        expect(body.evaluation.matiere.id).toBe(matiere);
        expect(JSON.stringify(body)).not.toContain('@example.test');
      });

      it('un membre du personnel d’un autre établissement reçoit 404 (ou rien) partout', async () => {
        const liste = (
          await call('get', adminB.token, '/evaluations').expect(200)
        ).body;
        expect(liste.map((x: { id: string }) => x.id)).not.toContain(e.id);
        await call(
          'get',
          adminB.token,
          `/evaluations?matiereId=${matiere}`,
        ).expect(404);
        await call('get', adminB.token, `/evaluations?anneeId=${annee}`).expect(
          404,
        );
        await call('get', adminB.token, `/evaluations/${e.id}/notes`).expect(
          404,
        );
        await call('post', adminB.token, `/evaluations/${e.id}/publier`).expect(
          404,
        );
        await call('post', adminB.token, `/evaluations/${e.id}/depublier`, {
          motif: 'x',
        }).expect(404);
        await call(
          'put',
          adminB.token,
          `/notes/${e.notes[v1.inscription].id}`,
          {
            valeur: 1,
            motif: 'piratage',
          },
        ).expect(404);
        await call(
          'get',
          adminB.token,
          `/notes/${e.notes[v1.inscription].id}/historique`,
        ).expect(404);
        await call(
          'get',
          adminB.token,
          `/etudiants/${v1.etudiant}/releve`,
        ).expect(404);

        const intacte = await prisma.note.findUniqueOrThrow({
          where: { id: e.notes[v1.inscription].id },
        });
        expect(intacte.valeur?.toNumber()).toBe(12);
        expect(
          await prisma.noteHistorique.count({ where: { noteId: intacte.id } }),
        ).toBe(0);
        expect(
          (await prisma.evaluation.findUniqueOrThrow({ where: { id: e.id } }))
            .statut,
        ).toBe('BROUILLON');
      });
    });

    describe('correction après publication', () => {
      let e: Awaited<ReturnType<typeof evaluation>>;
      let noteId: string;

      beforeAll(async () => {
        e = await evaluation({ publier: true });
        noteId = e.notes[v1.inscription].id;
      });

      const historique = () =>
        prisma.noteHistorique.findMany({
          where: { noteId },
          orderBy: { date: 'asc' },
        });

      it('l’enseignant est verrouillé, la scolarité corrige : note modifiée et ligne d’historique écrite', async () => {
        await call('put', prof.token, `${ME}/evaluations/${e.id}/notes`, {
          notes: [
            {
              inscriptionId: v1.inscription,
              valeur: 19,
              updatedAt: e.notes[v1.inscription].updatedAt,
            },
          ],
        }).expect(409);

        const r = await call('put', scolarite.token, `/notes/${noteId}`, {
          valeur: 16,
          motif: 'Erreur de saisie sur la copie',
          commentaire: 'Corrigée',
        }).expect(200);
        expect(r.body).toMatchObject({
          id: noteId,
          valeur: 16,
          etat: 'NOTEE',
          commentaire: 'Corrigée',
        });

        const [ligne] = await historique();
        expect(ligne).toMatchObject({
          ancienEtat: 'NOTEE',
          nouvelEtat: 'NOTEE',
          motif: 'Erreur de saisie sur la copie',
          modifiePar: scolarite.user,
        });
        expect(ligne.ancienneValeur?.toNumber()).toBe(12);
        expect(ligne.nouvelleValeur?.toNumber()).toBe(16);
        expect(ligne.date).toBeInstanceOf(Date);

        const note = await prisma.note.findUniqueOrThrow({
          where: { id: noteId },
        });
        expect(note.saisiePar).toBe(scolarite.user);
        // La correction ne change pas la publication
        expect(
          (await prisma.evaluation.findUniqueOrThrow({ where: { id: e.id } }))
            .statut,
        ).toBe('PUBLIEE');
      });

      it('le journal est consultable avec l’auteur, du plus récent au plus ancien', async () => {
        await call('put', admin.token, `/notes/${noteId}`, {
          etat: 'ABSENT',
          motif: 'Absence justifiée a posteriori',
        }).expect(200);
        const { body } = await call(
          'get',
          scolarite.token,
          `/notes/${noteId}/historique`,
        ).expect(200);
        expect(body).toHaveLength(2);
        expect(body[0]).toMatchObject({
          ancienEtat: 'NOTEE',
          nouvelEtat: 'ABSENT',
          nouvelleValeur: null,
          ancienneValeur: 16,
          motif: 'Absence justifiée a posteriori',
          auteur: { id: admin.user },
        });
        expect(body[1]).toMatchObject({
          ancienneValeur: 12,
          nouvelleValeur: 16,
        });
        expect(body[0].modifiePar).toBeUndefined();
      });

      it('refuse (400) une correction sans motif, avec un motif vide ou blanc, sans rien écrire', async () => {
        const avant = (await historique()).length;
        for (const corps of [
          { valeur: 10 },
          { valeur: 10, motif: '' },
          { valeur: 10, motif: '   ' },
          { valeur: 10, motif: 123 },
        ]) {
          const r = await call(
            'put',
            scolarite.token,
            `/notes/${noteId}`,
            corps,
          ).expect(400);
          expect(JSON.stringify(r.body.message)).toContain('motif');
        }
        expect((await historique()).length).toBe(avant);
        expect(
          (await prisma.note.findUniqueOrThrow({ where: { id: noteId } })).etat,
        ).toBe('ABSENT');
      });

      it('refuse (400) les valeurs incohérentes et l’absence de modification, sans rien écrire', async () => {
        const avant = (await historique()).length;
        await call('put', scolarite.token, `/notes/${noteId}`, {
          valeur: 25,
          motif: 'x',
        }).expect(400);
        await call('put', scolarite.token, `/notes/${noteId}`, {
          etat: 'NOTEE',
          motif: 'x',
        }).expect(400);
        await call('put', scolarite.token, `/notes/${noteId}`, {
          etat: 'ABSENT',
          valeur: 5,
          motif: 'x',
        }).expect(400);
        // Identique à l'état actuel (ABSENT, sans valeur ni commentaire)
        await call('put', scolarite.token, `/notes/${noteId}`, {
          etat: 'ABSENT',
          motif: 'rien',
        }).expect(400);
        expect((await historique()).length).toBe(avant);
      });

      it('contrôle la concurrence si updatedAt est fourni (409 périmé), sinon corrige', async () => {
        const courant = await prisma.note.findUniqueOrThrow({
          where: { id: noteId },
        });
        await call('put', scolarite.token, `/notes/${noteId}`, {
          valeur: 11,
          motif: 'Périmé',
          updatedAt: new Date(courant.updatedAt.getTime() - 1000).toISOString(),
        }).expect(409);
        await call('put', scolarite.token, `/notes/${noteId}`, {
          valeur: 11,
          motif: 'À jour',
          updatedAt: courant.updatedAt.toISOString(),
        }).expect(200);
      });

      it('deux corrections simultanées depuis le même état : une seule réussit, l’autre un 409 clair', async () => {
        const courant = await prisma.note.findUniqueOrThrow({
          where: { id: noteId },
        });
        const avant = (await historique()).length;
        const [r1, r2] = await Promise.all([
          call('put', scolarite.token, `/notes/${noteId}`, {
            valeur: 7,
            motif: 'A',
            updatedAt: courant.updatedAt.toISOString(),
          }),
          call('put', admin.token, `/notes/${noteId}`, {
            valeur: 8,
            motif: 'B',
            updatedAt: courant.updatedAt.toISOString(),
          }),
        ]);
        expect([r1.status, r2.status].sort()).toEqual([200, 409]);
        expect(JSON.stringify([r1.body, r2.body])).not.toMatch(
          /prisma|P20\d\d/i,
        );
        expect((await historique()).length).toBe(avant + 1);
      });

      it('corrige aussi une note d’une évaluation non publiée', async () => {
        const brouillon = await evaluation();
        await call(
          'put',
          scolarite.token,
          `/notes/${brouillon.notes[v2.inscription].id}`,
          {
            valeur: 3,
            motif: 'Correction avant publication',
          },
        ).expect(200);
        expect(
          await prisma.noteHistorique.count({
            where: { noteId: brouillon.notes[v2.inscription].id },
          }),
        ).toBe(1);
      });
    });

    describe('publication, dépublication et republication', () => {
      it('la scolarité publie ; sans note, c’est refusé ; une seconde publication aussi', async () => {
        const vide = (
          await call(
            'post',
            prof.token,
            `${ME}/matieres/${matiere}/evaluations`,
            {
              nom: `Vide ${suivant()}`,
              type: 'TP',
            },
          ).expect(201)
        ).body;
        const r = await call(
          'post',
          scolarite.token,
          `/evaluations/${vide.id}/publier`,
        ).expect(409);
        expect(r.body.message).toContain('rien à publier');

        const e = await evaluation();
        const publiee = await call(
          'post',
          scolarite.token,
          `/evaluations/${e.id}/publier`,
        ).expect(200);
        expect(publiee.body).toMatchObject({
          statut: 'PUBLIEE',
          createur: { id: prof.user },
        });
        await call('post', admin.token, `/evaluations/${e.id}/publier`).expect(
          409,
        );
      });

      it('dépublier exige un motif et une évaluation publiée', async () => {
        const e = await evaluation({ publier: true });
        for (const corps of [{}, { motif: '' }, { motif: '  ' }]) {
          const r = await call(
            'post',
            scolarite.token,
            `/evaluations/${e.id}/depublier`,
            corps,
          ).expect(400);
          expect(JSON.stringify(r.body.message)).toContain('motif');
        }
        expect(
          (await prisma.evaluation.findUniqueOrThrow({ where: { id: e.id } }))
            .statut,
        ).toBe('PUBLIEE');
        const brouillon = await evaluation();
        const r = await call(
          'post',
          scolarite.token,
          `/evaluations/${brouillon.id}/depublier`,
          {
            motif: 'Pas publiée',
          },
        ).expect(409);
        expect(r.body.message).toContain('n’est pas publiée');
      });

      it('dépublie (motif journalisé), rend l’évaluation à son enseignant, puis la republie', async () => {
        const e = await evaluation({ publier: true });
        const depubliee = await call(
          'post',
          scolarite.token,
          `/evaluations/${e.id}/depublier`,
          {
            motif: 'Erreur de barème',
          },
        ).expect(200);
        expect(depubliee.body).toMatchObject({
          statut: 'BROUILLON',
          publieLe: null,
        });
        const base = await prisma.evaluation.findUniqueOrThrow({
          where: { id: e.id },
        });
        expect(base.publiePar).toBeNull();

        // L'enseignant peut de nouveau corriger, puis republier lui-même
        await call('patch', prof.token, `${ME}/evaluations/${e.id}`, {
          nom: 'Après dépublication',
        }).expect(200);
        const grille = (
          await call(
            'get',
            prof.token,
            `${ME}/evaluations/${e.id}/notes`,
          ).expect(200)
        ).body;
        const ligne = grille.notes.find(
          (n: { inscriptionId: string }) => n.inscriptionId === v1.inscription,
        );
        await call('put', prof.token, `${ME}/evaluations/${e.id}/notes`, {
          notes: [
            {
              inscriptionId: v1.inscription,
              valeur: 18,
              updatedAt: ligne.note.updatedAt,
            },
          ],
        }).expect(200);
        await call(
          'post',
          prof.token,
          `${ME}/evaluations/${e.id}/publier`,
        ).expect(200);

        // Dépublication puis republication par la scolarité
        await call('post', admin.token, `/evaluations/${e.id}/depublier`, {
          motif: 'Second contrôle',
        }).expect(200);
        await call(
          'post',
          scolarite.token,
          `/evaluations/${e.id}/publier`,
        ).expect(200);

        const { body } = await call(
          'get',
          scolarite.token,
          `/evaluations/${e.id}/notes`,
        ).expect(200);
        expect(body.evaluation.statut).toBe('PUBLIEE');
        expect(
          body.publications.map((p: { action: string }) => p.action),
        ).toEqual([
          'PUBLICATION',
          'DEPUBLICATION',
          'PUBLICATION',
          'DEPUBLICATION',
          'PUBLICATION',
        ]);
        const motifs = body.publications.map(
          (p: { motif: string | null }) => p.motif,
        );
        expect(motifs).toEqual([
          null,
          'Second contrôle',
          null,
          'Erreur de barème',
          null,
        ]);
        expect(body.publications[1].auteur).toMatchObject({ id: admin.user });
      });

      it('deux dépublications simultanées : une seule réussit', async () => {
        const e = await evaluation({ publier: true });
        const [r1, r2] = await Promise.all([
          call('post', scolarite.token, `/evaluations/${e.id}/depublier`, {
            motif: 'A',
          }),
          call('post', admin.token, `/evaluations/${e.id}/depublier`, {
            motif: 'B',
          }),
        ]);
        expect([r1.status, r2.status].sort()).toEqual([200, 409]);
        expect(
          await prisma.evaluationHistorique.count({
            where: { evaluationId: e.id, action: 'DEPUBLICATION' },
          }),
        ).toBe(1);
      });

      it('l’établissement voisin n’affecte pas ses propres évaluations (contrôle croisé)', async () => {
        const eB = await evaluation({ p: profB, m: matiereB });
        await call(
          'post',
          adminB.token,
          `/evaluations/${eB.id}/publier`,
        ).expect(409); // sans note
        await call(
          'post',
          scolarite.token,
          `/evaluations/${eB.id}/publier`,
        ).expect(404);
      });
    });
  },
);
