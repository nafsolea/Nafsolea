import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PsychologistsService } from './psychologists.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller({ path: 'psychologists', version: '1' })
export class PsychologistsController {
  constructor(private readonly service: PsychologistsService) {}

  /**
   * GET /api/v1/psychologists
   * Public — browse approved psychologists
   */
  @Public()
  @Get()
  findAll(
    @Query('language') language?: string,
    @Query('specialty') specialty?: string,
    @Query('maxRate') maxRate?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit?: number,
  ) {
    return this.service.findAll({ language, specialty, maxRate, page, limit });
  }

  // ⚠️ IMPORTANT — ordre des routes :
  // Toutes les routes "me/..." DOIVENT être déclarées AVANT les routes
  // ":id/..." ayant le même nombre de segments, sinon NestJS matche
  // le segment "me" comme un :id (collision path-to-regexp).

  /**
   * GET /api/v1/psychologists/me/dashboard
   * Psychologist only — kpi stats + upcoming appointments + status
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Get('me/dashboard')
  getDashboard(@CurrentUser() user: JwtPayload) {
    return this.service.getMyDashboard(user.sub);
  }

  /**
   * GET /api/v1/psychologists/me/appointments?status=upcoming|past|all
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Get('me/appointments')
  getMyAppointments(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.service.getMyAppointments(user.sub, status);
  }

  /**
   * GET /api/v1/psychologists/me/patients
   * List of patients seen by this psy with last/next session info
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Get('me/patients')
  getMyPatients(@CurrentUser() user: JwtPayload) {
    return this.service.getMyPatients(user.sub);
  }

  /**
   * PUT /api/v1/psychologists/me/profile
   * Psychologist only — update own profile
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Put('me/profile')
  updateProfile(@CurrentUser() user: JwtPayload, @Body() body: {
    bio?: string;
    specialties?: string[];
    languages?: string[];
    sessionRate?: number;
    sessionDuration?: number;  // minutes — modifiable par le psy
    timezone?: string;
    yearsExperience?: number;
    title?: string;
  }) {
    return this.service.updateProfile(user.sub, body);
  }

  /**
   * GET /api/v1/psychologists/me/availability
   * Psychologist only — récupère les dispos hebdo configurées
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Get('me/availability')
  getMyAvailability(@CurrentUser() user: JwtPayload) {
    return this.service.getMyAvailability(user.sub);
  }

  /**
   * POST /api/v1/psychologists/me/availability
   * Psychologist only — set weekly recurring availability
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Post('me/availability')
  setAvailability(
    @CurrentUser() user: JwtPayload,
    @Body('slots') slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  ) {
    return this.service.setAvailability(user.sub, slots);
  }

  /**
   * POST /api/v1/psychologists/me/blocked-slots
   * Psychologist only — block vacation / sick days
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Post('me/blocked-slots')
  addBlockedSlot(
    @CurrentUser() user: JwtPayload,
    @Body() body: { startsAt: string; endsAt: string; reason?: string },
  ) {
    return this.service.addBlockedSlot(
      user.sub,
      new Date(body.startsAt),
      new Date(body.endsAt),
      body.reason,
    );
  }

  // ── Services / Prestations (CRUD psy) ──────────────────────────

  /**
   * GET /api/v1/psychologists/me/services
   * Psychologist only — liste toutes ses prestations (actives + archivées)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Get('me/services')
  getMyServices(@CurrentUser() user: JwtPayload) {
    return this.service.getMyServices(user.sub);
  }

  /**
   * POST /api/v1/psychologists/me/services
   * Psychologist only — crée une nouvelle prestation
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Post('me/services')
  createMyService(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      name: string;
      description?: string;
      price: number;
      durationMinutes: number;
      displayOrder?: number;
    },
  ) {
    return this.service.createMyService(user.sub, body);
  }

  /**
   * PUT /api/v1/psychologists/me/services/:serviceId
   * Psychologist only — modifie une de ses prestations
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Put('me/services/:serviceId')
  updateMyService(
    @CurrentUser() user: JwtPayload,
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
    return this.service.updateMyService(user.sub, serviceId, body);
  }

  /**
   * DELETE /api/v1/psychologists/me/services/:serviceId
   * Psychologist only — supprime (ou désactive si RDV existants) une prestation
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Delete('me/services/:serviceId')
  deleteMyService(
    @CurrentUser() user: JwtPayload,
    @Param('serviceId') serviceId: string,
  ) {
    return this.service.deleteMyService(user.sub, serviceId);
  }

  // ── Routes publiques par :id (DOIVENT rester EN DERNIER) ─────────
  // Voir commentaire en haut du fichier sur l'ordre des routes.

  /**
   * GET /api/v1/psychologists/:id
   * Public — psychologist profile + reviews
   */
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /**
   * GET /api/v1/psychologists/:id/slots
   * Public — available booking slots
   */
  @Public()
  @Get(':id/slots')
  getSlots(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('days', new DefaultValuePipe(14), ParseIntPipe) days: number,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.service.getAvailableSlots(
      id,
      from || new Date().toISOString().split('T')[0],
      days,
      serviceId,
    );
  }

  /**
   * GET /api/v1/psychologists/:id/services
   * Public — list active services of a psy
   */
  @Public()
  @Get(':id/services')
  getServices(@Param('id') id: string) {
    return this.service.getServicesForPsy(id);
  }
}
