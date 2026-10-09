import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateCandidatureDto,
  UpdateCandidatureStatusDto,
} from './dto/candidature.dto';
import { CandidaturesService } from './candidatures.service';

@Controller('candidatures')
export class CandidaturesController {
  constructor(private readonly service: CandidaturesService) {}

  @Post()
  create(@Body() dto: CreateCandidatureDto) {
    return this.service.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SCOLARITE)
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SCOLARITE)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/statut')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SCOLARITE)
  updateStatus(
    @Param('id') id: string,
    @Req() request: { user: { id: string } },
    @Body() dto: UpdateCandidatureStatusDto,
  ) {
    return this.service.updateStatus(id, request.user.id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SCOLARITE)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
