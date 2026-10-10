import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const STAFF_ROLES = [Role.SCOLARITE, Role.ENSEIGNANT] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export class CreateStaffDto {
  @ApiProperty({ example: 'Mbarga' })
  @IsString()
  nom: string;

  @ApiProperty({ example: 'Claire' })
  @IsString()
  prenom: string;

  @ApiProperty({ example: 'scolarite@iuc.cm' })
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

  @ApiProperty({ enum: STAFF_ROLES })
  @IsIn(STAFF_ROLES, { message: 'Le rôle doit être SCOLARITE ou ENSEIGNANT' })
  role: StaffRole;
}
