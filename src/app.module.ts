import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PublicTenantModule } from './common/tenant/public-tenant.module';
import { TenantScopeModule } from './common/tenant/tenant-scope.module';
import { PublicThrottleModule } from './common/throttle/public-throttle.module';
import { AnneesAcademiquesModule } from './modules/annees-academiques/annees-academiques.module';
import { AuthModule } from './modules/auth/auth.module';
import { CampusModule } from './modules/campus/campus.module';
import { CandidaturesModule } from './modules/candidatures/candidatures.module';
import { EcolesModule } from './modules/ecoles/ecoles.module';
import { EnseignantsModule } from './modules/enseignants/enseignants.module';
import { EtudiantsModule } from './modules/etudiants/etudiants.module';
import { FilieresModule } from './modules/filieres/filieres.module';
import { InscriptionsModule } from './modules/inscriptions/inscriptions.module';
import { MatieresModule } from './modules/matieres/matieres.module';
import { NiveauxModule } from './modules/niveaux/niveaux.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TenantsModule } from './modules/tenants/tenants.module';

@Module({
  imports: [
    PrismaModule,
    PublicTenantModule,
    TenantScopeModule,
    PublicThrottleModule,
    AuthModule,
    TenantsModule,
    CampusModule,
    EcolesModule,
    FilieresModule,
    NiveauxModule,
    AnneesAcademiquesModule,
    MatieresModule,
    EnseignantsModule,
    EtudiantsModule,
    CandidaturesModule,
    InscriptionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
