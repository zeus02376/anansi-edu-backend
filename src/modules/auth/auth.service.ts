import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new UnauthorizedException('Établissement introuvable');
    }

    const passwordHash = await bcrypt.hash(dto.motDePasse, 12);
    try {
      const user = await this.prisma.user.create({
        data: {
          tenantId: dto.tenantId,
          nom: dto.nom,
          prenom: dto.prenom,
          email: dto.email,
          telephone: dto.telephone,
          motDePasseHash: passwordHash,
          role: Role.ETUDIANT,
        },
        select: {
          id: true,
          tenantId: true,
          nom: true,
          prenom: true,
          email: true,
          role: true,
          statut: true,
          createdAt: true,
        },
      });
      return user;
    } catch (error) {
      if (error?.code === 'P2002') {
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
      },
    };
  }
}
