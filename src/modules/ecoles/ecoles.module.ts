import { Module } from '@nestjs/common';
import { EcolesController } from './ecoles.controller';
import { EcolesService } from './ecoles.service';

@Module({ controllers: [EcolesController], providers: [EcolesService] })
export class EcolesModule {}
