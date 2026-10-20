import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * JWT facultatif : sans en-tête Authorization la requête passe en anonyme
 * (request.user indéfini) ; avec un en-tête, le jeton doit être valide (401 sinon)
 * et soumis aux mêmes règles que JwtAuthGuard (mot de passe provisoire : 403).
 */
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (!request.headers.authorization) return true;
    return super.canActivate(context);
  }
}
