import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { JwtPayload } from '@facturacion-ec/shared';

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    branchId: string | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) throw new UnauthorizedException('Credenciales inválidas');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');
    return user;
  }

  buildPayload(user: any): JwtPayload {
    return { sub: user.id, email: user.email, role: user.role, branchId: user.branchId };
  }

  signAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }

  signRefreshToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
  }

  async login(user: any): Promise<{ accessToken: string; refreshToken: string; user: LoginResponse['user'] }> {
    const payload = this.buildPayload(user);
    return {
      accessToken: this.signAccessToken(payload),
      refreshToken: this.signRefreshToken(payload),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId ?? null },
    };
  }

  async refreshFromToken(token: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.usersService.findById(payload.sub);
      const newPayload = this.buildPayload(user);
      return {
        accessToken: this.signAccessToken(newPayload),
        refreshToken: this.signRefreshToken(newPayload),
        user: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId ?? null },
      };
    } catch {
      throw new UnauthorizedException('Sesión expirada, vuelve a iniciar sesión');
    }
  }
}
