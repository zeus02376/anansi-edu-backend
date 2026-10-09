import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { InscriptionDto } from './dto/inscription.dto';
import { InscriptionsService } from './inscriptions.service';

@Controller('inscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SCOLARITE)
export class InscriptionsController {
  constructor(private readonly service: InscriptionsService) {}
  @Post()
  create(
    @Body() dto: InscriptionDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.service.create(dto, request.user.id);
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
  update(@Param('id') id: string, @Body() dto: InscriptionDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
