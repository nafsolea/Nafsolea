import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly service: AdminService) {}

  /**
   * GET /api/v1/admin/dashboard
   */
  @Get('dashboard')
  getDashboard() {
    return this.service.getDashboardStats();
  }

  /**
   * GET /api/v1/admin/psychologists/pending
   */
  @Get('psychologists/pending')
  getPendingPsychologists() {
    return this.service.getPendingPsychologists();
  }

  /**
   * POST /api/v1/admin/psychologists/:id/approve
   */
  @Post('psychologists/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.approvePsychologist(id, user.sub);
  }

  /**
   * POST /api/v1/admin/psychologists/:id/reject
   */
  @Post('psychologists/:id/reject')
  reject(@Param('id') id: string, @Body('reason') reason: string) {
    return this.service.rejectPsychologist(id, reason);
  }

  /**
   * PUT /api/v1/admin/psychologists/:id
   * Modifier le profil d'un psy (tarif, durée séance, langues, bio…).
   * Utile pour corriger / harmoniser les profils en bêta.
   */
  @Put('psychologists/:id')
  updatePsychologist(
    @Param('id') id: string,
    @Body() body: {
      bio?: string;
      title?: string;
      specialties?: string[];
      languages?: string[];
      sessionRate?: number;
      sessionDuration?: number;
      yearsExperience?: number;
    },
  ) {
    return this.service.updatePsychologist(id, body);
  }

  // ── Services / Prestations (admin) ──────────────────────────────
  // Routes : list / create / update / delete des prestations d'un psy
  // depuis le back-office admin.

  /**
   * GET /api/v1/admin/psychologists/:id/services
   */
  @Get('psychologists/:id/services')
  listPsychologistServices(@Param('id') id: string) {
    return this.service.listPsychologistServices(id);
  }

  /**
   * POST /api/v1/admin/psychologists/:id/services
   */
  @Post('psychologists/:id/services')
  createPsychologistService(
    @Param('id') id: string,
    @Body() body: {
      name: string;
      description?: string;
      price: number;
      durationMinutes: number;
      displayOrder?: number;
    },
  ) {
    return this.service.createPsychologistService(id, body);
  }

  /**
   * PUT /api/v1/admin/psychologists/:id/services/:serviceId
   */
  @Put('psychologists/:id/services/:serviceId')
  updatePsychologistService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body() body: Partial<{
      name: string;
      description: string;
      price: number;
      durationMinutes: number;
      isActive: boolean;
      displayOrder: number;
    }>,
  ) {
    return this.service.updatePsychologistService(id, serviceId, body);
  }

  /**
   * DELETE /api/v1/admin/psychologists/:id/services/:serviceId
   */
  @Delete('psychologists/:id/services/:serviceId')
  deletePsychologistService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
  ) {
    return this.service.deletePsychologistService(id, serviceId);
  }

  /**
   * GET /api/v1/admin/users
   */
  @Get('users')
  getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    return this.service.getUsers(page, limit, search, role);
  }

  /**
   * PATCH /api/v1/admin/users/:id/suspend
   */
  @Patch('users/:id/suspend')
  suspendUser(@Param('id') id: string) {
    return this.service.suspendUser(id);
  }

  /**
   * POST /api/v1/admin/users/:id/verify-email
   * Validation manuelle de l'email — utile en bêta sans SendGrid.
   */
  @Post('users/:id/verify-email')
  verifyUserEmail(@Param('id') id: string) {
    return this.service.verifyUserEmail(id);
  }

  /**
   * GET /api/v1/admin/appointments
   */
  @Get('appointments')
  getAppointments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.service.getAppointments(page, limit, status);
  }

  /**
   * GET /api/v1/admin/revenue
   */
  @Get('revenue')
  getRevenue(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getRevenueReport(
      new Date(from || new Date(Date.now() - 30 * 86_400_000).toISOString()),
      new Date(to || new Date().toISOString()),
    );
  }

  /**
   * GET /api/v1/admin/audit-logs
   */
  @Get('audit-logs')
  getAuditLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('userId') userId?: string,
  ) {
    return this.service.getAuditLogs(page, limit, userId);
  }
}
