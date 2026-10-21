import { Module } from '@nestjs/common';
import {
  EnseignantPlanningController,
  EtudiantPlanningController,
} from './planning-moi.controller';
import { PlanningMoiService } from './planning-moi.service';
import { SallesController } from './salles.controller';
import { SallesService } from './salles.service';
import { PlanningController, SeancesController } from './seances.controller';
import { SeancesService } from './seances.service';

@Module({
  controllers: [
    SallesController,
    SeancesController,
    PlanningController,
    EnseignantPlanningController,
    EtudiantPlanningController,
  ],
  providers: [SallesService, SeancesService, PlanningMoiService],
})
export class PlanningModule {}
