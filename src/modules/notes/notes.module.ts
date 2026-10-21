import { Module } from '@nestjs/common';
import { NotesEtudiantController } from './notes-etudiant.controller';
import { NotesEtudiantService } from './notes-etudiant.service';
import {
  EvaluationsPersonnelController,
  NotesPersonnelController,
  ReleveController,
} from './notes-personnel.controller';
import { NotesPersonnelService } from './notes-personnel.service';
import { ReleveService } from './releve.service';

@Module({
  controllers: [
    EvaluationsPersonnelController,
    NotesPersonnelController,
    ReleveController,
    NotesEtudiantController,
  ],
  providers: [NotesPersonnelService, ReleveService, NotesEtudiantService],
})
export class NotesModule {}
