import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseArrayPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly service: UsersService) {}

  /**
   * GET /api/v1/users/me
   * Full profile (patient or psychologist sub-profile)
   */
  @Get('me')
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.service.getMyProfile(user.sub);
  }

  /**
   * PUT /api/v1/users/me
   */
  @Put('me')
  updateProfile(@CurrentUser() user: JwtPayload, @Body() body: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    languages?: string[];
    preferredLanguage?: string;
    timezone?: string;
    issues?: string[];
  }) {
    return this.service.updatePatientProfile(user.sub, body);
  }

  /**
   * PUT /api/v1/users/me/avatar
   * Body: { avatarUrl: string } — base64 data URI déjà compressée côté client
   */
  @Put('me/avatar')
  @HttpCode(HttpStatus.OK)
  updateAvatar(
    @CurrentUser() user: JwtPayload,
    @Body('avatarUrl') avatarUrl: string,
  ) {
    return this.service.updateAvatar(user.sub, avatarUrl);
  }

  /**
   * DELETE /api/v1/users/me/avatar
   */
  @Delete('me/avatar')
  @HttpCode(HttpStatus.OK)
  deleteAvatar(@CurrentUser() user: JwtPayload) {
    return this.service.deleteAvatar(user.sub);
  }

  /**
   * GET /api/v1/users/me/appointments
   */
  @Get('me/appointments')
  getAppointments(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.service.getPatientAppointments(user.sub, status);
  }

  /**
   * GET /api/v1/users/me/notifications
   */
  @Get('me/notifications')
  getNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('unread') unread?: string,
  ) {
    return this.service.getNotifications(user.sub, unread === 'true');
  }

  /**
   * PUT /api/v1/users/me/notifications/read
   */
  @Put('me/notifications/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: JwtPayload,
    @Body('ids', new ParseArrayPipe({ items: String })) ids: string[],
  ) {
    return this.service.markNotificationsRead(user.sub, ids);
  }

  /**
   * DELETE /api/v1/users/me — RGPD right to erasure
   */
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  deleteAccount(@CurrentUser() user: JwtPayload) {
    return this.service.requestAccountDeletion(user.sub);
  }
}
