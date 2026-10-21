import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service';

/** Filtres Prisma : une entité appartient à un établissement via sa hiérarchie. */
export const niveauInTenant = (tenantId: string) => ({
  filiere: { ecole: { tenantId } },
});
export const matiereInTenant = (tenantId: string) => ({
  niveau: niveauInTenant(tenantId),
});

/**
 * Vérifie qu'une entité appartient à l'établissement du JWT. Sinon, 404 : une
 * ressource d'un autre établissement est indiscernable d'une ressource absente.
 */
@Injectable()
export class TenantScopeService {
  constructor(private readonly prisma: PrismaService) {}

  private async assert(found: { id: string } | null, label: string) {
    if (!found) throw new NotFoundException(`${label} introuvable`);
  }

  campus(tenantId: string, id: string) {
    return this.prisma.campus
      .findFirst({ where: { id, tenantId }, select: { id: true } })
      .then((found) => this.assert(found, 'Campus'));
  }

  ecole(tenantId: string, id: string) {
    return this.prisma.ecole
      .findFirst({ where: { id, tenantId }, select: { id: true } })
      .then((found) => this.assert(found, 'École'));
  }

  filiere(tenantId: string, id: string) {
    return this.prisma.filiere
      .findFirst({
        where: { id, ecole: { tenantId } },
        select: { id: true },
      })
      .then((found) => this.assert(found, 'Filière'));
  }

  niveau(tenantId: string, id: string) {
    return this.prisma.niveau
      .findFirst({
        where: { id, ...niveauInTenant(tenantId) },
        select: { id: true },
      })
      .then((found) => this.assert(found, 'Niveau'));
  }

  matiere(tenantId: string, id: string) {
    return this.prisma.matiere
      .findFirst({
        where: { id, ...matiereInTenant(tenantId) },
        select: { id: true },
      })
      .then((found) => this.assert(found, 'Matière'));
  }

  anneeAcademique(tenantId: string, id: string) {
    return this.prisma.anneeAcademique
      .findFirst({ where: { id, tenantId }, select: { id: true } })
      .then((found) => this.assert(found, 'Année académique'));
  }

  etudiant(tenantId: string, id: string) {
    return this.prisma.etudiant
      .findFirst({ where: { id, tenantId }, select: { id: true } })
      .then((found) => this.assert(found, 'Étudiant'));
  }

  enseignant(tenantId: string, id: string) {
    return this.prisma.enseignant
      .findFirst({ where: { id, tenantId }, select: { id: true } })
      .then((found) => this.assert(found, 'Enseignant'));
  }

  user(tenantId: string, id: string) {
    return this.prisma.user
      .findFirst({ where: { id, tenantId }, select: { id: true } })
      .then((found) => this.assert(found, 'Utilisateur'));
  }

  evaluation(tenantId: string, id: string) {
    return this.prisma.evaluation
      .findFirst({
        where: { id, matiere: matiereInTenant(tenantId) },
        select: { id: true },
      })
      .then((found) => this.assert(found, 'Évaluation'));
  }

  note(tenantId: string, id: string) {
    return this.prisma.note
      .findFirst({
        where: { id, evaluation: { matiere: matiereInTenant(tenantId) } },
        select: { id: true },
      })
      .then((found) => this.assert(found, 'Note'));
  }

  /** Toutes les inscriptions doivent appartenir à l'établissement, sinon 404. */
  async inscriptions(tenantId: string, ids: string[]) {
    const found = await this.prisma.inscription.findMany({
      where: { id: { in: ids }, etudiant: { tenantId } },
      select: { id: true },
    });
    if (found.length !== new Set(ids).size) {
      throw new NotFoundException('Inscription introuvable');
    }
  }

  inscription(tenantId: string, id: string) {
    return this.prisma.inscription
      .findFirst({
        where: { id, etudiant: { tenantId } },
        select: { id: true },
      })
      .then((found) => this.assert(found, 'Inscription'));
  }
}
