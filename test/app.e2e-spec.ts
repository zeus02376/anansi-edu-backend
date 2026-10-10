import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/modules/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it.each(['ADMIN', 'SCOLARITE', 'ENSEIGNANT', 'ETUDIANT'])(
    'rejects anonymous registration with role %s',
    (role) => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          nom: 'Test',
          prenom: 'User',
          email: `anonymous-${role.toLowerCase()}@example.com`,
          motDePasse: 'Password123',
          role,
        })
        .expect(404);
    },
  );
});
