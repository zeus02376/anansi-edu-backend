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
    // Année académique en cours à la date du jour (à partir d'août : celle qui commence en septembre)
    const today = new Date();
    const startYear =
      today.getUTCMonth() >= 7
        ? today.getUTCFullYear()
        : today.getUTCFullYear() - 1;
    const first = await seedAnnee(prisma, tenantId, silent);
    const afterFirstRun = await prisma.anneeAcademique.findMany({
      where: { tenantId, active: true },
    });
    expect(afterFirstRun).toHaveLength(1);
    expect(afterFirstRun[0]).toMatchObject({
      id: first.id,
      libelle: `${startYear}-${startYear + 1}`,
      active: true,
    });
    expect(afterFirstRun[0].dateDebut.toISOString()).toBe(
      `${startYear}-09-01T00:00:00.000Z`,
    );
    expect(afterFirstRun[0].dateFin.toISOString()).toBe(
      `${startYear + 1}-07-31T00:00:00.000Z`,
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
    const range = (config = {}, today = now) => {
      const { libelle, dateDebut, dateFin } = resolveAnnee(config, today);
      return [libelle, dateDebut.toISOString(), dateFin.toISOString()];
    };

    it.each([
      ['1er janvier 2027', '2027-01-01', '2026-2027'],
      ['15 mars 2027', '2027-03-15', '2026-2027'],
      ['31 juillet 2027', '2027-07-31', '2026-2027'],
      ['1er août 2027 (candidatures)', '2027-08-01', '2027-2028'],
      ['1er septembre 2027', '2027-09-01', '2027-2028'],
      ['20 octobre 2026', '2026-10-20', '2026-2027'],
      ['31 décembre 2026', '2026-12-31', '2026-2027'],
      ['31 juillet 2026', '2026-07-31', '2025-2026'],
    ])('par défaut (%s) : année académique %s', (_label, day, libelle) => {
      const [debut, fin] = libelle.split('-');
      expect(range({}, new Date(`${day}T12:00:00.000Z`))).toEqual([
        libelle,
        `${debut}-09-01T00:00:00.000Z`,
        `${fin}-07-31T00:00:00.000Z`,
      ]);
    });

    it('un libellé « AAAA-AAAA » sans dates : du 1er septembre au 31 juillet', () => {
      expect(range({ libelle: '2026-2027' })).toEqual([
        '2026-2027',
        '2026-09-01T00:00:00.000Z',
        '2027-07-31T00:00:00.000Z',
      ]);
    });

    it.each(['Rentrée 2026', '2026'])(
      'le libellé libre « %s » garde les dates de l’année académique par défaut',
      (libelle) => {
        expect(range({ libelle })).toEqual([
          libelle,
          '2026-09-01T00:00:00.000Z',
          '2027-07-31T00:00:00.000Z',
        ]);
      },
    );

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
