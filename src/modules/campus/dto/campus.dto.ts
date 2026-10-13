import { StatutDonnees } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CampusDto {
  @ApiProperty({ example: 'Logbessou' })
  @IsString()
  nom: string;
  @ApiPropertyOptional({ example: 'LGB' })
  @IsOptional()
  @IsString()
  code?: string;
  @ApiPropertyOptional({ example: 'Logbessou, Douala' })
  @IsOptional()
  @IsString()
  adresse?: string;
  @ApiPropertyOptional({ description: 'Description du campus' })
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional({ enum: StatutDonnees, default: 'A_CONFIRMER' })
  @IsOptional()
  @IsEnum(StatutDonnees)
  statutDonnees?: StatutDonnees;
}
