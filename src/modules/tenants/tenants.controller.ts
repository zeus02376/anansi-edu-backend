import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { TenantDto } from './dto/tenant.dto';
import { TenantsService } from './tenants.service';

type TenantRequest = { user: { tenantId: string } };

@Controller('tenants')
@ApiTags('tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer le tenant initial (bootstrap)' })
  @ApiCreatedResponse({ description: 'Tenant créé' })
  @ApiConflictResponse({ description: 'Le tenant initial existe déjà' })
  create(@Body() dto: TenantDto) {
    return this.service.create(dto);
  }

  @Get()
  @AdminOnly()
  @ApiOperation({
    summary: 'Lister les tenants (uniquement celui du JWT)',
    description:
      'Déprécié : renvoie une liste contenant uniquement l’établissement du JWT. Utiliser GET /tenants/me.',
    deprecated: true,
  })
  @ApiOkResponse({ description: 'Liste réduite à l’établissement du JWT' })
  findAll(@Req() request: TenantRequest) {
    return this.service
      .findMine(request.user.tenantId)
      .then((tenant) => [tenant]);
  }

  // Déclarée avant :id, sinon « me » serait lu comme un identifiant
  @Get('me')
  @AdminOnly()
  @ApiOperation({ summary: 'Consulter l’établissement du JWT' })
  @ApiOkResponse({ description: 'Établissement de l’utilisateur connecté' })
  findMine(@Req() request: TenantRequest) {
    return this.service.findMine(request.user.tenantId);
  }

  @Get(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Consulter son établissement par identifiant' })
  @ApiOkResponse({ description: 'Tenant trouvé' })
  @ApiNotFoundResponse({
    description: 'Tenant introuvable ou autre établissement',
  })
  findOne(@Param('id') id: string, @Req() request: TenantRequest) {
    return this.service.findOne(request.user.tenantId, id);
  }

  @Put(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Modifier son établissement' })
  @ApiOkResponse({ description: 'Tenant modifié' })
  @ApiNotFoundResponse({
    description: 'Tenant introuvable ou autre établissement',
  })
  update(
    @Param('id') id: string,
    @Body() dto: TenantDto,
    @Req() request: TenantRequest,
  ) {
    return this.service.update(request.user.tenantId, id, dto);
  }
}
