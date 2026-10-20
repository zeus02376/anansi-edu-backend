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
import { StaffOnly } from '../../common/decorators/staff-only.decorator';
import { CatalogueQueryDto } from '../../common/dto/catalogue-query.dto';
import { PublicTenantService } from '../../common/tenant/public-tenant.service';
import { AnneeAcademiqueDto } from './dto/annee-academique.dto';
import { AnneesAcademiquesService } from './annees-academiques.service';

@Controller('annees-academiques')
@ApiTags('annees-academiques')
export class AnneesAcademiquesController {
  constructor(
    private readonly service: AnneesAcademiquesService,
    private readonly tenants: PublicTenantService,
  ) {}

  // Déclarée avant :id, sinon « ouvertes » serait lu comme un identifiant
  @Get('ouvertes')
  @ApiOperation({
    summary: 'Années académiques ouvertes aux candidatures (public)',
    description:
      'Années actives de l’établissement (?tenant=<slug>, facultatif tant qu’il n’y en a qu’un). ' +
      'Liste vide si aucune candidature n’est ouverte.',
  })
  @ApiOkResponse({ description: 'Années actives : id, libellé, dates' })
  @ApiBadRequestResponse({ description: 'Établissement ambigu' })
  async ouvertes(@Query() query: CatalogueQueryDto) {
    return this.service.findOuvertes(
      await this.tenants.resolveId(query.tenant),
    );
  }

  @Post()
  @StaffOnly()
  @ApiOperation({ summary: 'Créer une année académique' })
  @ApiCreatedResponse({ description: 'Année académique créée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  create(
    @Body() dto: AnneeAcademiqueDto,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.create(request.user.tenantId, dto);
  }

  @Get()
  @StaffOnly()
  @ApiOperation({ summary: 'Lister les années académiques' })
  @ApiOkResponse({ description: 'Liste des années académiques' })
  findAll(@Req() request: { user: { tenantId: string } }) {
    return this.service.findAll(request.user.tenantId);
  }

  @Get(':id')
  @StaffOnly()
  @ApiOperation({ summary: 'Consulter une année académique' })
  @ApiOkResponse({ description: 'Année académique trouvée' })
  @ApiNotFoundResponse({ description: 'Année académique introuvable' })
  findOne(
    @Param('id') id: string,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.findOne(request.user.tenantId, id);
  }

  @Put(':id')
  @StaffOnly()
  @ApiOperation({ summary: 'Modifier une année académique' })
  @ApiOkResponse({ description: 'Année académique modifiée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiNotFoundResponse({ description: 'Année académique introuvable' })
  update(
    @Param('id') id: string,
    @Body() dto: AnneeAcademiqueDto,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.update(request.user.tenantId, id, dto);
  }

  @Delete(':id')
  @StaffOnly()
  @ApiOperation({ summary: 'Supprimer une année académique' })
  @ApiOkResponse({ description: 'Année académique supprimée' })
  @ApiNotFoundResponse({ description: 'Année académique introuvable' })
  remove(
    @Param('id') id: string,
    @Req() request: { user: { tenantId: string } },
  ) {
    return this.service.remove(request.user.tenantId, id);
  }
}
