import { Langue } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CatalogueQueryDto } from '../../../common/dto/catalogue-query.dto';

// Paramètre vide ou composé d'espaces = non renseigné
const trimToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export const LANGUES_RECHERCHE = [Langue.FR, Langue.EN] as const;

/** Filtres de GET /filieres/suggestions : tous optionnels et cumulables. */
export class SuggestionsQueryDto extends CatalogueQueryDto {
  @ApiPropertyOptional({
    enum: LANGUES_RECHERCHE,
    description: 'Inclut aussi les filières bilingues (FR_EN)',
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsIn(LANGUES_RECHERCHE, { message: 'langue doit valoir FR ou EN' })
  langue?: (typeof LANGUES_RECHERCHE)[number];

  @ApiPropertyOptional({
    example: 'GCE A Level',
    description: 'Correspondance partielle, insensible à la casse',
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  niveauEntree?: string;

  @ApiPropertyOptional({
    example: 'engineering',
    description:
      'Recherche partielle (insensible à la casse) dans le nom et le code de la filière, le nom et la description de l’école',
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  motCle?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsUUID()
  campusId?: string;
}
