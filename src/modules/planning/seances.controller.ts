import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { StaffOnly } from '../../common/decorators/staff-only.decorator';
import {
  AnnulerSeanceDto,
  CreerSeanceDto,
  CreerSerieDto,
  FenetreQueryDto,
  ListeSeancesQueryDto,
  ModifierSeanceDto,
} from './dto/seance.dto';
import { SeancesService } from './seances.service';

type PersonnelRequest = { user: { id: string; tenantId: string } };

const CONFLIT =
  'Conflit d’horaire (enseignant, salle ou classe) : corps { message, conflits[] }, rien n’est enregistré';

/** Séances du planning : création, consultation et corrections par le personnel. */
@Controller('seances')
@ApiTags('planning (personnel)')
@StaffOnly()
@ApiNotFoundResponse({
  description: 'Ressource inexistante ou d’un autre établissement',
})
export class SeancesController {
  constructor(private readonly service: SeancesService) {}

  @Post()
  @ApiOperation({
    summary:
      'Créer une séance (dryRun : calcule les conflits sans rien créer, réponse 200)',
  })
  @ApiCreatedResponse({ description: 'Séance créée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiConflictResponse({ description: CONFLIT })
  async creer(
    @Body() dto: CreerSeanceDto,
    @Req() request: PersonnelRequest,
    @Res({ passthrough: true }) reponse: Response,
  ) {
    if (dto.dryRun) reponse.status(200);
    return this.service.creer(request.user.tenantId, request.user.id, dto);
  }

  @Post('serie')
  @ApiOperation({
    summary:
      'Créer des séances hebdomadaires en lot, tout ou rien (dryRun : conflits sans rien créer, réponse 200)',
  })
  @ApiCreatedResponse({ description: '{ serieId, nombre, seances }' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiConflictResponse({ description: CONFLIT })
  async creerSerie(
    @Body() dto: CreerSerieDto,
    @Req() request: PersonnelRequest,
    @Res({ passthrough: true }) reponse: Response,
  ) {
    if (dto.dryRun) reponse.status(200);
    return this.service.creerSerie(request.user.tenantId, request.user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Lister les séances d’une période (du, au : 366 jours max) avec filtres',
  })
  @ApiOkResponse({ description: 'Séances triées par date et heure' })
  lister(
    @Query() query: ListeSeancesQueryDto,
    @Req() request: PersonnelRequest,
  ) {
    return this.service.lister(request.user.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulter une séance' })
  consulter(@Param('id') id: string, @Req() request: PersonnelRequest) {
    return this.service.consulter(request.user.tenantId, id);
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Modifier une séance (champs fournis seulement) avec une portée : cette_seance, suivantes ou serie',
  })
  @ApiOkResponse({
    description:
      'La séance (cette_seance) ou { serieId, nombre, seances } ; avec dryRun : conflits sans rien modifier',
  })
  @ApiConflictResponse({ description: CONFLIT })
  modifier(
    @Param('id') id: string,
    @Body() dto: ModifierSeanceDto,
    @Req() request: PersonnelRequest,
  ) {
    return this.service.modifier(request.user.tenantId, id, dto);
  }

  @Post(':id/annuler')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Annuler une séance (motif obligatoire) : elle reste visible et ne bloque plus personne',
  })
  @ApiConflictResponse({ description: 'Séance déjà annulée' })
  annuler(
    @Param('id') id: string,
    @Body() dto: AnnulerSeanceDto,
    @Req() request: PersonnelRequest,
  ) {
    return this.service.annuler(request.user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une séance' })
  supprimer(@Param('id') id: string, @Req() request: PersonnelRequest) {
    return this.service.supprimer(request.user.tenantId, id);
  }
}

/** Audit du planning : conflits existants, sans rien bloquer. */
@Controller('planning')
@ApiTags('planning (personnel)')
@StaffOnly()
export class PlanningController {
  constructor(private readonly service: SeancesService) {}

  @Get('conflits')
  @ApiOperation({
    summary:
      'Audit : conflits entre séances non annulées sur une période (du, au : 366 jours max)',
  })
  @ApiOkResponse({ description: '{ du, au, nombre, conflits[] }' })
  conflits(@Query() query: FenetreQueryDto, @Req() request: PersonnelRequest) {
    return this.service.auditer(request.user.tenantId, query);
  }
}
