import {
  IsEnum,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: 'Identifiant UUID du tenant' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ example: 'Admin' })
  @IsString()
  nom: string;

  @ApiProperty({ example: 'IUC' })
  @IsString()
  prenom: string;

  @ApiProperty({ example: 'admin@iuc.cm' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+237600000000' })
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiProperty({ minLength: 8, format: 'password' })
  @IsString()
  @MinLength(8)
  motDePasse: string;

  @ApiPropertyOptional({
    enum: Role,
    description: 'Rôle demandé (ADMIN initial ou ETUDIANT)',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
