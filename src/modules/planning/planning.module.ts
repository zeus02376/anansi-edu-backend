import { Module } from '@nestjs/common';
import { SallesController } from './salles.controller';
import { SallesService } from './salles.service';
import { PlanningController, SeancesController } from './seances.controller';
import { SeancesService } from './seances.service';

@Module({
  controllers: [SallesController, SeancesController, PlanningController],
  providers: [SallesService, SeancesService],
})
export class PlanningModule {}
