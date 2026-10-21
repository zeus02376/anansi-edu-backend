import { Injectable } from '@nestjs/common';
import { EtatNote, StatutEvaluation } from '@prisma/client';
import {
  matiereInTenant,
  TenantScopeService,
} from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  arrondiOuNull,
  moyenneGenerale,
  moyenneMatiere,
  noteSur20,
} from './calcul-moyennes';

/**
 * Relevé de notes d'un étudiant, calculé à la volée (aucune valeur stockée) à partir
 * des seules évaluations PUBLIEES. Règles et formules : voir calcul-moyennes.ts.
 */
@Injectable()
export class ReleveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}

  async releve(tenantId: string, etudiantId: string, anneeId?: string) {
    await this.scope.etudiant(tenantId, etudiantId);
    if (anneeId) await this.scope.anneeAcademique(tenantId, anneeId);

    const etudiant = await this.prisma.etudiant.findUniqueOrThrow({
      where: { id: etudiantId },
      select: {
        id: true,
        matricule: true,
        matriculeIuc: true,
        user: { select: { nom: true, prenom: true } },
      },
    });
    const annees = await this.annees(tenantId, etudiantId, anneeId);

    return {
      etudiant: {
        id: etudiant.id,
        matricule: etudiant.matricule,
        matriculeIuc: etudiant.matriculeIuc,
        nom: etudiant.user.nom,
        prenom: etudiant.user.prenom,
      },
      annees,
    };
  }

  /**
   * Années du relevé d'un étudiant, calculées à la volée. N'effectue AUCUN contrôle
   * d'accès : l'appelant a déjà validé l'identité (JWT) ou l'établissement. Partagé
   * par le relevé du personnel et par la consultation de l'étudiant (mêmes chiffres).
   */
  async annees(tenantId: string, etudiantId: string, anneeId?: string) {
    const inscriptions = await this.prisma.inscription.findMany({
      where: { etudiantId, ...(anneeId && { anneeAcademiqueId: anneeId }) },
      select: {
        id: true,
        statut: true,
        niveauId: true,
        anneeAcademiqueId: true,
        niveau: { select: { id: true, nom: true, code: true } },
        anneeAcademique: {
          select: { id: true, libelle: true, dateDebut: true, dateFin: true },
        },
      },
      orderBy: { anneeAcademique: { dateDebut: 'desc' } },
    });

    const annees = [];
    for (const inscription of inscriptions) {
      const matieres = await this.prisma.matiere.findMany({
        where: {
          niveauId: inscription.niveauId,
          anneeAcademiqueId: inscription.anneeAcademiqueId,
          ...matiereInTenant(tenantId),
        },
        select: {
          id: true,
          nom: true,
          code: true,
          coefficient: true,
          credits: true,
          evaluations: {
            where: { statut: StatutEvaluation.PUBLIEE },
            select: {
              id: true,
              nom: true,
              type: true,
              coefficient: true,
              bareme: true,
              date: true,
              notes: {
                where: { inscriptionId: inscription.id },
                select: { valeur: true, etat: true, commentaire: true },
              },
            },
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: { nom: 'asc' },
      });

      const detail = matieres.map((matiere) => {
        const evaluations = matiere.evaluations.map((evaluation) => {
          const note = evaluation.notes[0] ?? null;
          const mesure = note && {
            coefficient: evaluation.coefficient.toNumber(),
            bareme: evaluation.bareme.toNumber(),
            etat: note.etat,
            valeur: note.valeur?.toNumber() ?? null,
          };
          return {
            mesure,
            sortie: {
              id: evaluation.id,
              nom: evaluation.nom,
              type: evaluation.type,
              coefficient: evaluation.coefficient.toNumber(),
              bareme: evaluation.bareme.toNumber(),
              date: evaluation.date,
              note: note && {
                etat: note.etat,
                valeur: note.valeur?.toNumber() ?? null,
                commentaire: note.commentaire,
                sur20: arrondiOuNull(noteSur20(mesure!)),
              },
              // Non notée ou dispensée : n'entre pas dans la moyenne
              comptee: !!note && note.etat !== EtatNote.DISPENSE,
            },
          };
        });
        const moyenne = moyenneMatiere(
          evaluations.flatMap((e) => (e.mesure ? [e.mesure] : [])),
        );
        return {
          matiere: {
            id: matiere.id,
            nom: matiere.nom,
            code: matiere.code,
            coefficient: matiere.coefficient,
            credits: matiere.credits,
          },
          moyenne,
          evaluations: evaluations.map((e) => e.sortie),
        };
      });

      annees.push({
        annee: inscription.anneeAcademique,
        niveau: inscription.niveau,
        statutInscription: inscription.statut,
        moyenneGenerale: arrondiOuNull(
          moyenneGenerale(
            detail.map((d) => ({
              coefficient: d.matiere.coefficient,
              moyenne: d.moyenne,
            })),
          ),
        ),
        matieres: detail.map((d) => ({
          ...d.matiere,
          moyenne: arrondiOuNull(d.moyenne),
          evaluations: d.evaluations,
        })),
      });
    }

    return annees;
  }
}
