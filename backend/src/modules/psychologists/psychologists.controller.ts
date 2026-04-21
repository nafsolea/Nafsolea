import {
  Controller,
  Get,
  Post,
  Put,
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
  ) {
    return this.service.getAvailableSlots(id, from || new Date().toISOString().split('T')[0], days);
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
    timezone?: string;
    yearsExperience?: number;
  }) {
    return this.service.updateProfile(user.sub, body);
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
}
