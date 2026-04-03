import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { User } from '@supabase/supabase-js';
import { SupabaseService } from 'src/core/supabase/supabase.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UserRow } from '../../types/request.types';
import { DbClient } from '../../types/database.types';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  private readonly supabase: DbClient;

  constructor(private readonly supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
  }

  /**
   * Get user from token
   * @param token
   * @returns current user
   */
  async getUser(token: string): Promise<User> {
    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new NotFoundException('User not found!');
    }

    return data.user;
  }

  /**
   * Get user by id
   * @param id
   * @returns user
   */
  async getUserById(id: string): Promise<UserRow | null> {
    const { data: user, error: userError } = await this.supabase.from('users').select('*').eq('id', id).single();

    if (userError || !user) {
      throw new NotFoundException('User not found!');
    }

    return user;
  }

  /**
   * Retrieves the profile data for a given user.
   *
   * @param {User} user - The user for whom the profile data is to be retrieved.
   * @param {string} userId - The optional user id
   * @return {Promise<UserProfileDto>} A promise that resolves to the user's profile data, including follow count.
   */
  async getProfile(user: User, userId?: string) {
    const user_identifier: string = userId ?? user.id;

    this.logger.debug(`ProfileService: Trying to get profile for ${user_identifier}`);

    const [userDto, followCount] = await Promise.all([
      this.getUserById(user_identifier),
      this.getSocialMediaCount(user),
    ]);

    if (!userDto) {
      this.logger.warn(`ProfileService: User ${user.id} not found`);
      throw new BadRequestException(`User ${user.id} not found`);
    }

    return { ...userDto, followers_count: followCount.followersCount, following_count: followCount.followingCount };
  }

  /**
   * Follows a user
   *
   * @param user The user who is going to follow
   * @param to The username that the user will follow
   */
  public async follow(user: User, to: string): Promise<void> {
    this.logger.debug(`UserService: Trying to follow user ${to}`);

    if (user.user_metadata?.username === to) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const { data: targetUser, error: findError } = await this.supabase
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

    const { error: insertError } = await this.supabase.from('social_follows').insert({
      id_follower: user.id,
      id_followed: targetUser.id,
    });

    if (insertError) {
      if (insertError.code === '23505') {
        // Unique violation
        throw new ConflictException(`You are already following ${to}`);
      }
      throw new InternalServerErrorException(insertError.message, { cause: insertError });
    }
  }

  /**
   * Unfollows a user
   *
   * @param user The user who is going to unfollow
   * @param to The username that the user will unfollow
   */
  public async unfollow(user: User, to: string): Promise<void> {
    this.logger.debug(`UserService: Trying to unfollow user ${to}`);
    const { data: targetUser, error: findError } = await this.supabase
      .from('users')
      .select('id')
      .eq('username', to)
      .single();

    if (findError || !targetUser) {
      throw new NotFoundException(`User ${to} not found`, { cause: findError });
    }

    const { error: deleteError } = await this.supabase
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
   * @param userId
   * @returns
   */
  public async getFollowers(userId: string, pagination: PaginationDto) {
    this.logger.debug(`UserService: Trying to get followers for user ${userId}`);
    const { data, error } = await this.supabase
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
   * @param {string} userId the user id
   * @param {PaginationDto} pagination the pagination
   * @returns {Promise<any[]>} the list of users that the user provided is following
   */
  public async getFollowing(userId: string, pagination: PaginationDto) {
    this.logger.debug(`UserService: Trying to get following for user ${userId}`);
    const { data, error } = await this.supabase
      .from('social_follows')
      .select(
        `
          id_followed,
          users:id_followed (
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
   * @param {User} user - The user for whom the follow count is being retrieved.
   * @return {Promise<FollowCountDto>} A Promise that resolves to an object containing the follower count and following count.
   */
  public async getSocialMediaCount(user: User) {
    this.logger.debug('UserService: Trying to get follow count');
    const userId = user.id;
    const followers = await this.getFollowersCount(userId);
    const following = await this.getFollowingCount(userId);

    return {
      followersCount: followers,
      followingCount: following,
    };
  }

  // Get followers count from user id provided
  private async getFollowersCount(userId: string): Promise<number> {
    this.logger.debug(`UserService: Trying to get followers count for user ${userId}`);
    const { data, error } = await this.supabase.from('social_follows').select('*').eq('id_followed', userId);
    if (error) {
      this.logger.warn(`UserService: Error getting followers count: ${error.message}`);
      return 0;
    }
    return data?.length ?? 0;
  }

  // Get following count from user id provided
  private async getFollowingCount(userId: string): Promise<number> {
    this.logger.debug(`UserService: Trying to get following count for user ${userId}`);
    const { data, error } = await this.supabase.from('social_follows').select('*').eq('id_follower', userId);
    if (error) {
      this.logger.warn(`UserService: Error getting following count: ${error.message}`);
      return 0;
    }
    return data?.length ?? 0;
  }
}
