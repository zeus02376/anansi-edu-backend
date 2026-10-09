import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { AffectationDto, EnseignantDto } from './dto/enseignant.dto';
import { EnseignantsService } from './enseignants.service';

@Controller('enseignants')
@ApiTags('enseignants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class EnseignantsController {
  constructor(private readonly service: EnseignantsService) {}
  @Post()
  @ApiOperation({ summary: 'Créer un enseignant' })
  @ApiCreatedResponse({ description: 'Enseignant créé' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  create(@Body() dto: EnseignantDto) {
    return this.service.create(dto);
  }
  @Get()
  @ApiOperation({ summary: 'Lister les enseignants' })
  @ApiOkResponse({ description: 'Liste des enseignants' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  findAll() {
    return this.service.findAll();
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consulter un enseignant' })
  @ApiOkResponse({ description: 'Enseignant trouvé' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Enseignant introuvable' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
  @Put(':id')
  @ApiOperation({ summary: 'Modifier un enseignant' })
  @ApiOkResponse({ description: 'Enseignant modifié' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Enseignant introuvable' })
  update(@Param('id') id: string, @Body() dto: EnseignantDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un enseignant' })
  @ApiOkResponse({ description: 'Enseignant supprimé' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Enseignant introuvable' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
  @Post(':id/affectations')
  @ApiOperation({ summary: 'Affecter une matière à un enseignant' })
  @ApiCreatedResponse({ description: 'Affectation créée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  createAffectation(@Param('id') id: string, @Body() dto: AffectationDto) {
    return this.service.createAffectation(id, dto);
  }
  @Get(':id/affectations')
  @ApiOperation({ summary: 'Lister les affectations d’un enseignant' })
  @ApiOkResponse({ description: 'Liste des affectations' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  findAffectations(@Param('id') id: string) {
    return this.service.findAffectations(id);
  }
}
