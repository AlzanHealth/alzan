import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PaginationDto } from '../../common/dto/pagination.dto';
import { NotificationService } from './notification/notification.service';
import { makeUserFollowNotificationData } from './user.helper';
import { UserCtx } from '../../common/decorators/user-context.decorator';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Get user by id using the request-scoped client (RLS-enforced)
   * @param ctx - Request context containing the user-scoped Supabase client
   * @param id - The user ID to look up
   */
  async getUserById(ctx: UserCtx, id: string) {
    const { data: user, error: userError } = await ctx.supabase.from('users').select('*').eq('id', id).single();

    if (userError || !user) {
      throw new NotFoundException('User not found!');
    }

    return user;
  }

  /**
   * Retrieves the profile data for a given user.
   *
   * @param ctx - Request context containing the authenticated user and scoped client
   * @param userId - Optional: look up a different user's profile; defaults to the requester's own profile
   */
  async getProfile(ctx: UserCtx, userId?: string) {
    const { user } = ctx;
    const user_identifier: string = userId ?? user.id;

    this.logger.debug(`ProfileService: Trying to get profile for ${user_identifier}`);

    const [userDto, followCount] = await Promise.all([
      this.getUserById(ctx, user_identifier),
      this.getSocialMediaCount(ctx),
    ]);

    if (!userDto) {
      this.logger.warn(`ProfileService: User ${ctx.user.id} not found`);
      throw new BadRequestException(`User ${ctx.user.id} not found`);
    }

    return { ...userDto, followers_count: followCount.followersCount, following_count: followCount.followingCount };
  }

  /**
   * Follows a user
   *
   * @param ctx - Request context containing the authenticated user and scoped client
   * @param to - The username of the user to follow
   */
  public async follow(ctx: UserCtx, to: string) {
    const { user, supabase } = ctx;

    this.logger.debug(`UserService: Trying to follow user ${to}`);

    if (user.username === to) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const { data: targetUser, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('username', to)
      .single();

    if (findError || !targetUser) {
      throw new NotFoundException(`User ${to} not found`, { cause: findError });
    }

    if (targetUser.id === user.id) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const { error: insertError } = await supabase.from('social_follows').insert({
      id_follower: user.id,
      id_followed: targetUser.id,
      is_accepted: false,
    });

    if (insertError) {
      if (insertError.code === '23505') {
        // Unique violation
        throw new ConflictException(`You are already following ${to}`);
      }
      throw new InternalServerErrorException(insertError.message, { cause: insertError });
    }

    await this.notificationService.createNotification({
      type: 'USER_FOLLOW_REQUEST',
      data: makeUserFollowNotificationData(user),
      user_id: targetUser.id,
    });
  }

  /**
   * Unfollows a user
   *
   * @param ctx - Request context containing the authenticated user and scoped client
   * @param to - The username of the user to unfollow
   */
  public async unfollow(ctx: UserCtx, to: string) {
    const { user, supabase } = ctx;
    this.logger.debug(`UserService: Trying to unfollow user ${to}`);
    const { data: targetUser, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('username', to)
      .single();

    if (findError || !targetUser) {
      throw new NotFoundException(`User ${to} not found`, { cause: findError });
    }

    const { error: deleteError } = await supabase
      .from('social_follows')
      .delete()
      .eq('id_follower', user.id)
      .eq('id_followed', targetUser.id);

    if (deleteError) {
      throw new InternalServerErrorException(deleteError.message, { cause: deleteError });
    }
  }

  /**
   * Get followers of the user provided
   *
   * @param ctx - Request context containing the authenticated user and scoped client
   * @param userId - The user whose followers to retrieve
   * @param pagination - Pagination parameters
   */
  public async getFollowers(ctx: UserCtx, userId: string, pagination: PaginationDto) {
    const { supabase } = ctx;
    this.logger.debug(`UserService: Trying to get followers for user ${userId}`);
    const { data, error } = await supabase
      .from('social_follows')
      .select(
        `
            id_follower,
            users!id_follower (
                id,
                username,
                display_name,
                avatar_url
            )
        `,
      )
      .eq('id_followed', userId)
      .range(pagination.offset || 0, (pagination.offset || 0) + (pagination.limit || 10) - 1);

    if (error) {
      throw new InternalServerErrorException(error.message, { cause: error });
    }

    return data?.map(item => item.users) ?? [];
  }

  /**
   * Get the list of users that the user provided is following
   *
   * @param ctx - Request context containing the authenticated user and scoped client
   * @param userId - The user whose following list to retrieve
   * @param pagination - Pagination parameters
   */
  public async getFollowing(ctx: UserCtx, userId: string, pagination: PaginationDto) {
    const { supabase } = ctx;
    this.logger.debug(`UserService: Trying to get following for user ${userId}`);
    const { data, error } = await supabase
      .from('social_follows')
      .select(
        `
          id_followed,
          users!id_followed (
            id,
            username,
            display_name,
            avatar_url
          )
        `,
      )
      .eq('id_follower', userId)
      .range(pagination.offset || 0, (pagination.offset || 0) + (pagination.limit || 10) - 1);

    if (error) {
      throw new InternalServerErrorException(error.message, { cause: error });
    }

    return data?.map(item => item.users) ?? [];
  }

  /**
   * Retrieves the count of followers and following for a specified user.
   *
   * @param ctx - Request context containing the authenticated user and scoped client
   */
  public async getSocialMediaCount(ctx: UserCtx) {
    const { user } = ctx;
    this.logger.debug('UserService: Trying to get follow count');
    const userId = user.id;
    const followers = await this.getFollowersCount(ctx, userId);
    const following = await this.getFollowingCount(ctx, userId);

    return {
      followersCount: followers,
      followingCount: following,
    };
  }

  /**
   * Get followers count from user id provided
   * @param ctx - Request context containing the authenticated user and scoped client
   * @param userId - The user whose followers count to retrieve
   */
  private async getFollowersCount(ctx: UserCtx, userId: string) {
    const { supabase } = ctx;
    this.logger.debug(`UserService: Trying to get followers count for user ${userId}`);
    const { data, error } = await supabase.from('social_follows').select('*').eq('id_followed', userId);
    if (error) {
      this.logger.warn(`UserService: Error getting followers count: ${error.message}`);
      return 0;
    }
    return data?.length ?? 0;
  }

  /**
   * Get following count from user id provided
   * @param ctx - Request context containing the authenticated user and scoped client
   * @param userId - The user whose following count to retrieve
   */
  private async getFollowingCount(ctx: UserCtx, userId: string) {
    const { supabase } = ctx;
    this.logger.debug(`UserService: Trying to get following count for user ${userId}`);
    const { data, error } = await supabase.from('social_follows').select('*').eq('id_follower', userId);
    if (error) {
      this.logger.warn(`UserService: Error getting following count: ${error.message}`);
      return 0;
    }
    return data?.length ?? 0;
  }
}
