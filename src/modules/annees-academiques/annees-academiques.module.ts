import { Module } from '@nestjs/common';
import { AnneesAcademiquesController } from './annees-academiques.controller';
import { AnneesAcademiquesService } from './annees-academiques.service';

@Module({
  controllers: [AnneesAcademiquesController],
  providers: [AnneesAcademiquesService],
})
export class AnneesAcademiquesModule {}
