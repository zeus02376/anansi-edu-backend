import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/** Route réservée au personnel (ADMIN ou SCOLARITE) authentifié. */
export const StaffOnly = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(Role.ADMIN, Role.SCOLARITE),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Authentification requise' }),
    ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' }),
  );
