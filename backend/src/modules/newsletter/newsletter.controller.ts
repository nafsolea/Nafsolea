import {
  Controller, Get, Post, Delete, Body, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { NewsletterService } from './newsletter.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller({ path: 'newsletter', version: '1' })
export class NewsletterController {
  constructor(private readonly service: NewsletterService) {}

  // ── Public ────────────────────────────────────────────────────────

  /** POST /api/v1/newsletter/subscribe */
  @Public()
  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  subscribe(@Body() body: { email: string; source?: string }) {
    return this.service.subscribe(body.email, body.source);
  }

  /** GET /api/v1/newsletter/unsubscribe?token=xxx */
  @Public()
  @Get('unsubscribe')
  unsubscribe(@Query('token') token: string) {
    return this.service.unsubscribe(token);
  }

  // ── Admin ─────────────────────────────────────────────────────────

  /** GET /api/v1/newsletter/admin/stats */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/stats')
  getStats() {
    return this.service.getStats();
  }

  /** GET /api/v1/newsletter/admin/subscribers */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/subscribers')
  listSubscribers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.service.listSubscribers({ page, limit, activeOnly: activeOnly === 'true' });
  }

  /** DELETE /api/v1/newsletter/admin/subscribers/:id */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/subscribers/:id')
  @HttpCode(HttpStatus.OK)
  deleteSubscriber(@Param('id') id: string) {
    return this.service.deleteSubscriber(id);
  }

  /** GET /api/v1/newsletter/admin/campaigns */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/campaigns')
  listCampaigns(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.listCampaigns({ page, limit });
  }

  /** POST /api/v1/newsletter/admin/campaigns */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/campaigns')
  createDraft(
    @CurrentUser() user: JwtPayload,
    @Body() body: { subject: string; contentHtml: string },
  ) {
    return this.service.createDraft(user.sub, body);
  }

  /** POST /api/v1/newsletter/admin/campaigns/:id/send */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/campaigns/:id/send')
  sendCampaign(@Param('id') id: string) {
    return this.service.sendCampaign(id);
  }

  /** DELETE /api/v1/newsletter/admin/campaigns/:id */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/campaigns/:id')
  @HttpCode(HttpStatus.OK)
  deleteCampaign(@Param('id') id: string) {
    return this.service.deleteCampaign(id);
  }
}
