import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GetAuthorizationUrlQueryDto {
  /**
   * User ID to associate with the connection
   * @example 4424c5d6-5751-4038-aa39-bd85895ddb78
   */
  @IsString()
  @IsNotEmpty()
  user_id!: string;

  /**
   * Optional custom redirect URI after authorization
   * @example alzan://oauth/success
   */
  @IsString()
  @IsOptional()
  redirect_uri?: string;
}

export class OAuthCallbackQueryDto {
  /**
   * Authorization code returned by the provider
   */
  @IsString()
  @IsOptional()
  code?: string;

  /**
   * State string returned by the provider
   */
  @IsString()
  @IsOptional()
  state?: string;

  /**
   * Error code if the authorization failed
   */
  @IsString()
  @IsOptional()
  error?: string;

  /**
   * Human-readable error description
   */
  @IsString()
  @IsOptional()
  error_description?: string;
}

export class OAuthSuccessQueryDto {
  /**
   * Provider identifier
   * @example strava
   */
  @IsString()
  @IsNotEmpty()
  provider!: string;

  /**
   * User ID associated with the connection
   * @example 4424c5d6-5751-4038-aa39-bd85895ddb78
   */
  @IsString()
  @IsNotEmpty()
  user_id!: string;
}

export class OAuthErrorQueryDto {
  /**
   * Error message to display
   * @example OAuth authentication failed
   */
  @IsString()
  @IsOptional()
  message?: string;
}
