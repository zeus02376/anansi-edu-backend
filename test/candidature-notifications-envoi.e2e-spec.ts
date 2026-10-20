import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as request from 'supertest';
import { CandidatureEmailSender } from '../src/modules/candidatures/candidature-email.sender';
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

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describeWithTestDatabase('Envoi des notifications e-mail (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let tenantId: string;
  let filiereId: string;
  let anneeId: string;
  let token: string;
  let counter = 0;
  const suffix = uniqueSuffix();
  const originalWait = process.env.CANDIDATURE_EMAIL_WAIT_MS;

  const http = () => request(app.getHttpServer());
  const deposer = () =>
    http()
      .post('/candidatures')
      .send({
        tenantId,
        nom: 'Test',
        prenom: 'Amina',
        email: `candidat-${++counter}-${suffix}@example.test`,
        dateNaissance: '2005-01-15T00:00:00.000Z',
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
        filiereId,
        anneeAcademiqueId: anneeId,
      });

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    tenantId = (await createTenant(prisma, suffix)).id;
    const ecole = await prisma.ecole.create({
      data: { tenantId, nom: 'École test', code: `E2E-${suffix}` },
    });
    filiereId = (
      await prisma.filiere.create({
        data: {
          ecoleId: ecole.id,
          nom: 'Programme test',
          code: `P-${suffix}`,
          cycle: 'BTS',
        },
      })
    ).id;
    anneeId = (
      await prisma.anneeAcademique.create({
        data: {
          tenantId,
          libelle: `E2E-${suffix}`,
          dateDebut: new Date('2026-09-01T00:00:00.000Z'),
          dateFin: new Date('2027-08-31T00:00:00.000Z'),
        },
      })
    ).id;
    const email = `scolarite-${suffix}@example.test`;
    await createUser(prisma, tenantId, email, 'Password123', Role.SCOLARITE);
    token = await login(app, email, 'Password123');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalWait === undefined)
      delete process.env.CANDIDATURE_EMAIL_WAIT_MS;
    else process.env.CANDIDATURE_EMAIL_WAIT_MS = originalWait;
  });

  afterAll(async () => {
    try {
      if (prisma && tenantId) await cleanupTenant(prisma, tenantId);
    } finally {
      if (close) await close();
    }
  });

  it('marque la notification ENVOYEE quand le SMTP répond', async () => {
    const send = jest
      .spyOn(CandidatureEmailSender.prototype, 'send')
      .mockResolvedValue(undefined);
    const { body } = await deposer().expect(201);
    expect(body.notification).toMatchObject({
      statut: 'ENVOYEE',
      peutRelancer: false,
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        destinataire: body.email,
        sujet: expect.stringContaining(body.numeroDossier),
      }),
    );
    const row = await prisma.notificationCandidatureEmail.findFirstOrThrow({
      where: { candidatureId: body.id },
    });
    expect(row).toMatchObject({ statut: 'ENVOYEE', tentatives: 1 });
    expect(row.envoyeLe).not.toBeNull();
  });

  it('ne bloque pas le dépôt quand le SMTP est lent : EN_COURS puis ENVOYEE en arrière-plan', async () => {
    process.env.CANDIDATURE_EMAIL_WAIT_MS = '100';
    jest
      .spyOn(CandidatureEmailSender.prototype, 'send')
      .mockImplementation(() => pause(1500));
    const start = Date.now();
    const { body } = await deposer().expect(201);
    expect(Date.now() - start).toBeLessThan(1200);
    expect(body.notification.statut).toBe('EN_COURS');

    let statut = body.notification.statut as string;
    for (let attempt = 0; attempt < 30 && statut !== 'ENVOYEE'; attempt++) {
      await pause(200);
      statut = (
        await prisma.notificationCandidatureEmail.findFirstOrThrow({
          where: { candidatureId: body.id },
        })
      ).statut;
    }
    expect(statut).toBe('ENVOYEE');
  });

  it('enregistre l’échec du SMTP et laisse la relance aboutir ensuite', async () => {
    const send = jest
      .spyOn(CandidatureEmailSender.prototype, 'send')
      .mockRejectedValueOnce(new Error('connexion refusée'))
      .mockResolvedValue(undefined);
    const { body } = await deposer().expect(201);
    expect(body.notification).toMatchObject({
      statut: 'ECHEC',
      peutRelancer: true,
    });
    expect(
      (
        await prisma.notificationCandidatureEmail.findUniqueOrThrow({
          where: { id: body.notification.id },
        })
      ).derniereErreur,
    ).toBe('connexion refusée');

    const retry = await http()
      .post(
        `/candidatures/${body.id}/notifications/${body.notification.id}/retry`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(retry.body).toMatchObject({
      statut: 'ENVOYEE',
      peutRelancer: false,
    });
    expect(send).toHaveBeenCalledTimes(2);
    await http()
      .post(
        `/candidatures/${body.id}/notifications/${body.notification.id}/retry`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });
});
