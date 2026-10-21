import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EtatNote } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class MotifDto {
  @ApiProperty({
    maxLength: 500,
    description: 'Motif obligatoire, conservé dans le journal',
  })
  @Transform(trim)
  @IsString({ message: 'Le motif est obligatoire' })
  @IsNotEmpty({ message: 'Le motif est obligatoire' })
  @MaxLength(500)
  motif: string;
}

/** Correction d'une note : remplace l'état, la valeur et le commentaire. */
export class CorrectionNoteDto extends MotifDto {
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
      'updatedAt de la note tel que lu ; si fourni et périmé : conflit (409)',
  })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class ListeEvaluationsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  matiereId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Année académique des matières',
  })
  @IsOptional()
  @IsString()
  anneeId?: string;
}

export class ReleveQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Limiter le relevé à une année (sinon toutes ses années)',
  })
  @IsOptional()
  @IsString()
  anneeId?: string;
}
