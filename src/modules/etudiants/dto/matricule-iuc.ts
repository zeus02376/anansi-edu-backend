import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

export const MATRICULE_IUC = /^IUC\d{2}E\d{7}$/;

/**
 * Matricule institutionnel : champ d'import et d'affichage, jamais généré par
 * ANANSI. Facultatif ; null pour l'effacer (à la modification).
 */
export const MatriculeIucField = () =>
  applyDecorators(
    ApiPropertyOptional({
      example: 'IUC26E1234567',
      nullable: true,
      description:
        'Matricule institutionnel IUC + 2 chiffres + E + 7 chiffres (unique, facultatif)',
    }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsOptional(),
    IsString(),
    Matches(MATRICULE_IUC, {
      message:
        'Le matricule IUC doit respecter le format IUC + 2 chiffres + E + 7 chiffres (ex. IUC26E1234567)',
    }),
  );
