import { ExecutionContext } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { Role } from '@prisma/client';

/**
 * Limite de débit des routes publiques d'écriture (dépôt de candidature,
 * upload candidat). Défaut : 5 requêtes / 10 min par IP, réglable par
 * THROTTLE_PUBLIC_LIMIT et THROTTLE_PUBLIC_TTL_MS (lus au démarrage).
 * Ne s'applique qu'aux routes portant @UseGuards(ThrottlerGuard).
 */
export const PublicThrottleModule = ThrottlerModule.forRootAsync({
  useFactory: () => ({
    throttlers: [
      {
        name: 'public',
        limit: Number(process.env.THROTTLE_PUBLIC_LIMIT ?? 5),
        ttl: Number(process.env.THROTTLE_PUBLIC_TTL_MS ?? 10 * 60 * 1000),
      },
    ],
    errorMessage: 'Trop de demandes depuis cette adresse : réessayez plus tard',
    // Personnel authentifié (JWT déjà validé en amont) : pas de limite
    skipIf: (context: ExecutionContext) => {
      const role = context.switchToHttp().getRequest().user?.role;
      return role === Role.ADMIN || role === Role.SCOLARITE;
    },
  }),
});
