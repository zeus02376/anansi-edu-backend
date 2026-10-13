import { Global, Module } from '@nestjs/common';
import { PublicTenantService } from './public-tenant.service';

@Global()
@Module({
  providers: [PublicTenantService],
  exports: [PublicTenantService],
})
export class PublicTenantModule {}
