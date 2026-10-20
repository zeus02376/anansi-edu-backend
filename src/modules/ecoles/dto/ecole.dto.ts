import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EcoleDto {
  @ApiPropertyOptional({
    format: 'uuid',
    deprecated: true,
    description:
      'Ignoré : l’établissement est celui du JWT. Conservé pour les anciens clients.',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
  @ApiProperty({ example: 'École d’ingénieurs' })
  @IsString()
  nom: string;
  @ApiProperty({ example: 'EII' })
  @IsString()
  code: string;
  @ApiPropertyOptional({ description: 'Description de l’école' })
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Campus de rattachement (même tenant) ; null pour détacher',
  })
  @IsOptional()
  @IsUUID()
  campusId?: string | null;
}
