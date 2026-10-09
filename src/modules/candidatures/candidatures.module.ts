import { Module } from '@nestjs/common';
import { CandidaturesController } from './candidatures.controller';
import { CandidaturesService } from './candidatures.service';

@Module({
  controllers: [CandidaturesController],
  providers: [CandidaturesService],
})
export class CandidaturesModule {}
