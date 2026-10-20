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

describeWithTestDatabase(
  'Notifications et rôles des candidatures (e2e)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let close: () => Promise<void>;
    let candidatureId: string;
    let tenantId: string;
    let otherTenantId: string;
    let studentId: string;
    const suffix = uniqueSuffix();
    const originalSmtp = Object.fromEntries(
      [
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_SECURE',
        'SMTP_USER',
        'SMTP_PASSWORD',
        'SMTP_FROM',
      ].map((key) => [key, process.env[key]]),
    );
    const tokens = {} as Record<
      'admin' | 'scolarite' | 'enseignant' | 'etudiant' | 'otherAdmin',
      string
    >;

    const http = () => request(app.getHttpServer());
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const dossier = () => `/candidatures/${candidatureId}`;

    beforeAll(async () => {
      for (const key of Object.keys(originalSmtp)) delete process.env[key];
      ({ app, prisma, close } = await createE2eApp());
      tenantId = (await createTenant(prisma, suffix)).id;
      otherTenantId = (await createTenant(prisma, `${suffix}-autre`)).id;

      const ecole = await prisma.ecole.create({
        data: { tenantId, nom: 'École test', code: `E2E-${suffix}` },
      });
      const filiere = await prisma.filiere.create({
        data: {
          ecoleId: ecole.id,
          nom: 'Programme test',
          code: `P-${suffix}`,
          cycle: 'BTS',
        },
      });
      const annee = await prisma.anneeAcademique.create({
        data: {
          tenantId,
          libelle: `E2E-${suffix}`,
          dateDebut: new Date('2026-09-01T00:00:00.000Z'),
          dateFin: new Date('2027-08-31T00:00:00.000Z'),
        },
      });

      for (const [roleName, roleTenantId, role] of [
        ['admin', tenantId, Role.ADMIN],
        ['scolarite', tenantId, Role.SCOLARITE],
        ['enseignant', tenantId, Role.ENSEIGNANT],
        ['etudiant', tenantId, Role.ETUDIANT],
        ['otherAdmin', otherTenantId, Role.ADMIN],
      ] as const) {
        const email = `${roleName}-${suffix}@example.test`;
        await createUser(prisma, roleTenantId, email, 'Password123', role);
        tokens[roleName] = await login(app, email, 'Password123');
      }

      const { body } = await http()
        .post('/candidatures')
        .send({
          tenantId,
          nom: 'Test',
          prenom: 'Amina',
          email: `candidat-${suffix}@example.test`,
          dateNaissance: '2005-01-15T00:00:00.000Z',
          lieuNaissance: 'Douala',
          nationalite: 'Camerounaise',
          filiereId: filiere.id,
          anneeAcademiqueId: annee.id,
        })
        .expect(201);
      candidatureId = body.id;
      expect(body.notification.statut).toBe('ECHEC');
    });

    afterAll(async () => {
      try {
        if (prisma) {
          for (const id of [tenantId, otherTenantId]) {
            if (id) await cleanupTenant(prisma, id);
          }
        }
      } finally {
        if (close) await close();
        for (const [key, value] of Object.entries(originalSmtp)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

    it('persiste les notifications échouées et permet leur relance au personnel', async () => {
      const rows = await prisma.notificationCandidatureEmail.findMany({
        where: { candidatureId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: 'RECEPTION',
        statut: 'ECHEC',
        tentatives: 1,
      });

      for (const role of ['enseignant', 'etudiant'] as const) {
        await http()
          .post(`${dossier()}/notifications/${rows[0].id}/retry`)
          .set(auth(tokens[role]))
          .expect(403);
      }
      await http()
        .post(`${dossier()}/notifications/${rows[0].id}/retry`)
        .expect(401);
      await http()
        .post(`${dossier()}/notifications/${rows[0].id}/retry`)
        .set(auth(tokens.otherAdmin))
        .expect(404);

      const { body } = await http()
        .post(`${dossier()}/notifications/${rows[0].id}/retry`)
        .set(auth(tokens.scolarite))
        .expect(200);
      expect(body).toMatchObject({ statut: 'ECHEC', peutRelancer: true });
      expect(
        await prisma.notificationCandidatureEmail.findUniqueOrThrow({
          where: { id: rows[0].id },
        }),
      ).toMatchObject({ statut: 'ECHEC', tentatives: 2 });
    });

    it('autorise ADMIN/SCOLARITE et isole listes et détails par tenant', async () => {
      for (const role of ['admin', 'scolarite'] as const) {
        const { body: list } = await http()
          .get('/candidatures')
          .set(auth(tokens[role]))
          .expect(200);
        expect(
          list.some((item: { id: string }) => item.id === candidatureId),
        ).toBe(true);
        const { body: detail } = await http()
          .get(dossier())
          .set(auth(tokens[role]))
          .expect(200);
        expect(detail.notifications[0]).toMatchObject({
          statut: 'ECHEC',
          peutRelancer: true,
        });
      }

      await http().get('/candidatures').expect(401);
      for (const role of ['enseignant', 'etudiant'] as const) {
        await http().get('/candidatures').set(auth(tokens[role])).expect(403);
        await http().get(dossier()).set(auth(tokens[role])).expect(403);
      }
      await http().get(dossier()).set(auth(tokens.otherAdmin)).expect(404);

      const { body: otherTenantList } = await http()
        .get('/candidatures')
        .set(auth(tokens.otherAdmin))
        .expect(200);
      expect(otherTenantList).toEqual([]);
    });

    it('notifie chaque décision et réserve la conversion étudiant au bon tenant', async () => {
      await http()
        .patch(`${dossier()}/statut`)
        .set(auth(tokens.scolarite))
        .send({ statut: 'EN_EXAMEN' })
        .expect(200)
        .expect(({ body }) => {
          expect(body.notification.statut).toBe('ECHEC');
        });
      await http()
        .patch(`${dossier()}/statut`)
        .set(auth(tokens.admin))
        .send({ statut: 'ACCEPTE' })
        .expect(200);

      const notifications = await prisma.notificationCandidatureEmail.findMany({
        where: { candidatureId },
        orderBy: { createdAt: 'asc' },
      });
      expect(notifications.map(({ type }) => type)).toEqual([
        'RECEPTION',
        'CHANGEMENT_STATUT',
        'CHANGEMENT_STATUT',
      ]);
      expect(notifications.every(({ statut }) => statut === 'ECHEC')).toBe(
        true,
      );

      const payload = { candidatureId, tenantId };
      await http().post('/etudiants').send(payload).expect(401);
      for (const role of ['enseignant', 'etudiant'] as const) {
        await http()
          .post('/etudiants')
          .set(auth(tokens[role]))
          .send(payload)
          .expect(403);
      }
      await http()
        .post('/etudiants')
        .set(auth(tokens.otherAdmin))
        .send(payload)
        .expect(404);

      const { body: student } = await http()
        .post('/etudiants')
        .set(auth(tokens.scolarite))
        .send(payload)
        .expect(201);
      studentId = student.id;
      expect(student.motDePasseTemporaire).toBeTruthy();
      await http()
        .post('/etudiants')
        .set(auth(tokens.admin))
        .send(payload)
        .expect(409);

      const { body: students } = await http()
        .get('/etudiants')
        .set(auth(tokens.scolarite))
        .expect(200);
      expect(students.map((item: { id: string }) => item.id)).toContain(
        studentId,
      );
      const { body: otherStudents } = await http()
        .get('/etudiants')
        .set(auth(tokens.otherAdmin))
        .expect(200);
      expect(otherStudents).toEqual([]);
      await http()
        .get(`/etudiants/${studentId}`)
        .set(auth(tokens.otherAdmin))
        .expect(404);
    });
  },
);
