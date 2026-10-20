import { resolveAnnee, seedAnnee } from '../prisma/seed-annee';
import { SeedError } from '../prisma/seed-utils';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  cleanupTenant,
  createE2eApp,
  createTenant,
  describeWithTestDatabase,
  uniqueSuffix,
} from './e2e-helpers';

describeWithTestDatabase('Seed année académique (e2e)', () => {
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let tenantId: string;
  const extraTenants: string[] = [];
  const suffix = uniqueSuffix();
  const silent = () => undefined;

  const freshTenant = async (label: string) => {
    const tenant = await createTenant(prisma, `${suffix}-${label}`);
    extraTenants.push(tenant.id);
    return tenant.id;
  };

  beforeAll(async () => {
    ({ prisma, close } = await createE2eApp());
    tenantId = (await createTenant(prisma, suffix)).id;
  });

  afterAll(async () => {
    try {
      if (prisma) {
        for (const id of [tenantId, ...extraTenants]) {
          if (id) await cleanupTenant(prisma, id);
        }
      }
    } finally {
      if (close) await close();
    }
  });

  it('crée une année active puis ne modifie rien à la relance', async () => {
    const first = await seedAnnee(prisma, tenantId, silent);
    const afterFirstRun = await prisma.anneeAcademique.findMany({
      where: { tenantId, active: true },
    });
    expect(afterFirstRun).toHaveLength(1);
    expect(afterFirstRun[0]).toMatchObject({
      id: first.id,
      libelle: `${new Date().getUTCFullYear()}`,
      active: true,
    });
    expect(afterFirstRun[0].dateDebut.toISOString()).toBe(
      `${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`,
    );
    expect(afterFirstRun[0].dateFin.toISOString()).toBe(
      `${new Date().getUTCFullYear()}-12-31T00:00:00.000Z`,
    );

    const lines: string[] = [];
    const second = await seedAnnee(prisma, tenantId, (line) =>
      lines.push(line),
    );
    expect(second).toEqual(first);
    expect(
      await prisma.anneeAcademique.findMany({
        where: { tenantId, active: true },
      }),
    ).toEqual(afterFirstRun);
    expect(lines.join('\n')).toContain('rien n’a été modifié');
  });

  it('préserve une année active déjà présente', async () => {
    // Tenant dédié : celui du test précédent possède déjà une année active
    const ownTenantId = await freshTenant('preexistante');
    const before = await prisma.anneeAcademique.create({
      data: {
        tenantId: ownTenantId,
        libelle: 'Année préexistante',
        dateDebut: new Date('2025-09-01T00:00:00.000Z'),
        dateFin: new Date('2026-08-31T00:00:00.000Z'),
        active: true,
      },
    });
    const result = await seedAnnee(prisma, ownTenantId, silent);

    expect(result.id).toBe(before.id);
    expect(
      await prisma.anneeAcademique.findMany({
        where: { tenantId: ownTenantId, active: true },
      }),
    ).toEqual([before]);
  });

  describe('valeurs par défaut et configuration', () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    const range = (config = {}) => {
      const { libelle, dateDebut, dateFin } = resolveAnnee(config, now);
      return [libelle, dateDebut.toISOString(), dateFin.toISOString()];
    };

    it('par défaut : année civile en cours', () => {
      expect(range()).toEqual([
        '2026',
        '2026-01-01T00:00:00.000Z',
        '2026-12-31T00:00:00.000Z',
      ]);
    });

    it('un libellé « AAAA-AAAA » sans dates : du 1er septembre au 31 juillet', () => {
      expect(range({ libelle: '2026-2027' })).toEqual([
        '2026-2027',
        '2026-09-01T00:00:00.000Z',
        '2027-07-31T00:00:00.000Z',
      ]);
    });

    it('un libellé « AAAA » : année civile correspondante', () => {
      expect(range({ libelle: '2027' })[1]).toBe('2027-01-01T00:00:00.000Z');
    });

    it('les dates explicites l’emportent sur les valeurs dérivées', () => {
      expect(
        range({
          libelle: '2026-2027',
          dateDebut: '2026-10-20',
          dateFin: '2027-10-19',
        }),
      ).toEqual([
        '2026-2027',
        '2026-10-20T00:00:00.000Z',
        '2027-10-19T00:00:00.000Z',
      ]);
    });

    it.each([
      [{ dateDebut: 'pas-une-date' }, 'SEED_ANNEE_DATE_DEBUT invalide'],
      [{ dateFin: '2026-13-45' }, 'SEED_ANNEE_DATE_FIN invalide'],
      [
        { dateDebut: '2026-10-20', dateFin: '2026-10-20' },
        'doit être postérieure',
      ],
      [
        { dateDebut: '2027-01-01', dateFin: '2026-01-01' },
        'doit être postérieure',
      ],
    ])('refuse une configuration invalide %j', (config, message) => {
      expect(() => resolveAnnee(config, now)).toThrow(message);
    });

    it('crée l’année configurée en base', async () => {
      const id = await freshTenant('config');
      await seedAnnee(prisma, id, silent, {
        libelle: '2026-2027',
        dateDebut: '2026-10-20',
        dateFin: '2027-10-19',
      });
      const [annee] = await prisma.anneeAcademique.findMany({
        where: { tenantId: id },
      });
      expect(annee).toMatchObject({ libelle: '2026-2027', active: true });
      expect(annee.dateDebut.toISOString()).toBe('2026-10-20T00:00:00.000Z');
      expect(annee.dateFin.toISOString()).toBe('2027-10-19T00:00:00.000Z');
    });

    it('une configuration invalide ne crée rien', async () => {
      const id = await freshTenant('invalide');
      await expect(
        seedAnnee(prisma, id, silent, { dateDebut: 'n’importe quoi' }),
      ).rejects.toThrow(SeedError);
      expect(
        await prisma.anneeAcademique.count({ where: { tenantId: id } }),
      ).toBe(0);
    });
  });

  describe('garde-fous', () => {
    it('une année inactive de même libellé n’est ni dupliquée ni modifiée', async () => {
      const id = await freshTenant('inactive');
      const inactive = await prisma.anneeAcademique.create({
        data: {
          tenantId: id,
          libelle: '2026-2027',
          dateDebut: new Date('2026-09-01'),
          dateFin: new Date('2027-07-31'),
          active: false,
        },
      });
      await expect(
        seedAnnee(prisma, id, silent, { libelle: '2026-2027' }),
      ).rejects.toThrow('existe déjà mais n’est pas active');
      expect(
        await prisma.anneeAcademique.findMany({ where: { tenantId: id } }),
      ).toEqual([inactive]);
    });

    it('une année inactive d’un autre libellé n’empêche pas la création', async () => {
      const id = await freshTenant('ancienne');
      const old = await prisma.anneeAcademique.create({
        data: {
          tenantId: id,
          libelle: '2025-2026',
          dateDebut: new Date('2025-09-01'),
          dateFin: new Date('2026-07-31'),
          active: false,
        },
      });
      await seedAnnee(prisma, id, silent, { libelle: '2026-2027' });
      const years = await prisma.anneeAcademique.findMany({
        where: { tenantId: id },
        orderBy: { libelle: 'asc' },
      });
      expect(years.map((y) => [y.libelle, y.active])).toEqual([
        ['2025-2026', false],
        ['2026-2027', true],
      ]);
      expect(years[0]).toEqual(old);
    });

    it('l’année active d’un tenant n’empêche pas la création dans un autre', async () => {
      const a = await freshTenant('iso-a');
      const b = await freshTenant('iso-b');
      await seedAnnee(prisma, a, silent, { libelle: '2026-2027' });
      await seedAnnee(prisma, b, silent, { libelle: '2026-2027' });
      for (const id of [a, b]) {
        expect(
          await prisma.anneeAcademique.count({
            where: { tenantId: id, active: true },
          }),
        ).toBe(1);
      }
    });

    it('deux exécutions simultanées ne créent jamais deux années actives', async () => {
      const id = await freshTenant('concurrent');
      const results = await Promise.allSettled([
        seedAnnee(prisma, id, silent),
        seedAnnee(prisma, id, silent),
      ]);
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(SeedError);
        }
      }
      expect(
        await prisma.anneeAcademique.count({
          where: { tenantId: id, active: true },
        }),
      ).toBe(1);
    });
  });
});
