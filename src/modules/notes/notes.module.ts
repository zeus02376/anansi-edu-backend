import { Module } from '@nestjs/common';
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
  ],
  providers: [NotesPersonnelService, ReleveService],
})
export class NotesModule {}
