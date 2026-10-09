import { TypeEnseignant } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
} from 'class-validator';

export class EnseignantDto {
  @IsUUID()
  userId: string;
  @IsUUID()
  tenantId: string;
  @IsEnum(TypeEnseignant)
  type: TypeEnseignant;
  @IsOptional()
  @IsString()
  specialite?: string;
  @IsOptional()
  @IsUrl()
  cvUrl?: string;
}

export class AffectationDto {
  @IsUUID()
  matiereId: string;
  @IsUUID()
  anneeAcademiqueId: string;
  @IsOptional()
  @IsInt()
  @Min(0)
  heuresPrevues?: number;
}
