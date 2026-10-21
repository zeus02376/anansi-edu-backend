import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  cleanupTenant,
  createE2eApp,
  createTenant,
  describeWithTestDatabase,
  uniqueSuffix,
} from './e2e-helpers';
import { appel, Compte, creerCompte, creerStructure } from './notes-fixtures';

describeWithTestDatabase('Niveaux : filière de chaque niveau (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const tenants: string[] = [];
  let scolarite: Compte;
  let niveauA: string;
  let niveauAutreFiliere: string;
  let niveauB: string;

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    const fx = { app, prisma, suffix };
    const tenantA = (await createTenant(prisma, `${suffix}-a`)).id;
    const tenantB = (await createTenant(prisma, `${suffix}-b`)).id;
    tenants.push(tenantA, tenantB);

    const a = await creerStructure(fx, tenantA, 'a');
    niveauA = await a.niveau('L1');
    // Deuxième filière du même établissement, avec le même code de niveau
    const ecole = await prisma.ecole.findFirstOrThrow({
      where: { tenantId: tenantA },
    });
    const autre = await prisma.filiere.create({
      data: { ecoleId: ecole.id, nom: 'Gestion', code: 'GES', cycle: 'BSC' },
    });
    niveauAutreFiliere = (
      await prisma.niveau.create({
        data: { filiereId: autre.id, nom: 'L1', code: 'L1', ordre: 1 },
      })
    ).id;
    const b = await creerStructure(fx, tenantB, 'b');
    niveauB = await b.niveau('L1');
    scolarite = await creerCompte(fx, tenantA, Role.SCOLARITE);
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

  it('GET /niveaux renvoie la filière (id, nom, code) de chaque niveau, de l’établissement seulement', async () => {
    const { body } = await appel(
      app,
      'get',
      scolarite.token,
      '/niveaux',
    ).expect(200);
    const ids = body.map((n: { id: string }) => n.id);
    expect(ids).toEqual(expect.arrayContaining([niveauA, niveauAutreFiliere]));
    expect(ids).not.toContain(niveauB);

    const premier = body.find((n: { id: string }) => n.id === niveauA);
    const second = body.find(
      (n: { id: string }) => n.id === niveauAutreFiliere,
    );
    expect(Object.keys(premier.filiere).sort()).toEqual(['code', 'id', 'nom']);
    expect(premier.filiere).toMatchObject({ nom: 'ISM' });
    expect(second.filiere).toMatchObject({ nom: 'Gestion', code: 'GES' });
    // Deux « L1 » restent distinguables par leur filière
    expect(premier.filiere.id).not.toBe(second.filiere.id);
  });

  it('GET /niveaux/:id renvoie aussi la filière ; autre établissement : 404', async () => {
    const { body } = await appel(
      app,
      'get',
      scolarite.token,
      `/niveaux/${niveauAutreFiliere}`,
    ).expect(200);
    expect(body.filiere).toMatchObject({ nom: 'Gestion', code: 'GES' });
    await appel(app, 'get', scolarite.token, `/niveaux/${niveauB}`).expect(404);
  });
});
