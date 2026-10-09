import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatutInscription } from '@prisma/client';

export class InscriptionDto {
  @IsUUID()
  etudiantId: string;
  @IsUUID()
  niveauId: string;
  @IsUUID()
  anneeAcademiqueId: string;
  @IsOptional()
  @IsEnum(StatutInscription)
  statut?: StatutInscription;
  @IsOptional()
  @IsBoolean()
  fraisPayes?: boolean;
}
