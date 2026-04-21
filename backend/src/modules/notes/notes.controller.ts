import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PSYCHOLOGIST)
@Controller({ path: 'appointments/:appointmentId/notes', version: '1' })
export class NotesController {
  constructor(private readonly service: NotesService) {}

  /**
   * GET /api/v1/appointments/:appointmentId/notes
   * Psychologist only — decrypt and return clinical note
   */
  @Get()
  getNote(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getNote(user.sub, appointmentId);
  }

  /**
   * PUT /api/v1/appointments/:appointmentId/notes
   * Psychologist only — create or update clinical note (encrypted)
   */
  @Put()
  upsertNote(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser() user: JwtPayload,
    @Body('content') content: string,
  ) {
    return this.service.upsertNote(user.sub, appointmentId, content);
  }
}
