import { Module } from '@nestjs/common';
import { CandidatureDocumentsController } from './candidature-documents.controller';
import { CandidatureDocumentsService } from './candidature-documents.service';
import { CandidatureEmailSender } from './candidature-email.sender';
import { CandidaturesController } from './candidatures.controller';
import { CandidaturesService } from './candidatures.service';

@Module({
  controllers: [CandidaturesController, CandidatureDocumentsController],
  providers: [
    CandidaturesService,
    CandidatureDocumentsService,
    CandidatureEmailSender,
  ],
})
export class CandidaturesModule {}
