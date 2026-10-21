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
import { ReleveQueryDto } from './dto/notes-personnel.dto';
import { NotesEtudiantService } from './notes-etudiant.service';

type MoiRequest = { user: { id: string } };

/**
 * Notes de l'étudiant connecté : l'identité vient uniquement du JWT (aucun :id).
 * Ne reçoit que `anneeId` en paramètre.
 */
@Controller('etudiants/me')
@ApiTags('notes (étudiant)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ETUDIANT)
@ApiUnauthorizedResponse({ description: 'Authentification requise' })
@ApiForbiddenResponse({ description: 'Rôle ETUDIANT requis' })
export class NotesEtudiantController {
  constructor(private readonly service: NotesEtudiantService) {}

  @Get('notes')
  @ApiOperation({
    summary: 'Mes notes publiées et mes moyennes (provisoires), par année',
    description:
      'Seules les évaluations publiées apparaissent. Moyennes calculées à la volée comme le relevé du personnel ' +
      '(absent = 0, dispensé et non noté exclus), provisoires faute de clôture de période. ' +
      'Sans anneeId : toutes mes années, la plus récente d’abord. Aucune moyenne de classe ni rang.',
  })
  @ApiOkResponse({ description: 'Notes et moyennes par année et par matière' })
  @ApiNotFoundResponse({
    description: 'Aucun profil étudiant, ou année d’un autre établissement',
  })
  mesNotes(@Query() query: ReleveQueryDto, @Req() request: MoiRequest) {
    return this.service.mesNotes(request.user.id, query.anneeId);
  }
}
