import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { MatiereDto } from './dto/matiere.dto';
import { MatieresService } from './matieres.service';

@Controller('matieres')
@ApiTags('matieres')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class MatieresController {
  constructor(private readonly service: MatieresService) {}
  @Post()
  @ApiOperation({ summary: 'Créer une matière' })
  @ApiCreatedResponse({ description: 'Matière créée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  create(
    @Body() dto: MatiereDto,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.create(request.user.tenantId, dto);
  }
  @Get()
  @ApiOperation({ summary: 'Lister les matières' })
  @ApiOkResponse({ description: 'Liste des matières' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  findAll(@Req() request: { user: { tenantId: string } }) {
    return this.service.findAll(request.user.tenantId);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consulter une matière' })
  @ApiOkResponse({ description: 'Matière trouvée' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Matière introuvable' })
  findOne(
    @Param('id') id: string,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.findOne(request.user.tenantId, id);
  }
  @Put(':id')
  @ApiOperation({ summary: 'Modifier une matière' })
  @ApiOkResponse({ description: 'Matière modifiée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Matière introuvable' })
  update(
    @Param('id') id: string,
    @Body() dto: MatiereDto,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.update(request.user.tenantId, id, dto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une matière' })
  @ApiOkResponse({ description: 'Matière supprimée' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Matière introuvable' })
  remove(
    @Param('id') id: string,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.remove(request.user.tenantId, id);
  }
}
