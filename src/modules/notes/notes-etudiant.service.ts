import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantScopeService } from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReleveService } from './releve.service';

/**
 * Notes de l'étudiant CONNECTÉ.
 *
 * Règle d'architecture des routes « moi » : seule l'identité du JWT (`userId`)
 * entre ici ; l'étudiant, son établissement et ses inscriptions en sont déduits,
 * jamais d'un identifiant fourni par le client.
 *
 * Les chiffres viennent du MÊME calcul que le relevé du personnel (ReleveService),
 * donc seules les évaluations PUBLIEES comptent. La réponse est une sélection
 * explicite : ni moyenne de classe, ni rang, ni donnée d'un autre étudiant, ni
 * identifiant interne de compte, ni commentaire de la note (voir ci-dessous).
 */
@Injectable()
export class NotesEtudiantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
    private readonly releve: ReleveService,
  ) {}

  async mesNotes(userId: string, anneeId?: string) {
    const etudiant = await this.prisma.etudiant.findUnique({
      where: { userId },
      select: { id: true, tenantId: true },
    });
    if (!etudiant) throw new NotFoundException('Profil étudiant introuvable');
    if (anneeId) await this.scope.anneeAcademique(etudiant.tenantId, anneeId);

    const annees = await this.releve.annees(
      etudiant.tenantId,
      etudiant.id,
      anneeId,
    );
    return {
      annees: annees.map((annee) => ({
        annee: annee.annee,
        niveau: annee.niveau,
        statutInscription: annee.statutInscription,
        // Pas de notion de clôture de période : les moyennes restent provisoires
        provisoire: true,
        moyenneGenerale: annee.moyenneGenerale,
        matieres: annee.matieres.map((matiere) => ({
          id: matiere.id,
          nom: matiere.nom,
          code: matiere.code,
          coefficient: matiere.coefficient,
          credits: matiere.credits,
          moyenne: matiere.moyenne,
          evaluations: matiere.evaluations.map((evaluation) => ({
            id: evaluation.id,
            nom: evaluation.nom,
            type: evaluation.type,
            coefficient: evaluation.coefficient,
            bareme: evaluation.bareme,
            date: evaluation.date,
            comptee: evaluation.comptee,
            // Le commentaire saisi sur une note n'est volontairement pas transmis :
            // sa nature (appréciation ou remarque interne) n'est pas tranchée
            note: evaluation.note && {
              etat: evaluation.note.etat,
              valeur: evaluation.note.valeur,
              sur20: evaluation.note.sur20,
            },
          })),
        })),
      })),
    };
  }
}
