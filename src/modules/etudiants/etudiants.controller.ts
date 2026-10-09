import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateEtudiantDto } from './dto/create-etudiant.dto';
import { EtudiantsService } from './etudiants.service';

@Controller('etudiants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class EtudiantsController {
  constructor(private readonly service: EtudiantsService) {}
  @Post()
  create(@Body() dto: CreateEtudiantDto) {
    return this.service.createFromCandidature(dto);
  }
  @Get()
  findAll() {
    return this.service.findAll();
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
