import { Expose } from 'class-transformer';

export class AuthorizationResponseDto {
  /**
   * The URL to redirect the user to for authorization
   * @example https://www.strava.com/oauth/mobile/authorize?...
   */
  @Expose()
  authorization_url!: string;

  /**
   * Random state string used to prevent CSRF
   * @example abc123def456
   */
  @Expose()
  state!: string;
}

export class OAuthSuccessResponseDto {
  /**
   * Indicates if the operation was successful
   * @example true
   */
  @Expose()
  success!: true;

  /**
   * Success message
   * @example Successfully connected to strava
   */
  @Expose()
  message!: string;

  /**
   * User ID associated with the connection
   * @example 4424c5d6-5751-4038-aa39-bd85895ddb78
   */
  @Expose()
  user_id!: string;

  /**
   * Provider identifier
   * @example strava
   */
  @Expose()
  provider!: string;
}

export class OAuthErrorResponseDto {
  /**
   * Indicates if the operation was successful
   * @example false
   */
  @Expose()
  success!: false;

  /**
   * Error message
   * @example OAuth authentication failed
   */
  @Expose()
  message!: string;
}
