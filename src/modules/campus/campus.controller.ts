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
  ApiConflictResponse,
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
import { CampusDto } from './dto/campus.dto';
import { CampusService } from './campus.service';

type TenantRequest = { user: { tenantId: string } };

@Controller('campus')
@ApiTags('campus')
export class CampusController {
  constructor(
    private readonly service: CampusService,
    private readonly tenants: PublicTenantService,
  ) {}
  @Post()
  @StaffOnly()
  @ApiOperation({ summary: 'Créer un campus (tenant issu du JWT)' })
  @ApiCreatedResponse({ description: 'Campus créé' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiConflictResponse({ description: 'Un campus de ce nom existe déjà' })
  create(@Req() request: TenantRequest, @Body() dto: CampusDto) {
    return this.service.create(request.user.tenantId, dto);
  }
  @Get()
  @ApiOperation({
    summary: 'Lister les campus avec le nombre d’écoles (public)',
  })
  @ApiOkResponse({ description: 'Liste des campus (_count.ecoles)' })
  @ApiBadRequestResponse({ description: 'Établissement ambigu' })
  async findAll(@Query() query: CatalogueQueryDto) {
    return this.service.findAll(await this.tenants.resolveId(query.tenant));
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consulter un campus et ses écoles (public)' })
  @ApiOkResponse({ description: 'Campus trouvé, avec ses écoles' })
  @ApiNotFoundResponse({ description: 'Campus introuvable' })
  async findOne(@Param('id') id: string, @Query() query: CatalogueQueryDto) {
    return this.service.findOne(await this.tenants.resolveId(query.tenant), id);
  }
  @Put(':id')
  @StaffOnly()
  @ApiOperation({ summary: 'Modifier un campus' })
  @ApiOkResponse({ description: 'Campus modifié' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
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
  @AdminOnly()
  @ApiOperation({ summary: 'Supprimer un campus sans école rattachée' })
  @ApiOkResponse({ description: 'Campus supprimé' })
  @ApiNotFoundResponse({ description: 'Campus introuvable' })
  @ApiConflictResponse({ description: 'Des écoles sont encore rattachées' })
  remove(@Req() request: TenantRequest, @Param('id') id: string) {
    return this.service.remove(request.user.tenantId, id);
  }
}
