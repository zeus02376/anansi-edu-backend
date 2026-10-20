import { ExecutionContext } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { Role } from '@prisma/client';

/** Noms des limites, pour @SkipThrottle({ [nom]: true }). */
export const THROTTLE_PUBLIC = 'public';
export const THROTTLE_SUIVI = 'suivi';

/**
 * Limites de débit des routes publiques, par IP (valeurs lues au démarrage) :
 * - « public » : écritures (dépôt de candidature, upload candidat),
 *   5 req / 10 min — THROTTLE_PUBLIC_LIMIT, THROTTLE_PUBLIC_TTL_MS ;
 * - « suivi » : consultation par numéro de dossier, plus large mais bornée
 *   contre l'énumération par force brute, 30 req / min —
 *   THROTTLE_SUIVI_LIMIT, THROTTLE_SUIVI_TTL_MS.
 * Le garde applique toutes les limites : chaque route ignore celle qui ne la
 * concerne pas via @SkipThrottle. Seules les routes avec ThrottlerGuard sont limitées.
 */
export const PublicThrottleModule = ThrottlerModule.forRootAsync({
  useFactory: () => ({
    throttlers: [
      {
        name: THROTTLE_PUBLIC,
        limit: Number(process.env.THROTTLE_PUBLIC_LIMIT ?? 5),
        ttl: Number(process.env.THROTTLE_PUBLIC_TTL_MS ?? 10 * 60 * 1000),
      },
      {
        name: THROTTLE_SUIVI,
        limit: Number(process.env.THROTTLE_SUIVI_LIMIT ?? 30),
        ttl: Number(process.env.THROTTLE_SUIVI_TTL_MS ?? 60 * 1000),
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
