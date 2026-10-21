import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Rythme } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MESSAGE_DATE = 'Date attendue au format AAAA-MM-JJ';

/** Séances d'un niveau sur une période (une semaine, ou n'importe quel intervalle). */
export class PublicationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  niveauId: string;

  @ApiProperty({ example: '2027-01-04', description: 'AAAA-MM-JJ, inclus' })
  @Matches(FORMAT_DATE, { message: MESSAGE_DATE })
  du: string;

  @ApiProperty({ example: '2027-01-10', description: 'AAAA-MM-JJ, inclus' })
  @Matches(FORMAT_DATE, { message: MESSAGE_DATE })
  au: string;

  @ApiPropertyOptional({
    enum: Rythme,
    description: 'Sans valeur : les rythmes Jour et Soir',
  })
  @IsOptional()
  @IsEnum(Rythme)
  rythme?: Rythme;
}

export class SemaineQueryDto {
  @ApiProperty({ example: '2027-W05', description: 'Semaine ISO AAAA-Wss' })
  @Matches(/^\d{4}-W\d{2}$/, { message: 'Semaine attendue au format AAAA-Wss' })
  semaine: string;
}
