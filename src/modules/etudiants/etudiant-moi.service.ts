import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const USER = { select: { nom: true, prenom: true, email: true } } as const;

/**
 * Données de l'étudiant CONNECTÉ.
 *
 * Règle d'architecture : chaque méthode ne reçoit que `userId`, l'identité du
 * JWT, et toute requête est filtrée par `etudiant.userId`. Aucun identifiant
 * d'étudiant venant de l'URL, de la requête ou du corps n'entre ici : une
 * future route « étudiant » doit suivre le même modèle (jamais seulement un
 * filtre par établissement).
 */
@Injectable()
export class EtudiantMoiService {
  constructor(private readonly prisma: PrismaService) {}

  async profil(userId: string) {
    const etudiant = await this.prisma.etudiant.findUnique({
      where: { userId },
      select: {
        id: true,
        matricule: true,
        matriculeIuc: true,
        dateNaissance: true,
        lieuNaissance: true,
        nationalite: true,
        photoUrl: true,
        user: USER,
      },
    });
    if (!etudiant) throw new NotFoundException('Profil étudiant introuvable');
    return etudiant;
  }

  inscriptions(userId: string) {
    return this.prisma.inscription.findMany({
      where: { etudiant: { userId } },
      select: {
        id: true,
        statut: true,
        dateInscription: true,
        fraisPayes: true,
        niveau: { select: { id: true, nom: true, code: true, ordre: true } },
        anneeAcademique: {
          select: { id: true, libelle: true, dateDebut: true, dateFin: true },
        },
      },
      orderBy: { dateInscription: 'desc' },
    });
  }

  async candidature(userId: string) {
    const candidature = await this.prisma.candidature.findFirst({
      where: { etudiant: { userId } },
      select: {
        id: true,
        numeroDossier: true,
        statut: true,
        createdAt: true,
        filiere: {
          select: {
            id: true,
            nom: true,
            code: true,
            cycle: true,
            ecole: { select: { id: true, nom: true } },
          },
        },
        anneeAcademique: { select: { id: true, libelle: true } },
        documents: {
          select: {
            id: true,
            typeDocument: true,
            nomFichier: true,
            valide: true,
          },
        },
      },
    });
    if (!candidature) {
      throw new NotFoundException('Aucune candidature associée à ce compte');
    }
    return candidature;
  }
}
