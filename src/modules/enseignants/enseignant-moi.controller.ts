import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EnseignantMoiService } from './enseignant-moi.service';

type MoiRequest = { user: { id: string } };

/**
 * Routes « moi » de l'enseignant connecté : l'identité vient uniquement du JWT.
 * Déclaré AVANT EnseignantsController dans le module, sinon `enseignants/:id`
 * capterait « me ».
 */
@Controller('enseignants/me')
@ApiTags('enseignants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ENSEIGNANT)
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@ApiForbiddenResponse({ description: 'Rôle ENSEIGNANT requis' })
export class EnseignantMoiController {
  constructor(private readonly service: EnseignantMoiService) {}

  @Get()
  @ApiOperation({ summary: 'Profil de l’enseignant connecté' })
  @ApiOkResponse({ description: 'Profil de l’enseignant' })
  @ApiNotFoundResponse({
    description: 'Aucun profil enseignant pour ce compte',
  })
  profil(@Req() request: MoiRequest) {
    return this.service.profil(request.user.id);
  }

  @Get('affectations')
  @ApiOperation({ summary: 'Affectations de l’enseignant connecté' })
  @ApiOkResponse({ description: 'Ses affectations (matière, année)' })
  affectations(@Req() request: MoiRequest) {
    return this.service.affectations(request.user.id);
  }
}
