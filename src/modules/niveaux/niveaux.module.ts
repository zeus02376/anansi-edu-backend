import { Module } from '@nestjs/common';
import { NiveauxController } from './niveaux.controller';
import { NiveauxService } from './niveaux.service';

@Module({ controllers: [NiveauxController], providers: [NiveauxService] })
export class NiveauxModule {}
