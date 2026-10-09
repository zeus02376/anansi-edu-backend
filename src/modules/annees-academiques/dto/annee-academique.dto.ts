import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnneeAcademiqueDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId: string;
  @ApiProperty({ example: '2025-2026' })
  @IsString()
  libelle: string;
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  dateDebut: string;
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  dateFin: string;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
