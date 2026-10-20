import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
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

describeWithTestDatabase('Suivi public d’une candidature (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let tenantId: string;
  let candidatureId: string;
  let numeroDossier: string;
  let token: string;
  const suffix = uniqueSuffix();

  const http = () => request(app.getHttpServer());
  const suivi = (numero: string) => http().get(`/candidatures/suivi/${numero}`);

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    tenantId = (await createTenant(prisma, suffix)).id;
    const ecole = await prisma.ecole.create({
      data: { tenantId, nom: 'SEAS', code: 'SEAS' },
    });
    const filiere = await prisma.filiere.create({
      data: {
        ecoleId: ecole.id,
        nom: 'B.Sc. in Information Systems Management',
        code: 'ISM',
        cycle: 'BSC',
      },
    });
    const annee = await prisma.anneeAcademique.create({
      data: {
        tenantId,
        libelle: '2026-2027',
        dateDebut: new Date('2026-10-01'),
        dateFin: new Date('2027-07-31'),
      },
    });
    const email = `scolarite-${suffix}@example.test`;
    await createUser(prisma, tenantId, email, 'Password123', Role.SCOLARITE);
    token = await login(app, email, 'Password123');

    const { body } = await http()
      .post('/candidatures')
      .send({
        tenantId,
        nom: 'Ndi',
        prenom: 'Amina',
        email: `amina-${suffix}@example.test`,
        telephone: '+237600000000',
        dateNaissance: '2005-01-15T00:00:00.000Z',
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
        filiereId: filiere.id,
        anneeAcademiqueId: annee.id,
      })
      .expect(201);
    candidatureId = body.id;
    numeroDossier = body.numeroDossier;
    await prisma.documentCandidature.create({
      data: {
        candidatureId,
        typeDocument: 'CNI',
        nomFichier: 'cni.pdf',
        urlFichier: '/x',
      },
    });
  });

  afterAll(async () => {
    try {
      if (prisma && tenantId) await cleanupTenant(prisma, tenantId);
    } finally {
      if (close) await close();
    }
  });

  it('renvoie uniquement le sous-ensemble public, sans JWT', async () => {
    const { body } = await suivi(numeroDossier).expect(200);
    expect(Object.keys(body).sort()).toEqual(
      [
        'anneeAcademique',
        'dateDepot',
        'ecole',
        'filiere',
        'id',
        'nom',
        'numeroDossier',
        'prenom',
        'statut',
      ].sort(),
    );
    expect(body).toMatchObject({
      // L'identifiant permet l'upload du candidat (qui exige aussi numéro + e-mail)
      id: candidatureId,
      numeroDossier,
      statut: 'SOUMIS',
      nom: 'Ndi',
      prenom: 'Amina',
      filiere: { nom: 'B.Sc. in Information Systems Management', code: 'ISM' },
      ecole: 'SEAS',
      anneeAcademique: '2026-2027',
    });
    const raw = JSON.stringify(body);
    for (const secret of ['@example.test', '+237', 'cni.pdf']) {
      expect(raw).not.toContain(secret);
    }
  });

  it('reflète le statut courant après une décision', async () => {
    await http()
      .patch(`/candidatures/${candidatureId}/statut`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statut: 'EN_EXAMEN' })
      .expect(200);
    const { body } = await suivi(numeroDossier).expect(200);
    expect(body.statut).toBe('EN_EXAMEN');
  });

  it.each([
    ['inconnu', 'CAND-2026-00000000'],
    ['partiel', () => numeroDossier.slice(0, -2)],
    [
      'en minuscules (correspondance exacte)',
      () => numeroDossier.toLowerCase(),
    ],
  ])('répond 404 pour un numéro %s', async (_label, numero) => {
    const value = typeof numero === 'function' ? numero() : numero;
    const { body } = await suivi(value).expect(404);
    expect(body.message).toBe(
      'Aucune candidature ne correspond à ce numéro de dossier',
    );
  });

  it('ne permet aucune liste sans numéro', async () => {
    await http().get('/candidatures/suivi').expect(401);
    await http().get('/candidatures/suivi/').expect(401);
  });
});
