import { Module } from '@nestjs/common';
import { EnseignantEvaluationsController } from './enseignant-evaluations.controller';
import { EnseignantEvaluationsService } from './enseignant-evaluations.service';
import { EnseignantMoiController } from './enseignant-moi.controller';
import { EnseignantMoiService } from './enseignant-moi.service';
import { EnseignantsController } from './enseignants.controller';
import { EnseignantsService } from './enseignants.service';

@Module({
  // Les contrôleurs « me » d'abord : sinon `enseignants/:id` capterait « me »
  controllers: [
    EnseignantMoiController,
    EnseignantEvaluationsController,
    EnseignantsController,
  ],
  providers: [
    EnseignantsService,
    EnseignantMoiService,
    EnseignantEvaluationsService,
  ],
})
export class EnseignantsModule {}
