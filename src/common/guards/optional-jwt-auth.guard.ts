import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT facultatif : sans en-tête Authorization la requête passe en anonyme
 * (request.user indéfini) ; avec un en-tête, le jeton doit être valide (401 sinon).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (!request.headers.authorization) return true;
    return super.canActivate(context);
  }
}
