import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Paramètres communs des routes publiques du catalogue. */
export class CatalogueQueryDto {
  @ApiPropertyOptional({
    example: 'iuc',
    description:
      'Slug de l’établissement ; facultatif tant qu’un seul établissement existe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tenant?: string;
}
