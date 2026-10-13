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

describeWithTestDatabase('GET /filieres/suggestions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let tenantId: string;
  const suffix = uniqueSuffix();
  const campus = {} as Record<'logbessou' | 'bonamoussadi', string>;

  /** Codes des filières renvoyées (triées par nom côté API). */
  const codes = async (params: Record<string, string> = {}) => {
    const { body } = await request(app.getHttpServer())
      .get('/filieres/suggestions')
      .query({ tenant: `e2e-${suffix}`, ...params })
      .expect(200);
    return (body as { code: string }[]).map((f) => f.code).sort();
  };

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    tenantId = (await createTenant(prisma, suffix)).id;
    campus.logbessou = (
      await prisma.campus.create({ data: { tenantId, nom: 'Logbessou' } })
    ).id;
    campus.bonamoussadi = (
      await prisma.campus.create({ data: { tenantId, nom: 'Bonamoussadi' } })
    ).id;

    const seas = await prisma.ecole.create({
      data: {
        tenantId,
        nom: 'SEAS — School of Engineering and Applied Sciences',
        code: 'SEAS',
        description: 'Programmes en anglais, tutelle University of Buea',
        campusId: campus.logbessou,
      },
    });
    const esta = await prisma.ecole.create({
      data: {
        tenantId,
        nom: 'ESTA',
        code: 'ESTA',
        description: 'Technologies appliquées',
        campusId: campus.bonamoussadi,
      },
    });
    const filieres = [
      [
        seas.id,
        'ISM',
        'B.Sc. in Information Systems Management',
        'EN',
        'GCE A Level',
      ],
      [
        seas.id,
        'HND-EEE',
        'HND in Electrical and Electronics Engineering',
        'EN',
        'GCE O Level',
      ],
      [esta.id, 'LIC-INFO', 'Licence en Informatique', 'FR', 'Baccalauréat'],
      [esta.id, 'BIL', 'Licence bilingue Gestion', 'FR_EN', 'Baccalauréat'],
      [esta.id, 'MIN', 'Filière minimale', null, null],
    ] as const;
    for (const [ecoleId, code, nom, langue, niveauEntree] of filieres) {
      await prisma.filiere.create({
        data: { ecoleId, code, nom, cycle: 'HND', langue, niveauEntree },
      });
    }
  });

  afterAll(async () => {
    try {
      if (prisma && tenantId) await cleanupTenant(prisma, tenantId);
    } finally {
      if (close) await close();
    }
  });

  it('est public et renvoie école et campus imbriqués', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/filieres/suggestions?tenant=e2e-${suffix}&motCle=ISM`)
      .expect(200);
    expect(body).toEqual([
      expect.objectContaining({
        code: 'ISM',
        ecole: expect.objectContaining({
          code: 'SEAS',
          campus: expect.objectContaining({ nom: 'Logbessou' }),
        }),
      }),
    ]);
  });

  it('sans filtre : toutes les filières de l’établissement', async () => {
    expect(await codes()).toEqual(['BIL', 'HND-EEE', 'ISM', 'LIC-INFO', 'MIN']);
  });

  describe('chaque filtre seul', () => {
    it('langue : inclut les filières bilingues', async () => {
      expect(await codes({ langue: 'EN' })).toEqual(['BIL', 'HND-EEE', 'ISM']);
      expect(await codes({ langue: 'FR' })).toEqual(['BIL', 'LIC-INFO']);
    });

    it('niveauEntree : partiel et insensible à la casse', async () => {
      expect(await codes({ niveauEntree: 'gce' })).toEqual(['HND-EEE', 'ISM']);
      expect(await codes({ niveauEntree: 'a level' })).toEqual(['ISM']);
      expect(await codes({ niveauEntree: 'BACCALAUR' })).toEqual([
        'BIL',
        'LIC-INFO',
      ]);
    });

    it('motCle : nom et code de la filière', async () => {
      expect(await codes({ motCle: 'informati' })).toEqual(['ISM', 'LIC-INFO']);
      expect(await codes({ motCle: 'eee' })).toEqual(['HND-EEE']);
    });

    it('motCle : nom et description de l’école', async () => {
      expect(await codes({ motCle: 'buea' })).toEqual(['HND-EEE', 'ISM']);
      expect(await codes({ motCle: 'engineering' })).toEqual([
        'HND-EEE',
        'ISM',
      ]);
      expect(await codes({ motCle: 'technologies' })).toEqual([
        'BIL',
        'LIC-INFO',
        'MIN',
      ]);
    });

    it('campusId', async () => {
      expect(await codes({ campusId: campus.logbessou })).toEqual([
        'HND-EEE',
        'ISM',
      ]);
      expect(await codes({ campusId: campus.bonamoussadi })).toEqual([
        'BIL',
        'LIC-INFO',
        'MIN',
      ]);
    });
  });

  describe('filtres combinés', () => {
    it('langue + motCle', async () => {
      expect(await codes({ langue: 'FR', motCle: 'licence' })).toEqual([
        'BIL',
        'LIC-INFO',
      ]);
      expect(await codes({ langue: 'EN', motCle: 'buea' })).toEqual([
        'HND-EEE',
        'ISM',
      ]);
    });

    it('langue + niveauEntree + campusId', async () => {
      expect(
        await codes({
          langue: 'EN',
          niveauEntree: 'o level',
          campusId: campus.logbessou,
        }),
      ).toEqual(['HND-EEE']);
    });

    it('les quatre filtres ensemble', async () => {
      expect(
        await codes({
          langue: 'EN',
          niveauEntree: 'gce',
          motCle: 'information',
          campusId: campus.logbessou,
        }),
      ).toEqual(['ISM']);
    });
  });

  describe('aucun résultat : liste vide, pas d’erreur', () => {
    it.each([
      [{ motCle: 'médecine' }],
      [{ niveauEntree: 'doctorat' }],
      [{ langue: 'FR', campusId: '00000000-0000-4000-8000-000000000000' }],
    ])('%j', async (params) => {
      expect(await codes(params)).toEqual([]);
    });

    it('un paramètre vide est ignoré', async () => {
      expect(
        await codes({
          motCle: '   ',
          niveauEntree: '',
          langue: '',
          campusId: '',
        }),
      ).toHaveLength(5);
    });
  });

  describe('paramètres invalides (400)', () => {
    it.each([
      [{ langue: 'DE' }],
      [{ langue: 'FR_EN' }],
      [{ campusId: 'pas-un-uuid' }],
      [{ inconnu: 'x' }],
    ])('%j', async (params) => {
      await request(app.getHttpServer())
        .get('/filieres/suggestions')
        .query({ tenant: `e2e-${suffix}`, ...params })
        .expect(400);
    });
  });
});
