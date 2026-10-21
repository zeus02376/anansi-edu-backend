import { MatriculeIucField } from './matricule-iuc';

/** Modification d'un étudiant par le personnel : pour l'instant, son matricule IUC. */
export class UpdateEtudiantDto {
  @MatriculeIucField()
  matriculeIuc?: string | null;
}
