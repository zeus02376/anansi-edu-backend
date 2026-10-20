import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { existsSync, readdirSync } from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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

const PDF = Buffer.from('%PDF-1.4\n% document de test\n%%EOF\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

describeWithTestDatabase('Documents de candidature (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const uploadDir = mkdtempSync(join(tmpdir(), 'anansi-e2e-uploads-'));
  const ids = {} as Record<'tenant' | 'other' | 'candidature', string>;
  const tokens = {} as Record<
    'admin' | 'scolarite' | 'etudiant' | 'otherAdmin',
    string
  >;
  const email = `Amina.${suffix}@Example.test`;
  let numeroDossier: string;

  const http = () => request(app.getHttpServer());
  const docs = () => `/candidatures/${ids.candidature}/documents`;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const filesOnDisk = () => {
    const dir = join(uploadDir, 'candidatures', ids.candidature);
    return existsSync(dir) ? readdirSync(dir) : [];
  };
  /** Dépôt en tant que candidat (champs texte + fichier). */
  const candidateUpload = (
    fields: Record<string, string>,
    file: Buffer | null = PDF,
    filename = 'cni.pdf',
  ) => {
    const req = http().post(docs());
    for (const [key, value] of Object.entries(fields)) req.field(key, value);
    return file ? req.attach('fichier', file, filename) : req;
  };

  beforeAll(async () => {
    process.env.UPLOAD_DIR = uploadDir;
    ({ app, prisma, close } = await createE2eApp());
    ids.tenant = (await createTenant(prisma, suffix)).id;
    ids.other = (await createTenant(prisma, `${suffix}-autre`)).id;

    const ecole = await prisma.ecole.create({
      data: { tenantId: ids.tenant, nom: 'SEAS', code: 'SEAS' },
    });
    const filiere = await prisma.filiere.create({
      data: { ecoleId: ecole.id, nom: 'ISM', code: 'ISM', cycle: 'BSC' },
    });
    const annee = await prisma.anneeAcademique.create({
      data: {
        tenantId: ids.tenant,
        libelle: `E2E-${suffix}`,
        dateDebut: new Date('2026-10-01'),
        dateFin: new Date('2027-07-31'),
      },
    });

    const users = [
      ['admin', ids.tenant, Role.ADMIN],
      ['scolarite', ids.tenant, Role.SCOLARITE],
      ['etudiant', ids.tenant, Role.ETUDIANT],
      ['otherAdmin', ids.other, Role.ADMIN],
    ] as const;
    for (const [key, tenantId, role] of users) {
      const userEmail = `${key}-${suffix}@example.test`;
      await createUser(prisma, tenantId, userEmail, 'Password123', role);
      tokens[key] = await login(app, userEmail, 'Password123');
    }

    const { body } = await http()
      .post('/candidatures')
      .send({
        tenantId: ids.tenant,
        nom: 'Ndi',
        prenom: 'Amina',
        email,
        dateNaissance: '2005-01-15T00:00:00.000Z',
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
        filiereId: filiere.id,
        anneeAcademiqueId: annee.id,
      })
      .expect(201);
    ids.candidature = body.id;
    numeroDossier = body.numeroDossier;
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
      rmSync(uploadDir, { recursive: true, force: true });
      delete process.env.UPLOAD_DIR;
    }
  });

  describe('dépôt par le candidat (numéro de dossier + e-mail)', () => {
    let documentId: string;

    it('accepte un PDF et génère urlFichier côté serveur', async () => {
      const { body } = await candidateUpload({
        typeDocument: 'CNI',
        numeroDossier,
        email: email.toLowerCase(), // e-mail comparé sans tenir compte de la casse
      }).expect(201);
      documentId = body.id;
      expect(body).toMatchObject({
        candidatureId: ids.candidature,
        typeDocument: 'CNI',
        nomFichier: 'cni.pdf',
        valide: false,
        urlFichier: `${docs()}/${body.id}/fichier`,
      });
      expect(filesOnDisk()).toEqual([`${body.id}.pdf`]);
    });

    it.each([
      ['e-mail erroné', { email: 'autre@example.test' }],
      ['numéro de dossier erroné', { numeroDossier: 'CAND-2026-00000000' }],
      ['sans preuve', { numeroDossier: undefined, email: undefined }],
    ])('refuse un dépôt avec %s (403)', async (_label, override) => {
      const fields = { typeDocument: 'CNI', numeroDossier, email, ...override };
      await candidateUpload(
        Object.fromEntries(Object.entries(fields).filter(([, v]) => v)),
      ).expect(403);
    });

    it.each([
      ['sans fichier', null, 'cni.pdf', 400],
      ['extension interdite', PDF, 'cni.exe', 400],
      [
        'contenu ne correspondant pas à l’extension',
        Buffer.from('MZ binaire'),
        'cni.pdf',
        400,
      ],
      [
        'de plus de 10 Mo',
        Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]),
        'gros.pdf',
        413,
      ],
    ] as const)(
      'refuse un fichier %s',
      async (_label, file, filename, status) => {
        await candidateUpload(
          { typeDocument: 'CNI', numeroDossier, email },
          file,
          filename,
        ).expect(status);
      },
    );

    it('refuse un type de document inconnu et un urlFichier fourni par le client (400)', async () => {
      await candidateUpload({
        typeDocument: 'PASSEPORT',
        numeroDossier,
        email,
      }).expect(400);
      await candidateUpload({
        typeDocument: 'CNI',
        numeroDossier,
        email,
        urlFichier: '/etc/passwd',
      }).expect(400);
    });

    it('n’a laissé aucun fichier orphelin après les refus', () => {
      expect(filesOnDisk()).toEqual([`${documentId}.pdf`]);
    });
  });

  describe('dépôt et gestion par le personnel', () => {
    let documentId: string;

    it('un SCOLARITE dépose avec son JWT, sans preuve candidat', async () => {
      const { body } = await http()
        .post(docs())
        .set(bearer(tokens.scolarite))
        .field('typeDocument', 'PHOTO')
        .attach('fichier', PNG, 'photo.png')
        .expect(201);
      documentId = body.id;
    });

    it('refuse un ETUDIANT (403), un JWT invalide (401) et un autre établissement (404)', async () => {
      const send = (headers: Record<string, string>) =>
        http()
          .post(docs())
          .set(headers)
          .field('typeDocument', 'CNI')
          .attach('fichier', PDF, 'cni.pdf');
      await send(bearer(tokens.etudiant)).expect(403);
      await send(bearer('jeton.invalide.x')).expect(401);
      await send(bearer(tokens.otherAdmin)).expect(404);
    });

    it('liste les documents (ADMIN/SCOLARITE uniquement, même établissement)', async () => {
      const { body } = await http()
        .get(docs())
        .set(bearer(tokens.admin))
        .expect(200);
      expect(
        body.map((d: { typeDocument: string }) => d.typeDocument).sort(),
      ).toEqual(['CNI', 'PHOTO']);
      await http().get(docs()).expect(401);
      await http().get(docs()).set(bearer(tokens.etudiant)).expect(403);
      await http().get(docs()).set(bearer(tokens.otherAdmin)).expect(404);
    });

    it('télécharge le fichier via la route protégée', async () => {
      const { body: list } = await http().get(docs()).set(bearer(tokens.admin));
      const cni = list.find(
        (d: { typeDocument: string }) => d.typeDocument === 'CNI',
      );
      const file = await http()
        .get(cni.urlFichier)
        .set(bearer(tokens.scolarite))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(file.headers['content-type']).toContain('application/pdf');
      expect(Buffer.compare(file.body, PDF)).toBe(0);
      await http().get(cni.urlFichier).expect(401);
      await http()
        .get(cni.urlFichier)
        .set(bearer(tokens.otherAdmin))
        .expect(404);
    });

    it('valide puis invalide un document avec commentaire', async () => {
      const url = `${docs()}/${documentId}/valider`;
      const ok = await http()
        .patch(url)
        .set(bearer(tokens.scolarite))
        .send({ valide: true })
        .expect(200);
      expect(ok.body).toMatchObject({ valide: true, commentaire: null });
      const ko = await http()
        .patch(url)
        .set(bearer(tokens.admin))
        .send({ valide: false, commentaire: 'Photo floue' })
        .expect(200);
      expect(ko.body).toMatchObject({
        valide: false,
        commentaire: 'Photo floue',
      });
      await http()
        .patch(url)
        .set(bearer(tokens.admin))
        .send({ valide: 'oui' })
        .expect(400);
      await http()
        .patch(url)
        .set(bearer(tokens.etudiant))
        .send({ valide: true })
        .expect(403);
      await http()
        .patch(url)
        .set(bearer(tokens.otherAdmin))
        .send({ valide: true })
        .expect(404);
    });

    it('supprime le document et son fichier', async () => {
      await http()
        .delete(`${docs()}/${documentId}`)
        .set(bearer(tokens.otherAdmin))
        .expect(404);
      await http()
        .delete(`${docs()}/${documentId}`)
        .set(bearer(tokens.admin))
        .expect(200);
      expect(filesOnDisk()).not.toContain(`${documentId}.png`);
      expect(
        await prisma.documentCandidature.count({ where: { id: documentId } }),
      ).toBe(0);
    });
  });

  it('refuse tout dépôt sur une candidature déjà décidée (409)', async () => {
    await prisma.candidature.update({
      where: { id: ids.candidature },
      data: { statut: 'REJETE' },
    });
    await candidateUpload({
      typeDocument: 'DIPLOME',
      numeroDossier,
      email,
    }).expect(409);
  });
});
