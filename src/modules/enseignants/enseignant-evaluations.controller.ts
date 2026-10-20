import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import {
  CreateEvaluationDto,
  SaisieNotesDto,
  UpdateEvaluationDto,
} from './dto/evaluation.dto';
import { EnseignantEvaluationsService } from './enseignant-evaluations.service';

type MoiRequest = { user: { id: string; tenantId: string } };
const enseignant = (request: MoiRequest) => ({
  userId: request.user.id,
  tenantId: request.user.tenantId,
});

/**
 * Évaluations et notes de l'enseignant connecté. L'identité vient uniquement du
 * JWT ; les identifiants d'URL ne désignent que des ressources de son périmètre
 * (ses affectations, ses évaluations), sinon 404. Déclaré AVANT
 * EnseignantsController dans le module, sinon `enseignants/:id` capterait « me ».
 */
@Controller('enseignants/me')
@ApiTags('notes (enseignant)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ENSEIGNANT)
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@ApiForbiddenResponse({ description: 'Rôle ENSEIGNANT requis' })
@ApiNotFoundResponse({
  description: 'Ressource inexistante ou hors de votre périmètre',
})
export class EnseignantEvaluationsController {
  constructor(private readonly service: EnseignantEvaluationsService) {}

  @Get('matieres/:matiereId/evaluations')
  @ApiOperation({ summary: 'Mes évaluations d’une matière qui m’est affectée' })
  @ApiOkResponse({
    description: 'Évaluations que j’ai créées pour cette matière',
  })
  lister(@Param('matiereId') matiereId: string, @Req() request: MoiRequest) {
    return this.service.lister(enseignant(request), matiereId);
  }

  @Post('matieres/:matiereId/evaluations')
  @ApiOperation({ summary: 'Créer une évaluation (brouillon)' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiConflictResponse({ description: 'Une évaluation de ce nom existe déjà' })
  creer(
    @Param('matiereId') matiereId: string,
    @Body() dto: CreateEvaluationDto,
    @Req() request: MoiRequest,
  ) {
    return this.service.creer(enseignant(request), matiereId, dto);
  }

  @Patch('evaluations/:id')
  @ApiOperation({
    summary: 'Modifier une de mes évaluations (brouillon seulement)',
  })
  @ApiConflictResponse({
    description: 'Évaluation publiée, ou nom déjà utilisé',
  })
  modifier(
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationDto,
    @Req() request: MoiRequest,
  ) {
    return this.service.modifier(enseignant(request), id, dto);
  }

  @Delete('evaluations/:id')
  @ApiOperation({
    summary:
      'Supprimer une de mes évaluations (brouillon seulement, avec ses notes)',
  })
  @ApiConflictResponse({ description: 'Évaluation publiée' })
  supprimer(@Param('id') id: string, @Req() request: MoiRequest) {
    return this.service.supprimer(enseignant(request), id);
  }

  @Get('evaluations/:id/notes')
  @ApiOperation({
    summary:
      'Grille de saisie : inscrits VALIDE de la matière, avec leur note éventuelle',
  })
  grille(@Param('id') id: string, @Req() request: MoiRequest) {
    return this.service.grille(enseignant(request), id);
  }

  @Put('evaluations/:id/notes')
  @ApiOperation({
    summary:
      'Saisie en lot (tout ou rien) avec contrôle de concurrence par updatedAt',
    description:
      'Chaque ligne remplace la note de l’inscription. `updatedAt` = valeur lue dans la grille ' +
      '(absent si aucune note). Erreurs par ligne dans `erreurs` : NON_NOTABLE, VALEUR_INVALIDE (400), ' +
      'CONFLIT (409).',
  })
  @ApiOkResponse({
    description: 'Notes enregistrées, avec leur nouvel updatedAt',
  })
  @ApiBadRequestResponse({
    description: 'Lignes invalides ou inscription non notable',
  })
  @ApiConflictResponse({
    description:
      'Évaluation publiée, ou notes modifiées entre-temps (rechargez la grille)',
  })
  saisir(
    @Param('id') id: string,
    @Body() dto: SaisieNotesDto,
    @Req() request: MoiRequest,
  ) {
    return this.service.saisir(enseignant(request), id, dto);
  }

  @Post('evaluations/:id/publier')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Publier l’évaluation : visible des étudiants, verrouillée pour l’enseignant',
  })
  @ApiConflictResponse({ description: 'Déjà publiée, ou aucune note saisie' })
  publier(@Param('id') id: string, @Req() request: MoiRequest) {
    return this.service.publier(enseignant(request), id);
  }
}
