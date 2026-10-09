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
import { EcoleDto } from './dto/ecole.dto';
import { EcolesService } from './ecoles.service';

@Controller('ecoles')
@ApiTags('ecoles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class EcolesController {
  constructor(private readonly service: EcolesService) {}
  @Post()
  @ApiOperation({ summary: 'Créer une école' })
  @ApiCreatedResponse({ description: 'École créée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  create(@Body() dto: EcoleDto) {
    return this.service.create(dto);
  }
  @Get()
  @ApiOperation({ summary: 'Lister les écoles' })
  @ApiOkResponse({ description: 'Liste des écoles' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  findAll() {
    return this.service.findAll();
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consulter une école' })
  @ApiOkResponse({ description: 'École trouvée' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'École introuvable' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
  @Put(':id')
  @ApiOperation({ summary: 'Modifier une école' })
  @ApiOkResponse({ description: 'École modifiée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'École introuvable' })
  update(@Param('id') id: string, @Body() dto: EcoleDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une école' })
  @ApiOkResponse({ description: 'École supprimée' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'École introuvable' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
