import { Controller, Get } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Endpoint public — GET /api/v1/site-content
 * Retourne tous les contenus du site sous la forme { key: value }.
 * Utilisé par les pages frontend pour charger les textes dynamiquement
 * sans nécessiter d'authentification.
 */
@Controller({ path: 'site-content', version: '1' })
export class ContentController {
  constructor(private readonly service: AdminService) {}

  @Public()
  @Get()
  getAll() {
    return this.service.getSiteContentMap();
  }
}
