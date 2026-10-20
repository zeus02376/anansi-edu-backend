import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
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

// 4 dépôts dans la suite (dont un 409 : les refus comptent aussi)
const LIMIT = 4;
// Limite d'upload distincte de celle du dépôt
const UPLOAD_LIMIT = 3;
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

describeWithTestDatabase('Anti-doublon et limite de débit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const uploadDir = mkdtempSync(join(tmpdir(), 'anansi-e2e-abus-'));
  const ids = {} as Record<'tenant' | 'filiere' | 'filiere2' | 'annee', string>;
  let token: string;

  const http = () => request(app.getHttpServer());
  const deposer = (override: Record<string, unknown> = {}) =>
    http()
      .post('/candidatures')
      .send({
        tenantId: ids.tenant,
        nom: 'Ndi',
        prenom: 'Amina',
        email: `amina-${suffix}@example.test`,
        dateNaissance: '2005-01-15T00:00:00.000Z',
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
        filiereId: ids.filiere,
        anneeAcademiqueId: ids.annee,
        ...override,
      });

  beforeAll(async () => {
    // Limite basse pour cette suite uniquement (process.env isolé par fichier)
    process.env.THROTTLE_PUBLIC_LIMIT = String(LIMIT);
    process.env.THROTTLE_UPLOAD_LIMIT = String(UPLOAD_LIMIT);
    process.env.UPLOAD_DIR = uploadDir;
    ({ app, prisma, close } = await createE2eApp());
    ids.tenant = (await createTenant(prisma, suffix)).id;
    const ecole = await prisma.ecole.create({
      data: { tenantId: ids.tenant, nom: 'SEAS', code: 'SEAS' },
    });
    for (const [key, code] of [
      ['filiere', 'ISM'],
      ['filiere2', 'BBA'],
    ] as const) {
      ids[key] = (
        await prisma.filiere.create({
          data: { ecoleId: ecole.id, nom: code, code, cycle: 'BSC' },
        })
      ).id;
    }
    ids.annee = (
      await prisma.anneeAcademique.create({
        data: {
          tenantId: ids.tenant,
          libelle: `E2E-${suffix}`,
          dateDebut: new Date('2026-10-01'),
          dateFin: new Date('2027-07-31'),
        },
      })
    ).id;
    const email = `scolarite-${suffix}@example.test`;
    await createUser(prisma, ids.tenant, email, 'Password123', Role.SCOLARITE);
    token = await login(app, email, 'Password123');
  });

  afterAll(async () => {
    try {
      if (prisma && ids.tenant) await cleanupTenant(prisma, ids.tenant);
    } finally {
      if (close) await close();
      delete process.env.THROTTLE_PUBLIC_LIMIT;
      delete process.env.THROTTLE_UPLOAD_LIMIT;
      delete process.env.UPLOAD_DIR;
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  // Tests séquentiels : les 4 dépôts de « anti-doublon » consomment le quota
  describe('anti-doublon', () => {
    let premiere: { id: string; numeroDossier: string };

    it('refuse une 2e candidature active (même e-mail, filière, année), casse ignorée', async () => {
      premiere = (await deposer().expect(201)).body;
      const { body } = await deposer({
        email: `AMINA-${suffix}@EXAMPLE.TEST`,
      }).expect(409);
      expect(body.message).toBe(
        'Une candidature est déjà en cours pour cet e-mail, cette filière et cette année académique',
      );
      expect(JSON.stringify(body)).not.toContain(premiere.numeroDossier);
    });

    it('accepte le même e-mail pour une autre filière', async () => {
      await deposer({ filiereId: ids.filiere2 }).expect(201);
    });

    it('accepte une nouvelle candidature une fois la précédente rejetée', async () => {
      const patch = (statut: string, commentaire?: string) =>
        http()
          .patch(`/candidatures/${premiere.id}/statut`)
          .set('Authorization', `Bearer ${token}`)
          .send({ statut, commentaire })
          .expect(200);
      await patch('EN_EXAMEN');
      await patch('REJETE', 'Dossier incomplet');
      // 4e dépôt de la suite : dernier autorisé par la limite
      await deposer().expect(201);
    });
  });

  describe('limite de débit', () => {
    it(`bloque le dépôt au-delà de ${LIMIT} requêtes (429)`, async () => {
      const { body, headers } = await deposer({
        email: `autre-${suffix}@example.test`,
      }).expect(429);
      expect(body.message).toContain('Trop de demandes');
      expect(headers['retry-after-public']).toBeDefined();
    });

    it('les refus ne créent rien en base', async () => {
      expect(
        await prisma.candidature.count({ where: { tenantId: ids.tenant } }),
      ).toBe(3);
    });

    it('n’affecte pas le suivi ni les routes du personnel', async () => {
      const [candidature] = await prisma.candidature.findMany({
        where: { tenantId: ids.tenant },
        take: 1,
      });
      await http()
        .get(`/candidatures/suivi/${candidature.numeroDossier}`)
        .expect(200);
      await http()
        .get('/candidatures')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it(`limite l’upload anonyme à ${UPLOAD_LIMIT} envois, indépendamment du dépôt, mais pas le personnel`, async () => {
      const [candidature] = await prisma.candidature.findMany({
        where: { tenantId: ids.tenant, statut: 'SOUMIS' },
        take: 1,
      });
      const upload = () =>
        http()
          .post(`/candidatures/${candidature.id}/documents`)
          .field('typeDocument', 'CNI')
          .attach('fichier', PDF, 'cni.pdf');
      // Le quota de dépôt est épuisé (429 ci-dessus) : l'upload reste possible,
      // son compteur est distinct
      for (let i = 0; i < UPLOAD_LIMIT; i++) {
        await upload()
          .field('numeroDossier', candidature.numeroDossier)
          .field('email', candidature.email)
          .expect(201);
      }
      const blocked = await upload()
        .field('numeroDossier', candidature.numeroDossier)
        .field('email', candidature.email)
        .expect(429);
      expect(blocked.headers['retry-after-upload']).toBeDefined();
      await upload().set('Authorization', `Bearer ${token}`).expect(201);
    });
  });
});
