import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  THROTTLE_PUBLIC,
  THROTTLE_SUIVI,
} from '../../common/throttle/public-throttle.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateCandidatureDto,
  UpdateCandidatureStatusDto,
} from './dto/candidature.dto';
import { CandidaturesService } from './candidatures.service';

@Controller('candidatures')
@ApiTags('candidatures')
export class CandidaturesController {
  constructor(private readonly service: CandidaturesService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [THROTTLE_SUIVI]: true })
  @ApiOperation({ summary: 'Soumettre une candidature publique' })
  @ApiCreatedResponse({ description: 'Candidature soumise' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiConflictResponse({
    description:
      'Candidature déjà en cours pour cet e-mail, cette filière et cette année',
  })
  @ApiTooManyRequestsResponse({ description: 'Limite de débit atteinte' })
  create(@Body() dto: CreateCandidatureDto) {
    return this.service.create(dto);
  }

  @Get('suivi/:numeroDossier')
  // Bornée contre l'énumération des numéros de dossier par force brute
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [THROTTLE_PUBLIC]: true })
  @ApiOperation({
    summary: 'Suivi public d’une candidature par numéro de dossier exact',
    description:
      'Renvoie uniquement : numéro, statut, nom, prénom, filière, école, année, date de dépôt. ' +
      'Limité à 30 consultations par minute et par IP (THROTTLE_SUIVI_LIMIT / THROTTLE_SUIVI_TTL_MS).',
  })
  @ApiOkResponse({ description: 'État de la candidature' })
  @ApiNotFoundResponse({ description: 'Numéro de dossier inconnu' })
  @ApiTooManyRequestsResponse({ description: 'Limite de débit atteinte' })
  suivi(@Param('numeroDossier') numeroDossier: string) {
    return this.service.suivi(numeroDossier);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SCOLARITE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les candidatures' })
  @ApiOkResponse({ description: 'Liste des candidatures' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  findAll(@Req() request: { user: { tenantId: string } }) {
    return this.service.findAll(request.user.tenantId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SCOLARITE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consulter une candidature' })
  @ApiOkResponse({ description: 'Candidature trouvée' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Candidature introuvable' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/statut')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SCOLARITE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Modifier le statut d’une candidature',
    description:
      'Transitions : SOUMIS → EN_EXAMEN | INCOMPLET | REJETE ; INCOMPLET → EN_EXAMEN | REJETE ; ' +
      'EN_EXAMEN → ACCEPTE | REJETE | INCOMPLET ; ACCEPTE → EN_EXAMEN | REJETE (tant qu’aucun ' +
      'compte étudiant n’existe) ; REJETE → EN_EXAMEN. Commentaire obligatoire pour rejeter ou rouvrir.',
  })
  @ApiOkResponse({ description: 'Statut modifié et historique enregistré' })
  @ApiBadRequestResponse({
    description:
      'Statut identique, transition interdite ou commentaire manquant',
  })
  @ApiConflictResponse({
    description: 'ACCEPTE définitif : un compte étudiant existe',
  })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Candidature introuvable' })
  updateStatus(
    @Param('id') id: string,
    @Req() request: { user: { id: string; tenantId: string } },
    @Body() dto: UpdateCandidatureStatusDto,
  ) {
    return this.service.updateStatus(id, request.user, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SCOLARITE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer une candidature' })
  @ApiOkResponse({ description: 'Candidature supprimée' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Candidature introuvable' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
