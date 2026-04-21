import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ArticleStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function estimateReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.ceil(words / 200); // 200 wpm average
}

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public: list published articles ─────────────────────────────

  async findPublished(opts: {
    category?: string;
    tag?: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { category, tag, page = 1, limit = 9, search } = opts;
    const skip = (page - 1) * limit;

    const where = {
      status: ArticleStatus.PUBLISHED,
      ...(category && { category }),
      ...(tag && { tags: { has: tag } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { excerpt: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [articles, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          imageUrl: true,
          category: true,
          tags: true,
          readingTime: true,
          publishedAt: true,
          author: { select: { patient: { select: { firstName: true, lastName: true } } } },
        },
        skip,
        take: limit,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.article.count({ where }),
    ]);

    return {
      data: articles,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async findBySlug(slug: string) {
    const article = await this.prisma.article.findUnique({
      where: { slug },
      include: {
        author: { select: { patient: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!article || article.status !== ArticleStatus.PUBLISHED) {
      throw new NotFoundException('Article introuvable');
    }

    return article;
  }

  // ── Admin: full CRUD ─────────────────────────────────────────────

  async findAll(page = 1, limit = 20, status?: ArticleStatus) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [articles, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        include: {
          author: { select: { email: true, patient: { select: { firstName: true, lastName: true } } } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.article.count({ where }),
    ]);

    return { data: articles, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async create(authorId: string, dto: {
    title: string;
    content: string;
    excerpt?: string;
    imageUrl?: string;
    category?: string;
    tags?: string[];
    status?: ArticleStatus;
  }) {
    let slug = slugify(dto.title);

    // Ensure unique slug
    const existing = await this.prisma.article.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now()}`;

    return this.prisma.article.create({
      data: {
        title: dto.title,
        slug,
        content: dto.content,
        excerpt: dto.excerpt,
        imageUrl: dto.imageUrl,
        category: dto.category,
        tags: dto.tags ?? [],
        status: dto.status ?? ArticleStatus.DRAFT,
        authorId,
        readingTime: estimateReadingTime(dto.content),
        publishedAt: dto.status === ArticleStatus.PUBLISHED ? new Date() : null,
      },
    });
  }

  async update(id: string, userId: string, userRole: UserRole, dto: {
    title?: string;
    content?: string;
    excerpt?: string;
    imageUrl?: string;
    category?: string;
    tags?: string[];
    status?: ArticleStatus;
  }) {
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Article introuvable');

    // Only admin or the author can edit
    if (userRole !== UserRole.ADMIN && article.authorId !== userId) {
      throw new ForbiddenException();
    }

    const wasPublished = article.status === ArticleStatus.PUBLISHED;
    const isPublishing = dto.status === ArticleStatus.PUBLISHED && !wasPublished;

    return this.prisma.article.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.content && { readingTime: estimateReadingTime(dto.content) }),
        ...(isPublishing && { publishedAt: new Date() }),
        ...(dto.status === ArticleStatus.DRAFT && { publishedAt: null }),
      },
    });
  }

  async delete(id: string, userId: string, userRole: UserRole) {
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Article introuvable');

    if (userRole !== UserRole.ADMIN && article.authorId !== userId) {
      throw new ForbiddenException();
    }

    await this.prisma.article.delete({ where: { id } });
    return { message: 'Article supprimé' };
  }

  async getStats() {
    const [total, published, draft] = await this.prisma.$transaction([
      this.prisma.article.count(),
      this.prisma.article.count({ where: { status: ArticleStatus.PUBLISHED } }),
      this.prisma.article.count({ where: { status: ArticleStatus.DRAFT } }),
    ]);
    return { total, published, draft };
  }

  async getCategories() {
    const articles = await this.prisma.article.findMany({
      where: { status: ArticleStatus.PUBLISHED, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    return articles.map((a) => a.category).filter(Boolean);
  }
}
