import { StatutCandidature } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateCandidatureDto {
  @IsUUID()
  tenantId: string;
  @IsString()
  nom: string;
  @IsString()
  prenom: string;
  @IsEmail()
  email: string;
  @IsOptional()
  @IsString()
  telephone?: string;
  @IsDateString()
  dateNaissance: string;
  @IsString()
  lieuNaissance: string;
  @IsString()
  nationalite: string;
  @IsUUID()
  filiereId: string;
  @IsUUID()
  anneeAcademiqueId: string;
}

export class UpdateCandidatureStatusDto {
  @IsEnum(StatutCandidature)
  statut: StatutCandidature;
  @IsOptional()
  @IsString()
  commentaire?: string;
}
