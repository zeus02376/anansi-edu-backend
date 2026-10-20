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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EnseignantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;
  @ApiPropertyOptional({
    format: 'uuid',
    deprecated: true,
    description:
      'Ignoré : l’établissement est celui du JWT. Conservé pour les anciens clients.',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
  @ApiProperty({ enum: TypeEnseignant })
  @IsEnum(TypeEnseignant)
  type: TypeEnseignant;
  @ApiPropertyOptional({ example: 'Informatique' })
  @IsOptional()
  @IsString()
  specialite?: string;
  @ApiPropertyOptional({ format: 'url' })
  @IsOptional()
  @IsUrl()
  cvUrl?: string;
}

export class AffectationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  matiereId: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  anneeAcademiqueId: string;
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  heuresPrevues?: number;
}
