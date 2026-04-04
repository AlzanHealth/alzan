import { Expose, Type } from 'class-transformer';

/**
 * User application metadata
 */
class UserAppMetadata {
  /**
   * The first provider that the user used to sign up with
   * @example email
   */
  @Expose()
  provider?: string;

  /**
   * A list of all providers that the user has linked to their account
   * @example ["email"]
   */
  @Expose()
  providers?: string[];

  /**
   * Additional metadata fields
   */
  [key: string]: unknown;
}

/**
 * User metadata - custom user data
 */
class UserMetadata {
  /**
   * Additional metadata fields
   */
  [key: string]: unknown;
}

/**
 * Identity data within a user identity
 */
class IdentityData {
  /**
   * Additional identity data fields
   */
  [key: string]: unknown;
}

/**
 * User identity from authentication provider
 */
class UserIdentity {
  /**
   * Identity ID
   * @example 76a88c8c-7bf4-4faf-b1dc-c549e13a48c0
   */
  @Expose()
  id!: string;

  /**
   * User ID
   * @example 4424c5d6-5751-4038-aa39-bd85895ddb78
   */
  @Expose()
  user_id!: string;

  /**
   * Identity data
   */
  @Expose()
  @Type(() => IdentityData)
  identity_data?: IdentityData;

  /**
   * Identity ID
   * @example 76a88c8c-7bf4-4faf-b1dc-c549e13a48c0
   */
  @Expose()
  identity_id!: string;

  /**
   * Authentication provider
   * @example email
   */
  @Expose()
  provider!: string;

  /**
   * Identity creation timestamp
   * @example 2026-01-10T17:14:06.995337Z
   */
  @Expose()
  created_at?: string;

  /**
   * Last sign in timestamp
   * @example 2026-01-10T17:14:06.995323Z
   */
  @Expose()
  last_sign_in_at?: string;

  /**
   * Identity update timestamp
   * @example 2026-01-10T17:14:06.995337Z
   */
  @Expose()
  updated_at?: string;
}

/**
 * Supabase User DTO matching the auth-js User interface
 */
export class UserOutputDto {
  /**
   * User ID
   * @example 4424c5d6-5751-4038-aa39-bd85895ddb78
   */
  @Expose()
  id!: string;

  /**
   * Application metadata
   */
  @Expose()
  @Type(() => UserAppMetadata)
  app_metadata!: UserAppMetadata;

  /**
   * User metadata
   */
  @Expose()
  @Type(() => UserMetadata)
  user_metadata!: UserMetadata;

  /**
   * User audience
   * @example authenticated
   */
  @Expose()
  aud!: string;

  /**
   * Confirmation sent at timestamp
   * @example 2026-01-10T17:14:06.996671Z
   */
  @Expose()
  confirmation_sent_at?: string;

  /**
   * Recovery sent at timestamp
   */
  @Expose()
  recovery_sent_at?: string;

  /**
   * Email change sent at timestamp
   */
  @Expose()
  email_change_sent_at?: string;

  /**
   * New email (during email change)
   */
  @Expose()
  new_email?: string;

  /**
   * New phone (during phone change)
   */
  @Expose()
  new_phone?: string;

  /**
   * Invited at timestamp
   */
  @Expose()
  invited_at?: string;

  /**
   * Action link
   */
  @Expose()
  action_link?: string;

  /**
   * User email
   * @example info@alzan.com
   */
  @Expose()
  email?: string;

  /**
   * User phone number
   */
  @Expose()
  phone?: string;

  /**
   * User creation timestamp
   * @example 2026-01-10T17:14:06.990543Z
   */
  @Expose()
  created_at!: string;

  /**
   * Account confirmation timestamp
   * @example 2026-01-10T17:14:06.996671Z
   */
  @Expose()
  confirmed_at?: string;

  /**
   * Email confirmation timestamp
   * @example 2026-01-10T17:14:06.996671Z
   */
  @Expose()
  email_confirmed_at?: string;

  /**
   * Phone confirmation timestamp
   */
  @Expose()
  phone_confirmed_at?: string;

  /**
   * Last sign in timestamp
   * @example 2026-01-25T14:05:04.820838Z
   */
  @Expose()
  last_sign_in_at?: string;

  /**
   * User role
   * @example authenticated
   */
  @Expose()
  role?: string;

  /**
   * User update timestamp
   * @example 2026-01-25T14:05:04.824569Z
   */
  @Expose()
  updated_at?: string;

  /**
   * User identities
   */
  @Expose()
  @Type(() => UserIdentity)
  identities?: UserIdentity[];

  /**
   * Whether user is anonymous
   * @example false
   */
  @Expose()
  is_anonymous?: boolean;

  /**
   * Whether user is SSO user
   */
  @Expose()
  is_sso_user?: boolean;

  /**
   * MFA factors (not included in typical responses)
   */
  @Expose()
  factors?: unknown[];

  /**
   * Deleted at timestamp
   */
  @Expose()
  deleted_at?: string;

  /**
   * Banned until timestamp
   */
  @Expose()
  banned_until?: string;
}

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
