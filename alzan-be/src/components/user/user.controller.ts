import { Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { SupabaseUserAuth } from '../../core/guards/auth.decorator';
import { UserProfileDto } from './dto/user.output-dto';
import { VoidResponse } from '../../core/interceptors/response-serializer.interceptor';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UserService } from './user.service';
import { UserContext, UserCtx } from '../../common/decorators/user-context.decorator';
import { UserSearchDto } from './dto/user.dto';

@Controller('users')
@SupabaseUserAuth()
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly service: UserService) {}

  /**
   * Search users
   * @param ctx - Request context
   * @param query - Query to search for
   * @param pagination - Pagination data
   */
  @Get('search')
  async searchUsers(@UserContext() ctx: UserCtx, @Query() pagination: UserSearchDto): Promise<UserProfileDto[]> {
    this.logger.debug(`Controller layer: trying to search users for ${pagination.q}`);
    return this.service.searchUsers(ctx, pagination.q, pagination);
  }

  /**
   * Follow a user
   * @param ctx - Request context
   * @param userId - Username of the user to follow
   */
  @Post(':userId/follow')
  async followUser(@UserContext() ctx: UserCtx, @Param('userId') userId: string): Promise<VoidResponse> {
    this.logger.debug(`Controller layer: trying to follow user ${userId}`, ctx.user.id);
    await this.service.follow(ctx, userId);
    return VoidResponse;
  }

  /**
   * Accept a follow request
   * @param ctx - Request context
   * @param userId - Username of the user to accept
   */
  @Post(':userId/accept')
  async acceptFollowRequest(@UserContext() ctx: UserCtx, @Param('userId') userId: string): Promise<VoidResponse> {
    this.logger.debug(`Controller layer: trying to accept follow request from user ${userId}`, ctx.user.id);
    await this.service.acceptFollowRequest(ctx, userId);
    return VoidResponse;
  }

  /**
   * Reject a follow request
   * @param ctx - Request context
   * @param userId - Username of the user to reject
   */
  @Post(':userId/reject')
  async rejectFollowRequest(@UserContext() ctx: UserCtx, @Param('userId') userId: string): Promise<VoidResponse> {
    this.logger.debug(`Controller layer: trying to reject follow request from user ${userId}`, ctx.user.id);
    await this.service.rejectFollowRequest(ctx, userId);
    return VoidResponse;
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
  ): Promise<UserProfileDto[]> {
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
  ): Promise<UserProfileDto[]> {
    this.logger.debug(`Controller layer: trying to get following for ${userId}`);
    return this.service.getFollowing(ctx, userId, pagination);
  }

  /**
   * Get user profile by id
   * @param ctx - Request context
   * @param userId - Id of the user to get
   */
  @Get(':userId')
  async getProfile(@UserContext() ctx: UserCtx, @Param('userId') userId: string): Promise<UserProfileDto> {
    this.logger.debug(`Controller layer: trying to get user by id ${userId}`, ctx.user.id);
    const profiles = await this.service.getProfiles(ctx, [userId]);
    return profiles[0];
  }
}
