import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MatiereDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  niveauId: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  anneeAcademiqueId: string;
  @ApiProperty({ example: 'Algorithmique' })
  @IsString()
  nom: string;
  @ApiProperty({ example: 'INFO101' })
  @IsString()
  code: string;
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  credits?: number;
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  heuresCm?: number;
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  heuresTd?: number;
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  heuresTp?: number;
  @ApiPropertyOptional({ minimum: 0, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  coefficient?: number;
}
