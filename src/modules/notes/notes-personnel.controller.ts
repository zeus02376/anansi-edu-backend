import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { StaffOnly } from '../../common/decorators/staff-only.decorator';
import {
  CorrectionNoteDto,
  ListeEvaluationsQueryDto,
  MotifDto,
  ReleveQueryDto,
} from './dto/notes-personnel.dto';
import { NotesPersonnelService } from './notes-personnel.service';
import { ReleveService } from './releve.service';

type PersonnelRequest = { user: { id: string; tenantId: string } };

/** Évaluations : consultation, publication et dépublication par le personnel. */
@Controller('evaluations')
@ApiTags('notes (personnel)')
@StaffOnly()
@ApiNotFoundResponse({
  description: 'Ressource inexistante ou d’un autre établissement',
})
export class EvaluationsPersonnelController {
  constructor(private readonly service: NotesPersonnelService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les évaluations de l’établissement' })
  @ApiOkResponse({ description: 'Évaluations (filtres matiereId, anneeId)' })
  lister(
    @Query() query: ListeEvaluationsQueryDto,
    @Req() request: PersonnelRequest,
  ) {
    return this.service.listerEvaluations(request.user.tenantId, query);
  }

  @Get(':id/notes')
  @ApiOperation({
    summary: 'Grille d’une évaluation : notes, journal des publications',
  })
  grille(@Param('id') id: string, @Req() request: PersonnelRequest) {
    return this.service.grille(request.user.tenantId, id);
  }

  @Post(':id/publier')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publier une évaluation (au moins une note)' })
  @ApiConflictResponse({ description: 'Déjà publiée, ou aucune note saisie' })
  publier(@Param('id') id: string, @Req() request: PersonnelRequest) {
    return this.service.publier(request.user.tenantId, request.user.id, id);
  }

  @Post(':id/depublier')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Dépublier une évaluation (elle redevient modifiable par son enseignant)',
  })
  @ApiBadRequestResponse({ description: 'Motif obligatoire' })
  @ApiConflictResponse({ description: 'Évaluation non publiée' })
  depublier(
    @Param('id') id: string,
    @Body() dto: MotifDto,
    @Req() request: PersonnelRequest,
  ) {
    return this.service.depublier(
      request.user.tenantId,
      request.user.id,
      id,
      dto.motif,
    );
  }
}

/** Notes : correction avec motif et consultation du journal. */
@Controller('notes')
@ApiTags('notes (personnel)')
@StaffOnly()
@ApiNotFoundResponse({
  description: 'Ressource inexistante ou d’un autre établissement',
})
export class NotesPersonnelController {
  constructor(private readonly service: NotesPersonnelService) {}

  @Put(':id')
  @ApiOperation({
    summary:
      'Corriger une note (publiée ou non), motif obligatoire, journalisée',
    description:
      'Remplace état, valeur et commentaire. `updatedAt` facultatif : s’il est fourni et périmé, 409.',
  })
  @ApiBadRequestResponse({
    description: 'Motif manquant, valeur invalide ou aucune modification',
  })
  @ApiConflictResponse({ description: 'Note modifiée entre-temps' })
  corriger(
    @Param('id') id: string,
    @Body() dto: CorrectionNoteDto,
    @Req() request: PersonnelRequest,
  ) {
    return this.service.corriger(
      request.user.tenantId,
      request.user.id,
      id,
      dto,
    );
  }

  @Get(':id/historique')
  @ApiOperation({ summary: 'Journal des corrections d’une note' })
  historique(@Param('id') id: string, @Req() request: PersonnelRequest) {
    return this.service.historique(request.user.tenantId, id);
  }
}

/** Relevé de notes d'un étudiant (personnel). */
@Controller('etudiants')
@ApiTags('notes (personnel)')
@StaffOnly()
@ApiNotFoundResponse({
  description: 'Étudiant ou année inexistant, ou d’un autre établissement',
})
export class ReleveController {
  constructor(private readonly service: ReleveService) {}

  @Get(':id/releve')
  @ApiOperation({
    summary:
      'Relevé d’un étudiant : notes et moyennes par matière, calculées à la volée',
    description:
      'Seules les évaluations publiées comptent ; absent = 0, dispensé = exclu ; moyenne générale ' +
      'pondérée par le coefficient des matières.',
  })
  releve(
    @Param('id') id: string,
    @Query() query: ReleveQueryDto,
    @Req() request: PersonnelRequest,
  ) {
    return this.service.releve(request.user.tenantId, id, query.anneeId);
  }
}
