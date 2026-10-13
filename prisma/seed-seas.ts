/**
 * Seed pilote : campus Logbessou + école SEAS + ses filières.
 * Idempotent : ne crée que ce qui manque, ne modifie jamais l'existant.
 *
 *   npm run seed:seas
 *   SEED_TENANT_SLUG=iuc npm run seed:seas   (si plusieurs tenants)
 *
 * Données issues de myiuc.com, à vérifier avant mise en production
 * (statutDonnees = A_CONFIRMER sauf ce qui est confirmé).
 */
import 'dotenv/config';
import { Cycle, Langue, PrismaClient, StatutDonnees } from '@prisma/client';
import { resolveTenant, runSeed } from './seed-utils';

const CAMPUS_NOM = 'Logbessou';
const ECOLE = {
  code: 'SEAS',
  nom: 'SEAS — School of Engineering and Applied Sciences',
  description: 'Programmes en anglais, tutelle University of Buea + MINESUP',
};

type FiliereSeed = {
  nom: string;
  code: string;
  cycle: Cycle;
  dureeAnnees: number | null;
  credits: number | null;
  tutelle: string;
  statutDonnees: StatutDonnees;
};

const { CONFIRME, A_CONFIRMER } = StatutDonnees;
const FILIERES: FiliereSeed[] = [
  {
    nom: 'B.Sc. in Information Systems Management',
    code: 'ISM',
    cycle: Cycle.BSC,
    dureeAnnees: 3,
    credits: 180,
    tutelle: 'University of Buea / MINESUP',
    statutDonnees: CONFIRME,
  },
  {
    nom: 'Business Administration (BBA)',
    code: 'BBA',
    cycle: Cycle.BBA,
    dureeAnnees: 2,
    credits: 120,
    tutelle: 'University of Buea / MINESUP',
    statutDonnees: A_CONFIRMER,
  },
  {
    nom: 'HND in Electrical and Electronics Engineering',
    code: 'HND-EEE',
    cycle: Cycle.HND,
    dureeAnnees: 2,
    credits: 120,
    tutelle: 'MINESUP',
    statutDonnees: CONFIRME,
  },
  {
    nom: 'HND in Telecommunication',
    code: 'HND-TEL',
    cycle: Cycle.HND,
    dureeAnnees: null,
    credits: null,
    tutelle: 'MINESUP',
    statutDonnees: A_CONFIRMER,
  },
  {
    nom: 'HND in Human Resources Management',
    code: 'HND-HRM',
    cycle: Cycle.HND,
    dureeAnnees: null,
    credits: null,
    tutelle: 'MINESUP',
    statutDonnees: A_CONFIRMER,
  },
  {
    nom: 'B.Eng / M.Eng in Computer Science Engineering',
    code: 'CSE',
    cycle: Cycle.BENG,
    dureeAnnees: null,
    credits: null,
    tutelle: 'n.d.',
    statutDonnees: A_CONFIRMER,
  },
];

export async function seedSeas(
  prisma: PrismaClient,
  tenantId: string,
  print: (line: string) => void = console.log,
) {
  const log = (action: 'créé' | 'existant', label: string) =>
    print(`  ${action === 'créé' ? '+' : '='} ${action.padEnd(8)} ${label}`);

  let campus = await prisma.campus.findUnique({
    where: { tenantId_nom: { tenantId, nom: CAMPUS_NOM } },
  });
  log(campus ? 'existant' : 'créé', `campus ${CAMPUS_NOM}`);
  campus ??= await prisma.campus.create({
    data: { tenantId, nom: CAMPUS_NOM, statutDonnees: A_CONFIRMER },
  });

  let ecole = await prisma.ecole.findFirst({
    where: { tenantId, code: ECOLE.code },
  });
  log(ecole ? 'existant' : 'créé', `école ${ECOLE.code}`);
  ecole ??= await prisma.ecole.create({
    data: { ...ECOLE, tenantId, campusId: campus.id },
  });

  for (const filiere of FILIERES) {
    const existing = await prisma.filiere.findFirst({
      where: { ecoleId: ecole.id, code: filiere.code },
      select: { id: true },
    });
    log(existing ? 'existant' : 'créé', `filière ${filiere.code}`);
    if (!existing) {
      await prisma.filiere.create({
        data: { ...filiere, ecoleId: ecole.id, langue: Langue.EN },
      });
    }
  }
}

if (require.main === module) {
  runSeed('Seed SEAS', async (prisma) => {
    const tenant = await resolveTenant(prisma);
    await seedSeas(prisma, tenant.id);
  });
}
