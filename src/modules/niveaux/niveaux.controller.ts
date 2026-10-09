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
import { NiveauDto } from './dto/niveau.dto';
import { NiveauxService } from './niveaux.service';

@Controller('niveaux')
@ApiTags('niveaux')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class NiveauxController {
  constructor(private readonly service: NiveauxService) {}
  @Post()
  @ApiOperation({ summary: 'Créer un niveau' })
  @ApiCreatedResponse({ description: 'Niveau créé' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  create(@Body() dto: NiveauDto) {
    return this.service.create(dto);
  }
  @Get()
  @ApiOperation({ summary: 'Lister les niveaux' })
  @ApiOkResponse({ description: 'Liste des niveaux' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  findAll() {
    return this.service.findAll();
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consulter un niveau' })
  @ApiOkResponse({ description: 'Niveau trouvé' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Niveau introuvable' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
  @Put(':id')
  @ApiOperation({ summary: 'Modifier un niveau' })
  @ApiOkResponse({ description: 'Niveau modifié' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Niveau introuvable' })
  update(@Param('id') id: string, @Body() dto: NiveauDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un niveau' })
  @ApiOkResponse({ description: 'Niveau supprimé' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Niveau introuvable' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
