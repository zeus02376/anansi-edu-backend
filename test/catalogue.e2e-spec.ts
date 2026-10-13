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

describeWithTestDatabase('Catalogue public (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const suffix = uniqueSuffix();
  const otherSuffix = `${suffix}-autre`;
  const tenant = `e2e-${suffix}`;
  const ids = {} as Record<
    | 'tenant'
    | 'other'
    | 'campus'
    | 'ecole'
    | 'filiere'
    | 'otherEcole'
    | 'otherFiliere'
    | 'annee',
    string
  >;
  const tokens = {} as Record<Role, string>;

  const http = () => request(app.getHttpServer());
  const pub = (path: string) => http().get(`${path}?tenant=${tenant}`);

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    ids.tenant = (await createTenant(prisma, suffix)).id;
    ids.other = (await createTenant(prisma, otherSuffix)).id;

    const campus = await prisma.campus.create({
      data: { tenantId: ids.tenant, nom: 'Logbessou' },
    });
    const ecole = await prisma.ecole.create({
      data: {
        tenantId: ids.tenant,
        nom: 'SEAS — School of Engineering and Applied Sciences',
        code: 'SEAS',
        description: 'Programmes en anglais, tutelle University of Buea',
        campusId: campus.id,
      },
    });
    const filiere = await prisma.filiere.create({
      data: {
        ecoleId: ecole.id,
        nom: 'Information Systems',
        code: 'ISM',
        cycle: 'BSC',
        langue: 'EN',
      },
    });
    const otherEcole = await prisma.ecole.create({
      data: {
        tenantId: ids.other,
        nom: 'École d’un autre établissement',
        code: 'AUTRE',
      },
    });
    const otherFiliere = await prisma.filiere.create({
      data: { ecoleId: otherEcole.id, nom: 'Autre', code: 'AUT', cycle: 'HND' },
    });
    const annee = await prisma.anneeAcademique.create({
      data: {
        tenantId: ids.tenant,
        libelle: `E2E-${suffix}`,
        dateDebut: new Date('2026-10-01T00:00:00.000Z'),
        dateFin: new Date('2027-07-31T00:00:00.000Z'),
      },
    });
    Object.assign(ids, {
      campus: campus.id,
      ecole: ecole.id,
      filiere: filiere.id,
      otherEcole: otherEcole.id,
      otherFiliere: otherFiliere.id,
      annee: annee.id,
    });

    for (const role of [Role.ENSEIGNANT, Role.ETUDIANT]) {
      const email = `${role.toLowerCase()}-${suffix}@example.test`;
      await createUser(prisma, ids.tenant, email, 'Password123', role);
      tokens[role] = await login(app, email, 'Password123');
    }
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
    }
  });

  describe('lecture publique, sans JWT', () => {
    it('liste et détail des campus', async () => {
      const list = await pub('/campus').expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({ id: ids.campus, _count: { ecoles: 1 } }),
      ]);
      const { body } = await pub(`/campus/${ids.campus}`).expect(200);
      expect(body.ecoles.map((e: { id: string }) => e.id)).toEqual([ids.ecole]);
    });

    it('liste et détail des écoles, avec leur campus', async () => {
      const list = await pub('/ecoles').expect(200);
      expect(list.body.map((e: { id: string }) => e.id)).toEqual([ids.ecole]);
      const { body } = await pub(`/ecoles/${ids.ecole}`).expect(200);
      expect(body.campus.id).toBe(ids.campus);
    });

    it('liste et détail des filières, avec école et campus imbriqués', async () => {
      const list = await pub('/filieres').expect(200);
      expect(list.body.map((f: { id: string }) => f.id)).toEqual([ids.filiere]);
      const { body } = await pub(`/filieres/${ids.filiere}`).expect(200);
      expect(body.ecole).toMatchObject({
        id: ids.ecole,
        campus: { id: ids.campus, nom: 'Logbessou' },
      });
    });

    it('n’expose pas les données d’un autre établissement', async () => {
      await pub(`/ecoles/${ids.otherEcole}`).expect(404);
      const other = await http()
        .get(`/ecoles?tenant=e2e-${otherSuffix}`)
        .expect(200);
      expect(other.body.map((e: { id: string }) => e.id)).toEqual([
        ids.otherEcole,
      ]);
    });

    it('signale un établissement inconnu (404) ou ambigu (400)', async () => {
      await http().get('/filieres?tenant=inconnu').expect(404);
      // Plusieurs tenants existent ici : sans ?tenant= le choix est ambigu
      const ambiguous = await http().get('/filieres').expect(400);
      expect(ambiguous.body.message).toContain('?tenant=');
    });
  });

  describe('écriture toujours réservée au personnel', () => {
    const writes = () =>
      [
        ['POST', '/campus', { nom: 'X' }],
        ['PUT', `/campus/${ids.campus}`, { nom: 'X' }],
        ['DELETE', `/campus/${ids.campus}`, undefined],
        ['POST', '/ecoles', { tenantId: ids.tenant, nom: 'X', code: 'X' }],
        [
          'PUT',
          `/ecoles/${ids.ecole}`,
          { tenantId: ids.tenant, nom: 'X', code: 'X' },
        ],
        ['DELETE', `/ecoles/${ids.ecole}`, undefined],
        [
          'POST',
          '/filieres',
          { ecoleId: ids.ecole, nom: 'X', code: 'X', cycle: 'HND' },
        ],
        [
          'PUT',
          `/filieres/${ids.filiere}`,
          { ecoleId: ids.ecole, nom: 'X', code: 'X', cycle: 'HND' },
        ],
        ['DELETE', `/filieres/${ids.filiere}`, undefined],
      ] as const;

    const send = (
      method: string,
      path: string,
      body: object | undefined,
      role?: Role,
    ) => {
      const req =
        http()[method.toLowerCase() as 'post' | 'put' | 'delete'](path);
      if (role) req.set('Authorization', `Bearer ${tokens[role]}`);
      return body ? req.send(body) : req;
    };

    it('refuse toute écriture anonyme (401)', async () => {
      for (const [method, path, body] of writes()) {
        await send(method, path, body).expect(401);
      }
    });

    it.each([Role.ENSEIGNANT, Role.ETUDIANT])(
      'refuse toute écriture au rôle %s (403)',
      async (role) => {
        for (const [method, path, body] of writes()) {
          await send(method, path, body, role).expect(403);
        }
      },
    );

    it('n’a rien modifié', async () => {
      expect(
        await prisma.campus.count({ where: { tenantId: ids.tenant } }),
      ).toBe(1);
      expect(
        await prisma.ecole.count({ where: { tenantId: ids.tenant } }),
      ).toBe(1);
      expect(
        await prisma.filiere.count({ where: { ecoleId: ids.ecole } }),
      ).toBe(1);
    });
  });

  describe('candidature liée à une filière', () => {
    const candidature = (override: Record<string, unknown> = {}) =>
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
    const message = (body: { message: string | string[] }) =>
      [body.message].flat().join(' ');

    it.each([
      ['absente', undefined],
      ['qui n’est pas un identifiant', 'pas-un-uuid'],
    ])('refuse une filière %s (400)', async (_label, filiereId) => {
      const { body } = await candidature({ filiereId }).expect(400);
      expect(message(body)).toContain(
        'filiereId est obligatoire et doit identifier une filière',
      );
    });

    it('refuse une filière inexistante (400, message explicite)', async () => {
      const { body } = await candidature({
        filiereId: '00000000-0000-4000-8000-000000000000',
      }).expect(400);
      expect(message(body)).toBe('Filière introuvable pour cet établissement');
    });

    it('refuse une filière d’un autre établissement (400)', async () => {
      const { body } = await candidature({
        filiereId: ids.otherFiliere,
      }).expect(400);
      expect(message(body)).toBe('Filière introuvable pour cet établissement');
    });

    it('distingue établissement et année académique introuvables', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      const tenantError = await candidature({ tenantId: unknown }).expect(400);
      expect(message(tenantError.body)).toBe('Établissement introuvable');
      const anneeError = await candidature({
        anneeAcademiqueId: unknown,
      }).expect(400);
      expect(message(anneeError.body)).toBe(
        'Année académique introuvable pour cet établissement',
      );
    });

    it('accepte une filière valide du même établissement (201)', async () => {
      const { body } = await candidature().expect(201);
      expect(body).toMatchObject({ filiereId: ids.filiere, statut: 'SOUMIS' });
    });
  });
});
