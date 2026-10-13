import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/modules/prisma/prisma.service';

const testDatabaseUrl = process.env.E2E_DATABASE_URL;
const describeWithTestDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithTestDatabase('Account onboarding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string | undefined;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adminEmail = `admin-${suffix}@example.test`;
  const scolariteEmail = `scolarite-${suffix}@example.test`;
  const teacherEmail = `enseignant-${suffix}@example.test`;
  const studentEmail = `etudiant-${suffix}@example.test`;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const initialPassword = 'InitialPassword123';

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(moduleFixture.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      if (prisma && tenantId) {
        await prisma.historiqueCandidature.deleteMany({
          where: { candidature: { tenantId } },
        });
        await prisma.etudiant.deleteMany({ where: { tenantId } });
        await prisma.documentCandidature.deleteMany({
          where: { candidature: { tenantId } },
        });
        await prisma.candidature.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.filiere.deleteMany({
          where: { ecole: { tenantId } },
        });
        await prisma.ecole.deleteMany({ where: { tenantId } });
        await prisma.anneeAcademique.deleteMany({ where: { tenantId } });
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
      }
    } finally {
      if (app) {
        await app.close();
      }
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it('creates staff and completes application-to-student password setup', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        nom: `Test ${suffix}`,
        slug: `e2e-${suffix}`,
        pays: 'Cameroun',
        ville: 'Douala',
      },
    });
    tenantId = tenant.id;
    const school = await prisma.ecole.create({
      data: { tenantId, nom: 'Test School', code: `E2E-${suffix}` },
    });
    const filiere = await prisma.filiere.create({
      data: {
        ecoleId: school.id,
        nom: 'Test Program',
        code: `P-${suffix}`,
        cycle: 'BTS',
        regime: 'NATIONAL',
        langue: 'FR',
        dureeAnnees: 2,
        tutelle: 'Test',
      },
    });
    const academicYear = await prisma.anneeAcademique.create({
      data: {
        tenantId,
        libelle: `E2E-${suffix}`,
        dateDebut: new Date('2026-09-01T00:00:00.000Z'),
        dateFin: new Date('2027-08-31T00:00:00.000Z'),
      },
    });
    await prisma.user.create({
      data: {
        tenantId,
        nom: 'Admin',
        prenom: 'Test',
        email: adminEmail,
        motDePasseHash: await bcrypt.hash(initialPassword, 12),
        role: Role.ADMIN,
      },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, motDePasse: initialPassword })
      .expect(201);
    const adminToken = adminLogin.body.access_token as string;

    for (const [role, email] of [
      ['SCOLARITE', scolariteEmail],
      ['ENSEIGNANT', teacherEmail],
    ] as const) {
      await request(app.getHttpServer())
        .post('/auth/create-staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nom: 'Test',
          prenom: role,
          email,
          motDePasse: initialPassword,
          role,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, motDePasse: initialPassword })
        .expect(201)
        .expect(({ body }) => expect(body.user.role).toBe(role));
    }

    const scolariteLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: scolariteEmail, motDePasse: initialPassword })
      .expect(201);
    const scolariteToken = scolariteLogin.body.access_token as string;

    const application = await request(app.getHttpServer())
      .post('/candidatures')
      .send({
        tenantId,
        nom: 'Student',
        prenom: 'Test',
        email: studentEmail,
        dateNaissance: '2005-02-03T00:00:00.000Z',
        lieuNaissance: 'Douala',
        nationalite: 'Camerounaise',
        filiereId: filiere.id,
        anneeAcademiqueId: academicYear.id,
      })
      .expect(201);

    // Transition imposée : SOUMIS → EN_EXAMEN → ACCEPTE
    for (const statut of ['EN_EXAMEN', 'ACCEPTE']) {
      await request(app.getHttpServer())
        .patch(`/candidatures/${application.body.id}/statut`)
        .set('Authorization', `Bearer ${scolariteToken}`)
        .send({ statut })
        .expect(200);
    }

    const student = await request(app.getHttpServer())
      .post('/etudiants')
      .set('Authorization', `Bearer ${scolariteToken}`)
      .send({ candidatureId: application.body.id, tenantId })
      .expect(201);
    expect(student.body.matricule).toBeTruthy();
    expect(student.body.motDePasseTemporaire).toMatch(/^[A-Za-z2-9]{10}$/);

    const studentLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: studentEmail,
        motDePasse: student.body.motDePasseTemporaire,
      })
      .expect(201);
    expect(studentLogin.body.user.doitChangerMotDePasse).toBe(true);

    const newPassword = 'StudentPassword123';
    await request(app.getHttpServer())
      .patch('/auth/change-password')
      .set('Authorization', `Bearer ${studentLogin.body.access_token}`)
      .send({
        motDePasseActuel: student.body.motDePasseTemporaire,
        nouveauMotDePasse: newPassword,
      })
      .expect(200);

    const updatedLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: studentEmail, motDePasse: newPassword })
      .expect(201);
    expect(updatedLogin.body.user.doitChangerMotDePasse).toBe(false);
  });
});
