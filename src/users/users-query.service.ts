import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryUsersDto } from './dto/query-users.dto';
import {
  USER_SUMMARY_SELECT,
  USER_DETAIL_SELECT,
} from './constants/users.select';

@Injectable()
export class UsersQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryUsersDto) {
    const page = query.user_page || query.page || 1;
    const limit = query.user_limit || query.limit || 10;
    const skip = (page - 1) * limit;
    const take = limit;

    const where: Record<string, any> = {};

    const status = query.status?.toLowerCase().trim();

    if (status === 'deleted') {
      where.deletedAt = { not: null };
    } else if (status === 'all') {
      where.deletedAt = undefined;
    } else {
      where.deletedAt = null;
    }

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: USER_SUMMARY_SELECT,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      users,
      total,
      totalPages,
      page,
      limit,
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id },
      select: USER_DETAIL_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID "${id}" no encontrado`);
    }

    return user;
  }
}
