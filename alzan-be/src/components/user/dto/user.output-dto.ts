import { Expose } from 'class-transformer';

/**
 * User public profile DTO
 */
export class UserProfileDto {
  /**
   * User ID
   * @example 4424c5d6-5751-4038-aa39-bd85895ddb78
   */
  @Expose()
  id!: string;

  /**
   * Unique username
   * @example johndoe
   */
  @Expose()
  username!: string | null;

  /**
   * Display name shown publicly
   * @example John Doe
   */
  @Expose()
  display_name?: string | null;

  /**
   * URL of the user's avatar image
   * @example https://cdn.alzan.com/avatars/johndoe.png
   */
  @Expose()
  avatar_url?: string | null;

  /**
   * Total number of followers
   * @example 42
   */
  @Expose()
  followers_count!: number;

  /**
   * Total number of accounts the user is following
   * @example 17
   */
  @Expose()
  following_count!: number;
}

/**
 * Follow count summary DTO
 */
export class FollowCountDto {
  /**
   * Number of followers
   * @example 42
   */
  @Expose()
  followersCount!: number;

  /**
   * Number of accounts the user is following
   * @example 17
   */
  @Expose()
  followingCount!: number;
}

/**
 * Minimal user representation returned in follower / following lists
 */
export class FollowResponseDto {
  /**
   * User ID
   * @example 4424c5d6-5751-4038-aa39-bd85895ddb78
   */
  @Expose()
  id!: string;

  /**
   * Unique username
   * @example johndoe
   */
  @Expose()
  username!: string | null;

  /**
   * Display name shown publicly
   * @example John Doe
   */
  @Expose()
  display_name!: string | null;

  /**
   * URL of the user's avatar image
   * @example https://cdn.alzan.com/avatars/johndoe.png
   */
  @Expose()
  avatar_url!: string | null;
}
