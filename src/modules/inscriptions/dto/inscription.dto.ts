import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatutInscription } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  etudiantId: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  niveauId: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  anneeAcademiqueId: string;
  @ApiPropertyOptional({ enum: StatutInscription })
  @IsOptional()
  @IsEnum(StatutInscription)
  statut?: StatutInscription;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  fraisPayes?: boolean;
}
