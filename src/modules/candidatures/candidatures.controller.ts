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
  ApiCreatedResponse,
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
  CreateCandidatureDto,
  UpdateCandidatureStatusDto,
} from './dto/candidature.dto';
import { CandidaturesService } from './candidatures.service';

@Controller('candidatures')
@ApiTags('candidatures')
export class CandidaturesController {
  constructor(private readonly service: CandidaturesService) {}

  @Post()
  @ApiOperation({ summary: 'Soumettre une candidature publique' })
  @ApiCreatedResponse({ description: 'Candidature soumise' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  create(@Body() dto: CreateCandidatureDto) {
    return this.service.create(dto);
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
  @ApiOperation({ summary: 'Modifier le statut d’une candidature' })
  @ApiOkResponse({ description: 'Statut modifié et historique enregistré' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Candidature introuvable' })
  updateStatus(
    @Param('id') id: string,
    @Req() request: { user: { id: string } },
    @Body() dto: UpdateCandidatureStatusDto,
  ) {
    return this.service.updateStatus(id, request.user.id, dto);
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
