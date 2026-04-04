import { Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { SupabaseUserAuth } from '../../core/guards/auth.decorator';
import { FollowResponseDto, UserOutputDto } from './dto/user.output-dto';
import { VoidResponse } from '../../core/interceptors/response-serializer.interceptor';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UserService } from './user.service';
import {
  RequestContext,
  type RequestContext as RequestContextType,
} from '../../common/decorators/request-context.decorator';

@Controller('users')
@SupabaseUserAuth()
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly service: UserService) {}

  /**
   * Get current authenticated user
   */
  @Get()
  getCurrentUser(@RequestContext() ctx: RequestContextType): UserOutputDto {
    return ctx.user;
  }

  /**
   * Follow a user
   * @param ctx - Request context
   * @param userId - Username of the user to follow
   */
  @Post(':userId/follow')
  async followUser(@RequestContext() ctx: RequestContextType, @Param('userId') userId: string): Promise<void> {
    this.logger.debug(`Controller layer: trying to follow user ${userId}`, ctx.user.id);
    return this.service.follow(ctx, userId);
  }

  /**
   * Unfollow a user
   * @param ctx - Request context
   * @param userId - Username of the user to unfollow
   */
  @Post(':userId/unfollow')
  async unfollowUser(
    @RequestContext() ctx: RequestContextType,
    @Param('userId') userId: string,
  ): Promise<VoidResponse> {
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
    @RequestContext() ctx: RequestContextType,
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
    @RequestContext() ctx: RequestContextType,
    @Param('userId') userId: string,
    @Query() pagination: PaginationDto,
  ): Promise<FollowResponseDto[]> {
    this.logger.debug(`Controller layer: trying to get following for ${userId}`);
    return this.service.getFollowing(ctx, userId, pagination);
  }
}
