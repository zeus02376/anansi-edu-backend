import { Module } from '@nestjs/common';
import { EtudiantMoiController } from './etudiant-moi.controller';
import { EtudiantMoiService } from './etudiant-moi.service';
import { EtudiantsController } from './etudiants.controller';
import { EtudiantsService } from './etudiants.service';

@Module({
  // EtudiantMoiController d'abord : sinon `etudiants/:id` capterait « me »
  controllers: [EtudiantMoiController, EtudiantsController],
  providers: [EtudiantsService, EtudiantMoiService],
})
export class EtudiantsModule {}
