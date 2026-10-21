import {
  Body,
  Controller,
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
import { CreateEtudiantDto } from './dto/create-etudiant.dto';
import { UpdateEtudiantDto } from './dto/update-etudiant.dto';
import { EtudiantsService } from './etudiants.service';

@Controller('etudiants')
@ApiTags('etudiants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class EtudiantsController {
  constructor(private readonly service: EtudiantsService) {}

  private tenantId(request: { user: { tenantId: string } }) {
    return request.user.tenantId;
  }

  @Post()
  @ApiOperation({
    summary: 'Créer un étudiant depuis une candidature acceptée',
  })
  @ApiCreatedResponse({ description: 'Étudiant créé avec matricule généré' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Candidature introuvable' })
  create(
    @Body() dto: CreateEtudiantDto,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.create(dto, this.tenantId(request));
  }
  @Get()
  @ApiOperation({ summary: 'Lister les étudiants' })
  @ApiOkResponse({ description: 'Liste des étudiants' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  findAll(@Req() request: { user: { tenantId: string } }) {
    return this.service.findAll(this.tenantId(request));
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consulter un étudiant' })
  @ApiOkResponse({ description: 'Étudiant trouvé' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Étudiant introuvable' })
  findOne(
    @Param('id') id: string,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.findOne(id, this.tenantId(request));
  }
  @Patch(':id')
  @ApiOperation({
    summary: 'Modifier un étudiant (matricule IUC : import, jamais généré)',
  })
  @ApiOkResponse({ description: 'Étudiant modifié' })
  @ApiBadRequestResponse({ description: 'Format de matricule invalide' })
  @ApiNotFoundResponse({ description: 'Étudiant introuvable' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEtudiantDto,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.update(id, this.tenantId(request), dto);
  }
}
