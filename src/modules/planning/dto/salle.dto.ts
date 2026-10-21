import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Modification d'une salle : le campus ne change pas (code unique par campus). */
export class ModifierSalleDto {
  @ApiProperty({ example: 'BL100', maxLength: 30 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le code de la salle est obligatoire' })
  @MaxLength(30)
  code: string;

  @ApiPropertyOptional({ example: 'Amphithéâtre A', maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  nom?: string;

  @ApiPropertyOptional({
    example: 'labo informatique',
    maxLength: 50,
    description: 'Texte libre (amphi, labo info…)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  type?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  capacite?: number;
}

export class CreerSalleDto extends ModifierSalleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  campusId: string;
}

export class ListeSallesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  campusId?: string;
}
