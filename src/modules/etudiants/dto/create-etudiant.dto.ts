import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEtudiantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  candidatureId: string;
  @ApiProperty({ minLength: 8, format: 'password' })
  @IsString()
  @MinLength(8)
  motDePasse: string;
  @ApiPropertyOptional({ format: 'url' })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}
