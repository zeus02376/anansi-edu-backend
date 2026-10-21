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
import { StaffOnly } from '../../common/decorators/staff-only.decorator';
import {
  CreerSalleDto,
  ListeSallesQueryDto,
  ModifierSalleDto,
} from './dto/salle.dto';
import { SallesService } from './salles.service';

type PersonnelRequest = { user: { id: string; tenantId: string } };

/** Salles des campus de l'établissement (ADMIN, SCOLARITE). */
@Controller('salles')
@ApiTags('planning (personnel)')
@StaffOnly()
@ApiNotFoundResponse({
  description: 'Ressource inexistante ou d’un autre établissement',
})
export class SallesController {
  constructor(private readonly service: SallesService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une salle dans un campus' })
  @ApiCreatedResponse({ description: 'Salle créée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiConflictResponse({ description: 'Code déjà utilisé dans ce campus' })
  creer(@Body() dto: CreerSalleDto, @Req() request: PersonnelRequest) {
    return this.service.creer(request.user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les salles (filtre campusId)' })
  @ApiOkResponse({ description: 'Salles de l’établissement' })
  lister(
    @Query() query: ListeSallesQueryDto,
    @Req() request: PersonnelRequest,
  ) {
    return this.service.lister(request.user.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulter une salle' })
  consulter(@Param('id') id: string, @Req() request: PersonnelRequest) {
    return this.service.consulter(request.user.tenantId, id);
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Modifier une salle (le campus ne change pas ; remplace les champs)',
  })
  @ApiConflictResponse({ description: 'Code déjà utilisé dans ce campus' })
  modifier(
    @Param('id') id: string,
    @Body() dto: ModifierSalleDto,
    @Req() request: PersonnelRequest,
  ) {
    return this.service.modifier(request.user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une salle sans séance liée' })
  @ApiConflictResponse({
    description: 'Des séances (à venir ou passées) utilisent cette salle',
  })
  supprimer(@Param('id') id: string, @Req() request: PersonnelRequest) {
    return this.service.supprimer(request.user.tenantId, id);
  }
}
