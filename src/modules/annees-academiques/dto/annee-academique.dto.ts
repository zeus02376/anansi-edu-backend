import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class AnneeAcademiqueDto {
  @IsUUID()
  tenantId: string;
  @IsString()
  libelle: string;
  @IsDateString()
  dateDebut: string;
  @IsDateString()
  dateFin: string;
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
