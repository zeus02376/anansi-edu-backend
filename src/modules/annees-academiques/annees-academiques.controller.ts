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
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AnneeAcademiqueDto } from './dto/annee-academique.dto';
import { AnneesAcademiquesService } from './annees-academiques.service';

@Controller('annees-academiques')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class AnneesAcademiquesController {
  constructor(private readonly service: AnneesAcademiquesService) {}
  @Post()
  create(@Body() dto: AnneeAcademiqueDto) {
    return this.service.create(dto);
  }
  @Get()
  findAll() {
    return this.service.findAll();
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: AnneeAcademiqueDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
