import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
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
import { InscriptionDto } from './dto/inscription.dto';
import { InscriptionsService } from './inscriptions.service';

@Controller('inscriptions')
@ApiTags('inscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class InscriptionsController {
  constructor(private readonly service: InscriptionsService) {}
  @Post()
  @ApiOperation({ summary: 'Inscrire un étudiant à un niveau et une année' })
  @ApiCreatedResponse({ description: 'Inscription créée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  create(
    @Body() dto: InscriptionDto,
    @Request() req: { user: { sub: string; tenantId: string } },
  ) {
    return this.service.create(req.user.tenantId, dto, req.user.sub);
  }
  @Get()
  @ApiOperation({ summary: 'Lister les inscriptions' })
  @ApiOkResponse({ description: 'Liste des inscriptions' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  findAll(@Req() request: { user: { tenantId: string } }) {
    return this.service.findAll(request.user.tenantId);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consulter une inscription' })
  @ApiOkResponse({ description: 'Inscription trouvée' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Inscription introuvable' })
  findOne(
    @Param('id') id: string,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.findOne(request.user.tenantId, id);
  }
  @Put(':id')
  @ApiOperation({ summary: 'Modifier une inscription' })
  @ApiOkResponse({ description: 'Inscription modifiée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Inscription introuvable' })
  update(
    @Param('id') id: string,
    @Body() dto: InscriptionDto,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.update(request.user.tenantId, id, dto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une inscription' })
  @ApiOkResponse({ description: 'Inscription supprimée' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN ou SCOLARITE requis' })
  @ApiNotFoundResponse({ description: 'Inscription introuvable' })
  remove(
    @Param('id') id: string,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.remove(request.user.tenantId, id);
  }
}
