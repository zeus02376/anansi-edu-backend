import { Module } from '@nestjs/common';
import { CandidatureDocumentsController } from './candidature-documents.controller';
import { CandidatureDocumentsService } from './candidature-documents.service';
import { CandidaturesController } from './candidatures.controller';
import { CandidaturesService } from './candidatures.service';

@Module({
  controllers: [CandidaturesController, CandidatureDocumentsController],
  providers: [CandidaturesService, CandidatureDocumentsService],
})
export class CandidaturesModule {}
