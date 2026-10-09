import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
import { CreateEtudiantDto } from './dto/create-etudiant.dto';
import { EtudiantsService } from './etudiants.service';

@Controller('etudiants')
@ApiTags('etudiants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class EtudiantsController {
  constructor(private readonly service: EtudiantsService) {}
  @Post()
  @ApiOperation({
    summary: 'Créer un étudiant depuis une candidature acceptée',
  })
  @ApiCreatedResponse({ description: 'Étudiant créé avec matricule généré' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Candidature introuvable' })
  create(@Body() dto: CreateEtudiantDto) {
    return this.service.createFromCandidature(dto);
  }
  @Get()
  @ApiOperation({ summary: 'Lister les étudiants' })
  @ApiOkResponse({ description: 'Liste des étudiants' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  findAll() {
    return this.service.findAll();
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consulter un étudiant' })
  @ApiOkResponse({ description: 'Étudiant trouvé' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Étudiant introuvable' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
