import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { MatriculeIucField } from './matricule-iuc';

export class CreateEtudiantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  candidatureId: string;
  @ApiPropertyOptional({
    format: 'uuid',
    deprecated: true,
    description:
      'Ignoré : l’établissement est celui du JWT. Conservé pour les anciens clients.',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
  @MatriculeIucField()
  matriculeIuc?: string;
}
