import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ArticleStatus, UserRole } from '@prisma/client';
import { ArticlesService } from './articles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller({ path: 'articles', version: '1' })
export class ArticlesController {
  constructor(private readonly service: ArticlesService) {}

  // ── Public endpoints ─────────────────────────────────────────────

  /** GET /api/v1/articles — published articles for blog page */
  @Public()
  @Get()
  findPublished(
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(9), ParseIntPipe) limit?: number,
  ) {
    return this.service.findPublished({ category, tag, search, page, limit });
  }

  /** GET /api/v1/articles/categories */
  @Public()
  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  /** GET /api/v1/articles/:slug — single article by slug */
  @Public()
  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  // ── Admin endpoints ──────────────────────────────────────────────

  /** GET /api/v1/articles/admin/all — all articles with status */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: ArticleStatus,
  ) {
    return this.service.findAll(page, limit, status);
  }

  /** GET /api/v1/articles/admin/stats */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/stats')
  getStats() {
    return this.service.getStats();
  }

  /** POST /api/v1/articles */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: {
    title: string;
    content: string;
    excerpt?: string;
    imageUrl?: string;
    category?: string;
    tags?: string[];
    status?: ArticleStatus;
  }) {
    return this.service.create(user.sub, body);
  }

  /** PUT /api/v1/articles/:id */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      title?: string;
      content?: string;
      excerpt?: string;
      imageUrl?: string;
      category?: string;
      tags?: string[];
      status?: ArticleStatus;
    },
  ) {
    return this.service.update(id, user.sub, user.role as UserRole, body);
  }

  /** DELETE /api/v1/articles/:id */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.delete(id, user.sub, user.role as UserRole);
  }
}
