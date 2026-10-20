import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Données de l'enseignant CONNECTÉ. Même règle que EtudiantMoiService :
 * seule l'identité du JWT (`userId`) entre ici, et toute requête est filtrée
 * par `enseignant.userId` — jamais par un identifiant fourni par le client.
 */
@Injectable()
export class EnseignantMoiService {
  constructor(private readonly prisma: PrismaService) {}

  async profil(userId: string) {
    const enseignant = await this.prisma.enseignant.findUnique({
      where: { userId },
      select: {
        id: true,
        type: true,
        specialite: true,
        cvUrl: true,
        user: { select: { nom: true, prenom: true, email: true } },
      },
    });
    if (!enseignant)
      throw new NotFoundException('Profil enseignant introuvable');
    return enseignant;
  }

  affectations(userId: string) {
    return this.prisma.affectation.findMany({
      where: { enseignant: { userId } },
      select: {
        id: true,
        heuresPrevues: true,
        matiere: {
          select: {
            id: true,
            nom: true,
            code: true,
            credits: true,
            heuresCm: true,
            heuresTd: true,
            heuresTp: true,
            niveau: { select: { id: true, nom: true, code: true } },
          },
        },
        anneeAcademique: {
          select: { id: true, libelle: true, dateDebut: true, dateFin: true },
        },
      },
    });
  }
}
