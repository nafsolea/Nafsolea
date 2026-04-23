import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Compte désactivé ou introuvable');
    }

    // ⚠️ IMPORTANT : on doit retourner `sub` pour matcher l'interface JwtPayload
    // utilisée partout via @CurrentUser(). Sans ça, `user.sub` est undefined
    // dans les services → erreurs Prisma "Argument X is missing" sur tous
    // les create()/findUnique() qui utilisent user.sub.
    return {
      sub: user.id,
      id: user.id,           // alias pour les rares services qui utilisent user.id
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    }; // Attached as req.user
  }
}
