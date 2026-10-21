import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Rythme, StatutSeance, TypeSeance } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MESSAGE_DATE = 'Date attendue au format AAAA-MM-JJ';

export const PORTEES = ['cette_seance', 'suivantes', 'serie'] as const;
export type Portee = (typeof PORTEES)[number];

/** Champs décrivant une séance (hors date). Heures en minutes depuis minuit, fin exclue. */
class CreneauBaseDto {
  @ApiProperty({
    minimum: 0,
    maximum: 1439,
    example: 480,
    description: '480 = 08:00',
  })
  @IsInt()
  @Min(0)
  @Max(1439)
  heureDebut: number;

  @ApiProperty({
    minimum: 1,
    maximum: 1440,
    example: 590,
    description: '590 = 09:50 (exclue)',
  })
  @IsInt()
  @Min(1)
  @Max(1440)
  heureFin: number;

  @ApiProperty({ enum: TypeSeance })
  @IsEnum(TypeSeance)
  type: TypeSeance;

  @ApiProperty({
    type: [String],
    description:
      'Matières de la séance (une séance commune à plusieurs filières en liste plusieurs, de la même année)',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Au moins une matière est obligatoire' })
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  matiereIds: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  enseignantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  salleId?: string;

  @ApiPropertyOptional({ enum: Rythme, default: Rythme.JOUR })
  @IsOptional()
  @IsEnum(Rythme)
  rythme?: Rythme;

  @ApiPropertyOptional({
    description:
      'Si vrai : calcule les conflits sans rien créer (réponse 200 avec la liste des conflits)',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class CreerSeanceDto extends CreneauBaseDto {
  @ApiProperty({ example: '2026-10-05', description: 'AAAA-MM-JJ' })
  @Matches(FORMAT_DATE, { message: MESSAGE_DATE })
  date: string;
}

/** Séances hebdomadaires du `dateDebut` au `dateFin` inclus, aux `joursSemaine` donnés. */
export class CreerSerieDto extends CreneauBaseDto {
  @ApiProperty({ example: '2026-10-05', description: 'AAAA-MM-JJ, inclus' })
  @Matches(FORMAT_DATE, { message: MESSAGE_DATE })
  dateDebut: string;

  @ApiProperty({ example: '2026-12-18', description: 'AAAA-MM-JJ, inclus' })
  @Matches(FORMAT_DATE, { message: MESSAGE_DATE })
  dateFin: string;

  @ApiProperty({
    type: [Number],
    example: [1, 3],
    description: '1 = lundi … 7 = dimanche',
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Au moins un jour de la semaine est obligatoire',
  })
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  joursSemaine: number[];
}

/** Modification partielle : seuls les champs fournis changent. */
export class ModifierSeanceDto {
  @ApiPropertyOptional({
    enum: PORTEES,
    default: 'cette_seance',
    description:
      '« suivantes » et « serie » appliquent les champs à chaque occurrence en gardant sa date',
  })
  @IsOptional()
  @IsEnum(PORTEES)
  portee?: Portee;

  @ApiPropertyOptional({
    example: '2026-10-12',
    description: 'Uniquement pour la portée « cette_seance »',
  })
  @IsOptional()
  @Matches(FORMAT_DATE, { message: MESSAGE_DATE })
  date?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1439 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  heureDebut?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  heureFin?: number;

  @ApiPropertyOptional({ enum: TypeSeance })
  @IsOptional()
  @IsEnum(TypeSeance)
  type?: TypeSeance;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Au moins une matière est obligatoire' })
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  matiereIds?: string[];

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'null retire l’enseignant',
  })
  @IsOptional()
  @IsUUID()
  enseignantId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'null retire la salle',
  })
  @IsOptional()
  @IsUUID()
  salleId?: string | null;

  @ApiPropertyOptional({ enum: Rythme })
  @IsOptional()
  @IsEnum(Rythme)
  rythme?: Rythme;

  @ApiPropertyOptional({
    description: 'Si vrai : calcule les conflits sans rien modifier',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class AnnulerSeanceDto {
  @ApiProperty({ maxLength: 500, description: 'Motif obligatoire' })
  @Transform(trim)
  @IsString({ message: 'Le motif est obligatoire' })
  @IsNotEmpty({ message: 'Le motif est obligatoire' })
  @MaxLength(500)
  motif: string;
}

export class FenetreQueryDto {
  @ApiProperty({ example: '2026-10-05', description: 'AAAA-MM-JJ, inclus' })
  @Matches(FORMAT_DATE, { message: MESSAGE_DATE })
  du: string;

  @ApiProperty({ example: '2026-10-11', description: 'AAAA-MM-JJ, inclus' })
  @Matches(FORMAT_DATE, { message: MESSAGE_DATE })
  au: string;
}

export class ListeSeancesQueryDto extends FenetreQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  niveauId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  enseignantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  salleId?: string;

  @ApiPropertyOptional({ enum: TypeSeance })
  @IsOptional()
  @IsEnum(TypeSeance)
  type?: TypeSeance;

  @ApiPropertyOptional({ enum: StatutSeance })
  @IsOptional()
  @IsEnum(StatutSeance)
  statut?: StatutSeance;

  @ApiPropertyOptional({ enum: Rythme })
  @IsOptional()
  @IsEnum(Rythme)
  rythme?: Rythme;
}
