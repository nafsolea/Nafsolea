import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller({ path: 'appointments', version: '1' })
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  /**
   * POST /api/v1/appointments
   * Patient only — reserve a slot + create PaymentIntent
   *
   * Returns: { appointmentId, scheduledAt, expiresAt, payment.clientSecret }
   * Frontend uses clientSecret with Stripe.js to confirm payment
   */
  @Roles(UserRole.PATIENT)
  @Post()
  book(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      psychologistId: string;
      scheduledAt: string;
      serviceId?: string;
      notes?: string;
    },
  ) {
    return this.service.book(
      user.sub,
      body.psychologistId,
      new Date(body.scheduledAt),
      body.serviceId,
      body.notes,
    );
  }

  /**
   * DELETE /api/v1/appointments/:id
   * Patient or Psychologist — cancel with refund logic
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body('reason') reason?: string,
  ) {
    return this.service.cancel(id, user.sub, user.role as UserRole, reason);
  }

  /**
   * GET /api/v1/appointments/:id/video
   * Get Daily.co room URL + participant token (join ≤15min before session)
   */
  @Get(':id/video')
  getVideoAccess(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.getVideoAccess(id, user.sub);
  }

  /**
   * POST /api/v1/appointments/:id/review
   * Patient only — submit review after completed session
   */
  @Roles(UserRole.PATIENT)
  @Post(':id/review')
  submitReview(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { rating: number; comment?: string; isPublic?: boolean },
  ) {
    return this.service.submitReview(id, user.sub, body.rating, body.comment, body.isPublic);
  }
}
