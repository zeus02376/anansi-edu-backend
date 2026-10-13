import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { StaffOnly } from '../../common/decorators/staff-only.decorator';
import { CatalogueQueryDto } from '../../common/dto/catalogue-query.dto';
import { PublicTenantService } from '../../common/tenant/public-tenant.service';
import { FiliereDto } from './dto/filiere.dto';
import { FilieresService } from './filieres.service';

@Controller('filieres')
@ApiTags('filieres')
export class FilieresController {
  constructor(
    private readonly service: FilieresService,
    private readonly tenants: PublicTenantService,
  ) {}
  @Post()
  @StaffOnly()
  @ApiOperation({ summary: 'Créer une filière' })
  @ApiCreatedResponse({ description: 'Filière créée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  create(@Body() dto: FiliereDto) {
    return this.service.create(dto);
  }
  @Get()
  @ApiOperation({
    summary: 'Lister les filières avec école et campus (public)',
  })
  @ApiOkResponse({ description: 'Liste des filières' })
  @ApiBadRequestResponse({ description: 'Établissement ambigu' })
  async findAll(@Query() query: CatalogueQueryDto) {
    return this.service.findAll(await this.tenants.resolveId(query.tenant));
  }
  @Get(':id')
  @ApiOperation({
    summary: 'Consulter une filière avec école et campus (public)',
  })
  @ApiOkResponse({ description: 'Filière trouvée' })
  @ApiNotFoundResponse({ description: 'Filière introuvable' })
  async findOne(@Param('id') id: string, @Query() query: CatalogueQueryDto) {
    return this.service.findOne(await this.tenants.resolveId(query.tenant), id);
  }
  @Put(':id')
  @StaffOnly()
  @ApiOperation({ summary: 'Modifier une filière' })
  @ApiOkResponse({ description: 'Filière modifiée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiNotFoundResponse({ description: 'Filière introuvable' })
  update(@Param('id') id: string, @Body() dto: FiliereDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @StaffOnly()
  @ApiOperation({ summary: 'Supprimer une filière' })
  @ApiOkResponse({ description: 'Filière supprimée' })
  @ApiNotFoundResponse({ description: 'Filière introuvable' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
