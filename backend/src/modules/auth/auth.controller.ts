import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/register
   * Public — create patient or psychologist account
   */
  @Public()
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip ?? '');
  }

  /**
   * POST /api/v1/auth/login
   * Public — returns access + refresh tokens
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(
      dto,
      req.ip ?? '',
      req.headers['user-agent'] ?? '',
    );
  }

  /**
   * POST /api/v1/auth/refresh
   * Public — exchange refresh token for new access token (rotation)
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body('refreshToken') refreshToken: string,
    @Req() req: Request,
  ) {
    return this.authService.refresh(
      refreshToken,
      req.ip ?? '',
      req.headers['user-agent'] ?? '',
    );
  }

  /**
   * POST /api/v1/auth/logout
   * Auth required — revoke refresh token
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body('refreshToken') refreshToken: string) {
    return this.authService.logout(refreshToken);
  }

  /**
   * GET /api/v1/auth/verify-email?token=xxx
   * Public
   */
  @Public()
  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  /**
   * POST /api/v1/auth/forgot-password
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  forgotPassword(@Body('email') email: string) {
    return this.authService.requestPasswordReset(email);
  }

  /**
   * POST /api/v1/auth/reset-password
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body('token') token: string,
    @Body('password') password: string,
  ) {
    return this.authService.resetPassword(token, password);
  }
}
