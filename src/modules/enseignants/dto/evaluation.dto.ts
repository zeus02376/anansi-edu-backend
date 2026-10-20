import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { EtatNote, TypeEvaluation } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEvaluationDto {
  @ApiProperty({ example: 'Devoir 1' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nom: string;

  @ApiProperty({ enum: TypeEvaluation })
  @IsEnum(TypeEvaluation)
  type: TypeEvaluation;

  @ApiPropertyOptional({
    default: 1,
    description: 'Poids dans la matière (2 décimales)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999.99)
  coefficient?: number;

  @ApiPropertyOptional({
    default: 20,
    description: 'Note maximale (2 décimales)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999.99)
  bareme?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class UpdateEvaluationDto extends PartialType(CreateEvaluationDto) {}

export class NoteLigneDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @IsNotEmpty()
  inscriptionId: string;

  @ApiPropertyOptional({ enum: EtatNote, default: EtatNote.NOTEE })
  @IsOptional()
  @IsEnum(EtatNote)
  etat?: EtatNote;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Obligatoire si NOTEE (≤ barème), interdite sinon',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valeur?: number | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string | null;

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'updatedAt de la note tel que lu dans la grille ; absent si aucune note n’existait. ' +
      'Une valeur différente de l’état actuel donne un conflit (409).',
  })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class SaisieNotesDto {
  @ApiProperty({ type: [NoteLigneDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => NoteLigneDto)
  notes: NoteLigneDto[];
}
