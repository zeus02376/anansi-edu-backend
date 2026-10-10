import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { LoginDto } from './dto/login.dto';

const publicUserSelect = {
  id: true,
  tenantId: true,
  nom: true,
  prenom: true,
  email: true,
  role: true,
  statut: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async createStaff(tenantId: string, dto: CreateStaffDto) {
    const passwordHash = await bcrypt.hash(dto.motDePasse, 12);
    try {
      return await this.prisma.user.create({
        data: {
          tenantId,
          nom: dto.nom,
          prenom: dto.prenom,
          email: dto.email,
          telephone: dto.telephone,
          motDePasseHash: passwordHash,
          role: dto.role,
        },
        select: publicUserSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Cette adresse e-mail est déjà utilisée');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (
      !user ||
      user.statut !== 'ACTIF' ||
      !(await bcrypt.compare(dto.motDePasse, user.motDePasseHash))
    ) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    return {
      access_token: accessToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        doitChangerMotDePasse: user.doitChangerMotDePasse,
      },
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Compte introuvable');
    }
    // 400 et non 401 : l'utilisateur est authentifié, seul le champ est faux
    // (un 401 déconnecterait le front via l'intercepteur axios)
    if (!(await bcrypt.compare(dto.motDePasseActuel, user.motDePasseHash))) {
      throw new BadRequestException('Mot de passe actuel incorrect');
    }
    if (dto.nouveauMotDePasse === dto.motDePasseActuel) {
      throw new BadRequestException(
        'Le nouveau mot de passe doit être différent de l’actuel',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        motDePasseHash: await bcrypt.hash(dto.nouveauMotDePasse, 12),
        doitChangerMotDePasse: false,
      },
    });
    return { message: 'Mot de passe modifié' };
  }
}
