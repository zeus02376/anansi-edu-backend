import { INestApplication } from '@nestjs/common';
import { Role, StatutInscription } from '@prisma/client';
import * as request from 'supertest';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createUser, login } from './e2e-helpers';

/** Jeux de données communs aux tests du module notes. */
let compteur = 0;
export const suivant = () => ++compteur;

export type Fixtures = {
  app: INestApplication;
  prisma: PrismaService;
  suffix: string;
};

/** Hiérarchie d'un établissement : école, filière, niveaux et années à la demande. */
export async function creerStructure(
  { prisma, suffix }: Fixtures,
  tenantId: string,
  label: string,
) {
  const ecole = await prisma.ecole.create({
    data: { tenantId, nom: `École ${label}`, code: `E-${label}-${suffix}` },
  });
  const filiere = await prisma.filiere.create({
    data: { ecoleId: ecole.id, nom: 'ISM', code: `F-${label}`, cycle: 'BSC' },
  });
  return {
    niveau: (code: string, ordre = 1) =>
      prisma.niveau
        .create({ data: { filiereId: filiere.id, nom: code, code, ordre } })
        .then((n) => n.id),
    annee: (libelle: string, year: number) =>
      prisma.anneeAcademique
        .create({
          data: {
            tenantId,
            libelle: `${libelle}-${label}-${suffix}`,
            dateDebut: new Date(`${year}-09-01`),
            dateFin: new Date(`${year + 1}-07-31`),
          },
        })
        .then((a) => a.id),
  };
}

export async function creerMatiere(
  { prisma }: Fixtures,
  niveauId: string,
  anneeId: string,
  code: string,
  coefficient = 1,
) {
  return (
    await prisma.matiere.create({
      data: {
        niveauId,
        anneeAcademiqueId: anneeId,
        nom: `Matière ${code}`,
        code,
        coefficient,
      },
    })
  ).id;
}

export type Eleve = { inscription: string; etudiant: string; user: string };

export async function creerEleve(
  { prisma, suffix }: Fixtures,
  tenantId: string,
  niveauId: string,
  anneeId: string,
  statut: StatutInscription = StatutInscription.VALIDE,
): Promise<Eleve> {
  const n = suivant();
  const user = await createUser(
    prisma,
    tenantId,
    `eleve${n}-${suffix}@example.test`,
    'Password123',
    Role.ETUDIANT,
  );
  const etudiant = await prisma.etudiant.create({
    data: {
      userId: user.id,
      tenantId,
      matricule: `IUC-N-${suffix}-${n}`,
      dateNaissance: new Date('2005-01-15'),
      lieuNaissance: 'Douala',
      nationalite: 'Camerounaise',
    },
  });
  const inscription = await prisma.inscription.create({
    data: {
      etudiantId: etudiant.id,
      niveauId,
      anneeAcademiqueId: anneeId,
      statut,
      createdBy: user.id,
    },
  });
  return { inscription: inscription.id, etudiant: etudiant.id, user: user.id };
}

export type Prof = { token: string; enseignant: string; user: string };

export async function creerProf(
  { app, prisma, suffix }: Fixtures,
  tenantId: string,
  matieres: string[],
): Promise<Prof> {
  const n = suivant();
  const email = `prof${n}-${suffix}@example.test`;
  const user = await createUser(
    prisma,
    tenantId,
    email,
    'Password123',
    Role.ENSEIGNANT,
  );
  const enseignant = await prisma.enseignant.create({
    data: { userId: user.id, tenantId, type: 'PERMANENT' },
  });
  for (const matiereId of matieres) {
    const m = await prisma.matiere.findUniqueOrThrow({
      where: { id: matiereId },
    });
    await prisma.affectation.create({
      data: {
        enseignantId: enseignant.id,
        matiereId,
        anneeAcademiqueId: m.anneeAcademiqueId,
      },
    });
  }
  return {
    token: await login(app, email, 'Password123'),
    enseignant: enseignant.id,
    user: user.id,
  };
}

export type Compte = { token: string; user: string };

export async function creerCompte(
  { app, prisma, suffix }: Fixtures,
  tenantId: string,
  role: Role,
): Promise<Compte> {
  const email = `${role.toLowerCase()}${suivant()}-${suffix}@example.test`;
  const user = await createUser(prisma, tenantId, email, 'Password123', role);
  return { token: await login(app, email, 'Password123'), user: user.id };
}

export const appel = (
  app: INestApplication,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  token: string | undefined,
  url: string,
  body?: object,
) => {
  const req = request(app.getHttpServer())[method](url);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return body ? req.send(body) : req;
};
