import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Rythme, StatutInscription } from '@prisma/client';
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
  @ApiPropertyOptional({
    enum: Rythme,
    default: Rythme.JOUR,
    description: 'Jour ou Soir : emploi du temps suivi par l’étudiant',
  })
  @IsOptional()
  @IsEnum(Rythme)
  rythme?: Rythme;
}
