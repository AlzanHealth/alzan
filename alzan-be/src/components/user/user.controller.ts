import { Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';
import { SupabaseUserAuth } from '../../core/guards/auth.decorator';
import { FollowResponseDto, UserOutputDto } from './dto/user.output-dto';
import { VoidResponse } from '../../core/interceptors/response-serializer.interceptor';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UserService } from './user.service';

@Controller('users')
@SupabaseUserAuth()
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly service: UserService) {}

  /**
   * Get current authenticated user
   */
  @Get()
  getCurrentUser(@CurrentUser() user: User): UserOutputDto {
    return user;
  }

  /**
   * Follow a user
   * @param user
   * @param userId
   */
  @Post(':userId/follow')
  async followUser(@CurrentUser() user: User, @Param('userId') userId: string): Promise<void> {
    this.logger.debug(`Controller layer: trying to follow user ${userId}`, user.id);
    return this.service.follow(user, userId);
  }

  /**
   * Unfollow a user
   * @param user
   * @param userId
   */
  @Post(':userId/unfollow')
  async unfollowUser(@CurrentUser() user: User, @Param('userId') userId: string): Promise<VoidResponse> {
    this.logger.debug(`Controller layer: trying to unfollow user ${userId}`, user.id);
    await this.service.unfollow(user, userId);

    return VoidResponse;
  }

  /**
   * Get followers of the user provided
   * @param userId
   * @param pagination
   */
  @Get(':userId/followers')
  async getFollowers(
    @Param('userId') userId: string,
    @Query() pagination: PaginationDto,
  ): Promise<FollowResponseDto[]> {
    this.logger.debug(`Controller layer: trying to get followers for ${userId}`);
    return this.service.getFollowers(userId, pagination);
  }

  /**
   * Get following of the user provided
   * @param userId
   * @param pagination
   */
  @Get(':userId/following')
  async getFollowing(
    @Param('userId') userId: string,
    @Query() pagination: PaginationDto,
  ): Promise<FollowResponseDto[]> {
    this.logger.debug(`Controller layer: trying to get following for ${userId}`);
    return this.service.getFollowing(userId, pagination);
  }
}
