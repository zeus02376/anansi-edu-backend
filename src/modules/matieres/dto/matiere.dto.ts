import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class MatiereDto {
  @IsUUID()
  niveauId: string;
  @IsUUID()
  anneeAcademiqueId: string;
  @IsString()
  nom: string;
  @IsString()
  code: string;
  @IsOptional()
  @IsInt()
  @Min(0)
  credits?: number;
  @IsOptional()
  @IsInt()
  @Min(0)
  heuresCm?: number;
  @IsOptional()
  @IsInt()
  @Min(0)
  heuresTd?: number;
  @IsOptional()
  @IsInt()
  @Min(0)
  heuresTp?: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  coefficient?: number;
}
