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
import { AffectationDto, EnseignantDto } from './dto/enseignant.dto';
import { EnseignantsService } from './enseignants.service';

@Controller('enseignants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class EnseignantsController {
  constructor(private readonly service: EnseignantsService) {}
  @Post()
  create(@Body() dto: EnseignantDto) {
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
  update(@Param('id') id: string, @Body() dto: EnseignantDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
  @Post(':id/affectations')
  createAffectation(@Param('id') id: string, @Body() dto: AffectationDto) {
    return this.service.createAffectation(id, dto);
  }
  @Get(':id/affectations')
  findAffectations(@Param('id') id: string) {
    return this.service.findAffectations(id);
  }
}
