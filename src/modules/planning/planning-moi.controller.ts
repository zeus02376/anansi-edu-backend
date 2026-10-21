import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
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
import { SemaineQueryDto } from './dto/publication.dto';
import { FenetreQueryDto } from './dto/seance.dto';
import { PlanningMoiService } from './planning-moi.service';

type MoiRequest = { user: { id: string } };

/**
 * Planning de l'enseignant connecté : l'identité vient uniquement du JWT (aucun :id).
 * Séances publiées dont il est l'enseignant, sur des matières auxquelles il est affecté.
 */
@Controller('enseignants/me')
@ApiTags('planning (enseignant)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ENSEIGNANT)
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@ApiForbiddenResponse({ description: 'Rôle ENSEIGNANT requis' })
@ApiNotFoundResponse({ description: 'Aucun profil enseignant pour ce compte' })
export class EnseignantPlanningController {
  constructor(private readonly service: PlanningMoiService) {}

  @Get('seances')
  @ApiOperation({
    summary: 'Mes séances publiées sur une période (du, au : 366 jours max)',
  })
  @ApiOkResponse({ description: 'Séances triées par date et heure' })
  seances(@Query() query: FenetreQueryDto, @Req() request: MoiRequest) {
    return this.service.seancesEnseignant(request.user.id, query.du, query.au);
  }

  @Get('planning/hebdo')
  @ApiOperation({
    summary: 'Ma semaine (ISO, ex. 2027-W05) : sept jours, lundi à dimanche',
  })
  @ApiOkResponse({
    description: '{ semaine, du, au, jours[{ date, seances }] }',
  })
  hebdo(@Query() query: SemaineQueryDto, @Req() request: MoiRequest) {
    return this.service.hebdoEnseignant(request.user.id, query.semaine);
  }
}

/**
 * Planning de l'étudiant connecté : l'identité vient uniquement du JWT (aucun :id).
 * Séances publiées de ses inscriptions VALIDE (niveau, année, rythme).
 */
@Controller('etudiants/me')
@ApiTags('planning (étudiant)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ETUDIANT)
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@ApiForbiddenResponse({ description: 'Rôle ETUDIANT requis' })
@ApiNotFoundResponse({ description: 'Aucun profil étudiant pour ce compte' })
export class EtudiantPlanningController {
  constructor(private readonly service: PlanningMoiService) {}

  @Get('seances')
  @ApiOperation({
    summary:
      'Les séances publiées de ma classe sur une période (du, au : 366 jours max)',
  })
  @ApiOkResponse({ description: 'Séances triées par date et heure' })
  seances(@Query() query: FenetreQueryDto, @Req() request: MoiRequest) {
    return this.service.seancesEtudiant(request.user.id, query.du, query.au);
  }

  @Get('planning/hebdo')
  @ApiOperation({
    summary: 'Ma semaine (ISO, ex. 2027-W05) : sept jours, lundi à dimanche',
  })
  @ApiOkResponse({
    description: '{ semaine, du, au, jours[{ date, seances }] }',
  })
  hebdo(@Query() query: SemaineQueryDto, @Req() request: MoiRequest) {
    return this.service.hebdoEtudiant(request.user.id, query.semaine);
  }
}
