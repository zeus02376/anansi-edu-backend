import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { StaffOnly } from '../../common/decorators/staff-only.decorator';
import { CatalogueQueryDto } from '../../common/dto/catalogue-query.dto';
import { PublicTenantService } from '../../common/tenant/public-tenant.service';
import { EcoleDto } from './dto/ecole.dto';
import { EcolesService } from './ecoles.service';

@Controller('ecoles')
@ApiTags('ecoles')
export class EcolesController {
  constructor(
    private readonly service: EcolesService,
    private readonly tenants: PublicTenantService,
  ) {}
  @Post()
  @StaffOnly()
  @ApiOperation({ summary: 'Créer une école' })
  @ApiCreatedResponse({ description: 'École créée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  create(
    @Body() dto: EcoleDto,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.create(request.user.tenantId, dto);
  }
  @Get()
  @ApiOperation({ summary: 'Lister les écoles avec leur campus (public)' })
  @ApiOkResponse({ description: 'Liste des écoles' })
  @ApiBadRequestResponse({ description: 'Établissement ambigu' })
  async findAll(@Query() query: CatalogueQueryDto) {
    return this.service.findAll(await this.tenants.resolveId(query.tenant));
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consulter une école et son campus (public)' })
  @ApiOkResponse({ description: 'École trouvée' })
  @ApiNotFoundResponse({ description: 'École introuvable' })
  async findOne(@Param('id') id: string, @Query() query: CatalogueQueryDto) {
    return this.service.findOne(await this.tenants.resolveId(query.tenant), id);
  }
  @Put(':id')
  @StaffOnly()
  @ApiOperation({ summary: 'Modifier une école' })
  @ApiOkResponse({ description: 'École modifiée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiNotFoundResponse({ description: 'École introuvable' })
  update(
    @Param('id') id: string,
    @Body() dto: EcoleDto,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.update(request.user.tenantId, id, dto);
  }
  @Delete(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Supprimer une école' })
  @ApiOkResponse({ description: 'École supprimée' })
  @ApiNotFoundResponse({ description: 'École introuvable' })
  remove(
    @Param('id') id: string,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.remove(request.user.tenantId, id);
  }
}
