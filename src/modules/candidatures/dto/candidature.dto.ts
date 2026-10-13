import { StatutCandidature } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCandidatureDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId: string;
  @ApiProperty({ example: 'Ndi' })
  @IsString()
  nom: string;
  @ApiProperty({ example: 'Amina' })
  @IsString()
  prenom: string;
  @ApiProperty({ example: 'amina@example.cm' })
  @IsEmail()
  email: string;
  @ApiPropertyOptional({ example: '+237600000000' })
  @IsOptional()
  @IsString()
  telephone?: string;
  @ApiProperty({ format: 'date-time', example: '2005-01-15T00:00:00.000Z' })
  @IsDateString()
  dateNaissance: string;
  @ApiProperty({ example: 'Douala' })
  @IsString()
  lieuNaissance: string;
  @ApiProperty({ example: 'Camerounaise' })
  @IsString()
  nationalite: string;
  @ApiProperty({ format: 'uuid', description: 'Filière visée (obligatoire)' })
  @IsUUID(undefined, {
    message: 'filiereId est obligatoire et doit identifier une filière',
  })
  filiereId: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  anneeAcademiqueId: string;
}

export class UpdateCandidatureStatusDto {
  @ApiProperty({ enum: StatutCandidature })
  @IsEnum(StatutCandidature)
  statut: StatutCandidature;
  @ApiPropertyOptional({
    description: 'Commentaire associé au changement de statut',
  })
  @IsOptional()
  @IsString()
  commentaire?: string;
}
