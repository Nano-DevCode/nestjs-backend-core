import {
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';
import { AppPermission } from '../auth/constants/permissions.constant';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(AppPermission.USERS_READ)
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(AppPermission.USERS_READ)
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @RequirePermissions(AppPermission.USERS_CREATE)
  create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() currentUser: UserAuthContext,
  ) {
    return this.usersService.create(createUserDto, currentUser);
  }

  @Patch(':id')
  @RequirePermissions(AppPermission.USERS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: UserAuthContext,
  ) {
    return this.usersService.update(id, updateUserDto, currentUser);
  }

  @Delete(':id')
  @RequirePermissions(AppPermission.USERS_DELETE)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: UserAuthContext,
  ) {
    return this.usersService.softDelete(id, currentUser);
  }

  @Patch(':id/restore')
  @RequirePermissions(AppPermission.USERS_DELETE)
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: UserAuthContext,
  ) {
    return this.usersService.restore(id, currentUser);
  }
}
