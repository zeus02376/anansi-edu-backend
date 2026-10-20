import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  cleanupTenant,
  createE2eApp,
  createTenant,
  describeWithTestDatabase,
  uniqueSuffix,
} from './e2e-helpers';

// Limite basse pour cette suite (défaut en production : 30 / min)
const LIMIT = 6;

describeWithTestDatabase('Limite de débit du suivi public (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const ids = {} as Record<'tenant' | 'filiere' | 'annee', string>;
  let numeroDossier: string;

  const http = () => request(app.getHttpServer());
  const suivi = (numero: string) => http().get(`/candidatures/suivi/${numero}`);
  const inconnu = (i: number) => `CAND-2026-${String(i).padStart(8, '0')}`;

  beforeAll(async () => {
    process.env.THROTTLE_SUIVI_LIMIT = String(LIMIT);
    ({ app, prisma, close } = await createE2eApp());
    ids.tenant = (await createTenant(prisma, suffix)).id;
    const ecole = await prisma.ecole.create({
      data: { tenantId: ids.tenant, nom: 'SEAS', code: 'SEAS' },
    });
    ids.filiere = (
      await prisma.filiere.create({
        data: { ecoleId: ecole.id, nom: 'ISM', code: 'ISM', cycle: 'BSC' },
      })
    ).id;
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
  });

  afterAll(async () => {
    try {
      if (prisma && ids.tenant) await cleanupTenant(prisma, ids.tenant);
    } finally {
      if (close) await close();
      delete process.env.THROTTLE_SUIVI_LIMIT;
    }
  });

  // Tests séquentiels : ils consomment le quota de suivi de l'IP de test
  it('dépôt non affecté par la limite du suivi (compteurs distincts)', async () => {
    const { body } = await http()
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
      })
      .expect(201);
    numeroDossier = body.numeroDossier;
  });

  it('un candidat qui consulte quelques fois son dossier n’est pas bloqué', async () => {
    for (let i = 0; i < 3; i++) {
      const { body } = await suivi(numeroDossier).expect(200);
      expect(body.statut).toBe('SOUMIS');
    }
  });

  it(`bloque une énumération au-delà de ${LIMIT} consultations (429)`, async () => {
    // 3 consultations déjà faites ; les numéros inconnus comptent aussi
    for (let i = 3; i < LIMIT; i++) {
      await suivi(inconnu(i)).expect(404);
    }
    const blocked = await suivi(inconnu(LIMIT)).expect(429);
    expect(blocked.body.message).toBe(
      'Trop de demandes depuis cette adresse : réessayez plus tard',
    );
    expect(blocked.headers['retry-after-suivi']).toBeDefined();
    // Même un numéro valide est alors refusé : la limite vise l'IP
    await suivi(numeroDossier).expect(429);
  });

  it('le dépôt reste possible une fois le suivi bloqué', async () => {
    await http()
      .post('/candidatures')
      .send({
        tenantId: ids.tenant,
        nom: 'Ndi',
        prenom: 'Bruno',
        email: `bruno-${suffix}@example.test`,
        dateNaissance: '2004-03-02T00:00:00.000Z',
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
        filiereId: ids.filiere,
        anneeAcademiqueId: ids.annee,
      })
      .expect(201);
  });
});
