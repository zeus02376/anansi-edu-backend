import { Module } from '@nestjs/common';
import { EnseignantMoiController } from './enseignant-moi.controller';
import { EnseignantMoiService } from './enseignant-moi.service';
import { EnseignantsController } from './enseignants.controller';
import { EnseignantsService } from './enseignants.service';

@Module({
  // EnseignantMoiController d'abord : sinon `enseignants/:id` capterait « me »
  controllers: [EnseignantMoiController, EnseignantsController],
  providers: [EnseignantsService, EnseignantMoiService],
})
export class EnseignantsModule {}
