import { Module } from '@nestjs/common';
import { EtudiantsController } from './etudiants.controller';
import { EtudiantsService } from './etudiants.service';

@Module({ controllers: [EtudiantsController], providers: [EtudiantsService] })
export class EtudiantsModule {}
