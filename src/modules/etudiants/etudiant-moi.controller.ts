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
import { EtudiantMoiService } from './etudiant-moi.service';

type MoiRequest = { user: { id: string } };

/**
 * Routes « moi » de l'étudiant connecté : l'identité vient uniquement du JWT.
 * Déclaré AVANT EtudiantsController dans le module, sinon `etudiants/:id`
 * capterait « me ».
 */
@Controller('etudiants/me')
@ApiTags('etudiants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ETUDIANT)
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@ApiForbiddenResponse({ description: 'Rôle ETUDIANT requis' })
export class EtudiantMoiController {
  constructor(private readonly service: EtudiantMoiService) {}

  @Get()
  @ApiOperation({ summary: 'Profil de l’étudiant connecté' })
  @ApiOkResponse({ description: 'Profil de l’étudiant' })
  @ApiNotFoundResponse({ description: 'Aucun profil étudiant pour ce compte' })
  profil(@Req() request: MoiRequest) {
    return this.service.profil(request.user.id);
  }

  @Get('inscriptions')
  @ApiOperation({ summary: 'Inscriptions de l’étudiant connecté' })
  @ApiOkResponse({ description: 'Liste de ses inscriptions' })
  inscriptions(@Req() request: MoiRequest) {
    return this.service.inscriptions(request.user.id);
  }

  @Get('candidature')
  @ApiOperation({ summary: 'Candidature d’origine de l’étudiant connecté' })
  @ApiOkResponse({ description: 'Sa candidature (statut, filière, pièces)' })
  @ApiNotFoundResponse({ description: 'Aucune candidature associée' })
  candidature(@Req() request: MoiRequest) {
    return this.service.candidature(request.user.id);
  }
}
