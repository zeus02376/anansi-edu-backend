/**
 * Crée l'année académique active d'un tenant. Idempotent : si une année active
 * existe déjà, ne crée ni ne modifie rien.
 *
 *   npm run seed:annee
 *   SEED_TENANT_SLUG=iuc npm run seed:annee   (si plusieurs tenants)
 *
 * Valeurs par défaut : l'année académique (1er septembre → 31 juillet), libellé
 * « AAAA-AAAA+1 » calculé d'après la date du jour : à partir du 1er août (période
 * des candidatures) l'année qui commence en septembre, sinon celle en cours
 * (ex. le 20 octobre 2026 → « 2026-2027 » ; le 15 mars 2027 → « 2026-2027 »).
 * Réglable par variables d'environnement :
 *   SEED_ANNEE_LIBELLE     ex. 2027-2028
 *   SEED_ANNEE_DATE_DEBUT  ex. 2026-09-01   (AAAA-MM-JJ)
 *   SEED_ANNEE_DATE_FIN    ex. 2027-07-31
 * Un libellé « AAAA-AAAA » sans dates donne du 1er septembre au 31 juillet de ces
 * années ; tout autre libellé garde les dates de l'année académique par défaut.
 *
 * Refuse (sans rien modifier) de créer un doublon : une année de même libellé
 * mais inactive est signalée plutôt que dupliquée.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { resolveTenant, runSeed, SeedError } from './seed-utils';

export type AnneeConfig = {
  libelle?: string;
  dateDebut?: string;
  dateFin?: string;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);

function parseDate(variable: string, value: string): Date {
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) {
    throw new SeedError(
      `${variable} invalide : « ${value} » (format attendu : AAAA-MM-JJ)`,
    );
  }
  return date;
}

/**
 * Première année de l'année académique « par défaut » à la date donnée : à partir
 * du 1er août, celle qui commence en septembre ; avant, celle déjà en cours.
 */
export function defaultStartYear(now = new Date()) {
  return now.getUTCMonth() >= 7
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1;
}

/** Libellé et dates à créer : configuration explicite, sinon valeurs par défaut. */
export function resolveAnnee(config: AnneeConfig = {}, now = new Date()) {
  const startYear = defaultStartYear(now);
  const libelle = config.libelle?.trim() || `${startYear}-${startYear + 1}`;

  // « AAAA-AAAA » : ses années ; tout autre libellé : l'année académique par défaut
  const academic = /^(d{4})-(d{4})$/.exec(libelle);
  const debutYear = academic ? Number(academic[1]) : startYear;
  const finYear = academic ? Number(academic[2]) : startYear + 1;
  const defaultDebut = new Date(Date.UTC(debutYear, 8, 1));
  const defaultFin = new Date(Date.UTC(finYear, 6, 31));

  const dateDebut = config.dateDebut
    ? parseDate('SEED_ANNEE_DATE_DEBUT', config.dateDebut)
    : defaultDebut;
  const dateFin = config.dateFin
    ? parseDate('SEED_ANNEE_DATE_FIN', config.dateFin)
    : defaultFin;
  if (dateFin <= dateDebut) {
    throw new SeedError(
      `La date de fin (${iso(dateFin)}) doit être postérieure à la date de début (${iso(dateDebut)})`,
    );
  }
  return { libelle, dateDebut, dateFin };
}

export async function seedAnnee(
  prisma: PrismaClient,
  tenantId: string,
  print: (line: string) => void = console.log,
  config: AnneeConfig = {},
) {
  // Validé avant tout accès à la base : une erreur de saisie ne touche à rien
  const wanted = resolveAnnee(config);

  try {
    // Sérialisable : deux exécutions simultanées ne créent pas deux années
    return await prisma.$transaction(
      async (tx) => {
        const existing = await tx.anneeAcademique.findFirst({
          where: { tenantId, active: true },
          select: { id: true, libelle: true },
        });
        if (existing) {
          print(
            `  = année académique active existante (${existing.libelle}) : rien n’a été modifié`,
          );
          return existing;
        }

        const sameLabel = await tx.anneeAcademique.findFirst({
          where: { tenantId, libelle: wanted.libelle },
          select: { id: true },
        });
        if (sameLabel) {
          throw new SeedError(
            `Une année « ${wanted.libelle} » existe déjà mais n’est pas active : rien n’a été créé. ` +
              'Activez-la (PUT /annees-academiques/:id) ou choisissez un autre SEED_ANNEE_LIBELLE',
          );
        }

        const annee = await tx.anneeAcademique.create({
          data: { tenantId, ...wanted, active: true },
          select: { id: true, libelle: true },
        });
        print(
          `  + année académique active ${annee.libelle} créée (du ${iso(wanted.dateDebut)} au ${iso(wanted.dateFin)})`,
        );
        return annee;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      throw new SeedError(
        'Création concurrente détectée : relancez pour vérifier l’état',
      );
    }
    throw error;
  }
}

if (require.main === module) {
  runSeed('Seed année académique', async (prisma) => {
    const tenant = await resolveTenant(prisma);
    await seedAnnee(prisma, tenant.id, console.log, {
      libelle: process.env.SEED_ANNEE_LIBELLE,
      dateDebut: process.env.SEED_ANNEE_DATE_DEBUT,
      dateFin: process.env.SEED_ANNEE_DATE_FIN,
    });
  });
}
