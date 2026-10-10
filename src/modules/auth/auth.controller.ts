import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Se connecter et obtenir un JWT' })
  @ApiCreatedResponse({ description: 'JWT et informations utilisateur' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Identifiants invalides' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('create-staff')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Créer un compte SCOLARITE ou ENSEIGNANT (ADMIN uniquement)',
  })
  @ApiCreatedResponse({ description: 'Compte créé dans le tenant de l’ADMIN' })
  @ApiBadRequestResponse({ description: 'Données ou rôle invalides' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Rôle ADMIN requis' })
  @ApiConflictResponse({ description: 'Adresse e-mail déjà utilisée' })
  createStaff(
    @Req() request: { user: { tenantId: string } },
    @Body() dto: CreateStaffDto,
  ) {
    return this.authService.createStaff(request.user.tenantId, dto);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Changer son propre mot de passe' })
  @ApiOkResponse({ description: 'Mot de passe modifié' })
  @ApiBadRequestResponse({
    description:
      'Mot de passe actuel incorrect, ou nouveau mot de passe invalide/identique',
  })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  changePassword(
    @Req() request: { user: { id: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(request.user.id, dto);
  }
}
