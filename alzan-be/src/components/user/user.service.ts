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
import { SupabaseAdminService } from '../../core/supabase/supabase.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly supabaseAdminService: SupabaseAdminService,
  ) {}

  async searchUsers(ctx: UserCtx, query: string, pagination: PaginationDto) {
    const { limit, offset } = pagination;
    const { client: supabase } = this.supabaseAdminService;
    this.logger.debug(`UserService: Trying to search users for ${query}`);

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select(
        'id, username, display_name, avatar_url, followers:social_follows!id_followed(count), following:social_follows!id_follower(count)',
      )
      .ilike('username', `%${query}%`)
      .limit(limit)
      .range(offset, offset + limit - 1);

    if (usersError || !users) {
      throw new InternalServerErrorException(usersError?.message, { cause: usersError });
    }

    // Efficiently check if current user is following the loaded users
    let followingSet = new Set<string>();
    if (users.length > 0) {
      const userIds = users.map(u => u.id);
      const { data: followsData } = await supabase
        .from('social_follows')
        .select('id_followed')
        .eq('id_follower', ctx.user.id)
        .in('id_followed', userIds);
      
      if (followsData) {
        followingSet = new Set(followsData.map(f => f.id_followed));
      }
    }

    return users.map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      followers_count: u.followers?.[0]?.count ?? 0,
      following_count: u.following?.[0]?.count ?? 0,
      is_following: followingSet.has(u.id),
    }));
  }

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
   * Accepts a follow request
   *
   * @param ctx - Request context containing the authenticated user and scoped client
   * @param from - The username of the user to accept
   */
  public async acceptFollowRequest(ctx: UserCtx, from: string) {
    const { user, supabase } = ctx;
    this.logger.debug(`UserService: Trying to accept follow request from user ${from}`);

    const { data: targetUser, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('username', from)
      .single();

    if (findError || !targetUser) {
      throw new NotFoundException(`User ${from} not found`, { cause: findError });
    }

    const { error: updateError } = await supabase
      .from('social_follows')
      .update({
        is_accepted: true,
      })
      .eq('id_follower', targetUser.id)
      .eq('id_followed', user.id);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message, { cause: updateError });
    }

    await this.notificationService.createNotification({
      type: 'USER_FOLLOW_REQUEST_ACCEPTED',
      data: makeUserFollowNotificationData(user),
      user_id: targetUser.id,
    });
  }

  /**
   * Rejects a follow request
   *
   * @param ctx - Request context containing the authenticated user and scoped client
   * @param from - The username of the user to reject
   */
  public async rejectFollowRequest(ctx: UserCtx, from: string) {
    const { user, supabase } = ctx;
    this.logger.debug(`UserService: Trying to reject follow request from user ${from}`);

    const { data: targetUser, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('username', from)
      .single();

    if (findError || !targetUser) {
      throw new NotFoundException(`User ${from} not found`, { cause: findError });
    }

    const { error: deleteError } = await supabase
      .from('social_follows')
      .delete()
      .eq('id_follower', targetUser.id)
      .eq('id_followed', user.id);

    if (deleteError) {
      throw new InternalServerErrorException(deleteError.message, { cause: deleteError });
    }

    await this.notificationService.createNotification({
      type: 'USER_FOLLOW_REQUEST_REJECTED',
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
    const { limit, offset } = pagination;
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
      .limit(limit)
      .range(offset, offset + limit - 1);

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
    const { limit, offset } = pagination;
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
      .limit(limit)
      .range(offset, offset + limit - 1);

    if (error) {
      throw new InternalServerErrorException(error.message, { cause: error });
    }

    return data?.map(item => item.users) ?? [];
  }
}
