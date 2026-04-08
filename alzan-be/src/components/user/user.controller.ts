import { Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { SupabaseUserAuth } from '../../core/guards/auth.decorator';
import { FollowResponseDto } from './dto/user.output-dto';
import { VoidResponse } from '../../core/interceptors/response-serializer.interceptor';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UserService } from './user.service';
import { UserContext, UserCtx } from '../../common/decorators/user-context.decorator';

@Controller('users')
@SupabaseUserAuth()
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly service: UserService) {}

  /**
   * Follow a user
   * @param ctx - Request context
   * @param userId - Username of the user to follow
   */
  @Post(':userId/follow')
  async followUser(@UserContext() ctx: UserCtx, @Param('userId') userId: string): Promise<void> {
    this.logger.debug(`Controller layer: trying to follow user ${userId}`, ctx.user.id);
    return this.service.follow(ctx, userId);
  }

  /**
   * Accept a follow request
   * @param ctx - Request context
   * @param userId - Username of the user to accept
   */
  @Post(':userId/accept')
  async acceptFollowRequest(@UserContext() ctx: UserCtx, @Param('userId') userId: string): Promise<void> {
    this.logger.debug(`Controller layer: trying to accept follow request from user ${userId}`, ctx.user.id);
    return this.service.acceptFollowRequest(ctx, userId);
  }

  /**
   * Reject a follow request
   * @param ctx - Request context
   * @param userId - Username of the user to reject
   */
  @Post(':userId/reject')
  async rejectFollowRequest(@UserContext() ctx: UserCtx, @Param('userId') userId: string): Promise<void> {
    this.logger.debug(`Controller layer: trying to reject follow request from user ${userId}`, ctx.user.id);
    return this.service.rejectFollowRequest(ctx, userId);
  }

  /**
   * Unfollow a user
   * @param ctx - Request context
   * @param userId - Username of the user to unfollow
   */
  @Post(':userId/unfollow')
  async unfollowUser(@UserContext() ctx: UserCtx, @Param('userId') userId: string): Promise<VoidResponse> {
    this.logger.debug(`Controller layer: trying to unfollow user ${userId}`, ctx.user.id);
    await this.service.unfollow(ctx, userId);

    return VoidResponse;
  }

  /**
   * Get followers of the user provided
   * @param ctx - Request context
   * @param userId - User whose followers to retrieve
   * @param pagination
   */
  @Get(':userId/followers')
  async getFollowers(
    @UserContext() ctx: UserCtx,
    @Param('userId') userId: string,
    @Query() pagination: PaginationDto,
  ): Promise<FollowResponseDto[]> {
    this.logger.debug(`Controller layer: trying to get followers for ${userId}`);
    return this.service.getFollowers(ctx, userId, pagination);
  }

  /**
   * Get following of the user provided
   * @param ctx - Request context
   * @param userId - User whose following list to retrieve
   * @param pagination
   */
  @Get(':userId/following')
  async getFollowing(
    @UserContext() ctx: UserCtx,
    @Param('userId') userId: string,
    @Query() pagination: PaginationDto,
  ): Promise<FollowResponseDto[]> {
    this.logger.debug(`Controller layer: trying to get following for ${userId}`);
    return this.service.getFollowing(ctx, userId, pagination);
  }

  @Get('search')
  async searchUsers(
    @UserContext() ctx: UserCtx,
    @Query('q') query: string,
    @Query() pagination: PaginationDto,
  ): Promise<FollowResponseDto[]> {
    this.logger.debug(`Controller layer: trying to search users for ${query}`);
    return this.service.searchUsers(ctx, query, pagination);
  }
}
