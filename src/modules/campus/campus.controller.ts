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
  ApiConflictResponse,
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
import { CampusDto } from './dto/campus.dto';
import { CampusService } from './campus.service';

type TenantRequest = { user: { tenantId: string } };

@Controller('campus')
@ApiTags('campus')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class CampusController {
  constructor(private readonly service: CampusService) {}
  @Post()
  @ApiOperation({ summary: 'Créer un campus (tenant issu du JWT)' })
  @ApiCreatedResponse({ description: 'Campus créé' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiConflictResponse({ description: 'Un campus de ce nom existe déjà' })
  create(@Req() request: TenantRequest, @Body() dto: CampusDto) {
    return this.service.create(request.user.tenantId, dto);
  }
  @Get()
  @ApiOperation({ summary: 'Lister les campus avec le nombre d’écoles' })
  @ApiOkResponse({ description: 'Liste des campus (_count.ecoles)' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  findAll(@Req() request: TenantRequest) {
    return this.service.findAll(request.user.tenantId);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consulter un campus et ses écoles' })
  @ApiOkResponse({ description: 'Campus trouvé, avec ses écoles' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Campus introuvable' })
  findOne(@Req() request: TenantRequest, @Param('id') id: string) {
    return this.service.findOne(request.user.tenantId, id);
  }
  @Put(':id')
  @ApiOperation({ summary: 'Modifier un campus' })
  @ApiOkResponse({ description: 'Campus modifié' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Campus introuvable' })
  @ApiConflictResponse({ description: 'Un campus de ce nom existe déjà' })
  update(
    @Req() request: TenantRequest,
    @Param('id') id: string,
    @Body() dto: CampusDto,
  ) {
    return this.service.update(request.user.tenantId, id, dto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un campus sans école rattachée' })
  @ApiOkResponse({ description: 'Campus supprimé' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Campus introuvable' })
  @ApiConflictResponse({ description: 'Des écoles sont encore rattachées' })
  remove(@Req() request: TenantRequest, @Param('id') id: string) {
    return this.service.remove(request.user.tenantId, id);
  }
}
