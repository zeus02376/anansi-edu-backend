import {
  IsEnum,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  nom: string;

  @IsString()
  prenom: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsString()
  @MinLength(8)
  motDePasse: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
