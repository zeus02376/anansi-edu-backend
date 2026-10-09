import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EcoleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId: string;
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
}
