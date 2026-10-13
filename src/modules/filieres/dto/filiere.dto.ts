import {
  Cycle,
  Langue,
  ModeAdmission,
  Regime,
  StatutDonnees,
} from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Minimum requis : ecoleId, nom, code, cycle. Le reste se complète plus tard.
export class FiliereDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ecoleId: string;
  @ApiProperty({ example: 'Informatique' })
  @IsString()
  nom: string;
  @ApiProperty({ example: 'INFO' })
  @IsString()
  code: string;
  @ApiProperty({ enum: Cycle })
  @IsEnum(Cycle)
  cycle: Cycle;
  @ApiPropertyOptional({ enum: Regime })
  @IsOptional()
  @IsEnum(Regime)
  regime?: Regime;
  @ApiPropertyOptional({ enum: Langue })
  @IsOptional()
  @IsEnum(Langue)
  langue?: Langue;
  @ApiPropertyOptional({ minimum: 1, example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  dureeAnnees?: number;
  @ApiPropertyOptional({ example: 'MINESUP' })
  @IsOptional()
  @IsString()
  tutelle?: string;
  @ApiPropertyOptional({ minimum: 0, example: 180 })
  @IsOptional()
  @IsInt()
  @Min(0)
  credits?: number;
  @ApiPropertyOptional({ example: 'Baccalauréat / GCE A Level' })
  @IsOptional()
  @IsString()
  niveauEntree?: string;
  @ApiPropertyOptional({ example: 'GCE A Level (2 papers)' })
  @IsOptional()
  @IsString()
  diplomeRequis?: string;
  @ApiPropertyOptional({ enum: ModeAdmission })
  @IsOptional()
  @IsEnum(ModeAdmission)
  modeAdmission?: ModeAdmission;
  @ApiPropertyOptional({
    minimum: 0,
    example: 25000,
    description: 'Renvoyé sous forme de chaîne décimale (ex. "25000")',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fraisCandidatureNational?: number;
  @ApiPropertyOptional({
    minimum: 0,
    example: 50000,
    description: 'Renvoyé sous forme de chaîne décimale (ex. "50000")',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fraisCandidatureEtranger?: number;
  @ApiPropertyOptional({ type: [String], example: ['CNI', 'Relevé de notes'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  piecesRequises?: string[];
  @ApiPropertyOptional({ enum: StatutDonnees, default: 'A_CONFIRMER' })
  @IsOptional()
  @IsEnum(StatutDonnees)
  statutDonnees?: StatutDonnees;
}
