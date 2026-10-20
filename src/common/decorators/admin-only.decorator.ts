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

/** Route réservée aux ADMIN authentifiés (ex. suppressions de structure). */
export const AdminOnly = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(Role.ADMIN),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Authentification requise' }),
    ApiForbiddenResponse({ description: 'Rôle ADMIN requis' }),
  );
