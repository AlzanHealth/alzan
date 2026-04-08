import { Expose } from 'class-transformer';

export class AppOutputDto {
  /**
   * Status of the request
   * @example ok
   */
  @Expose()
  status!: string;

  /**
   * Timestamp of the request
   * @example 2026-01-25T14:26:29.000Z
   */
  @Expose()
  timestamp!: string;

  /**
   * Environment of the request
   * @example local
   */
  @Expose()
  environment!: string;

  /**
   * Base URL of the request
   * @example http://localhost:1111
   */
  @Expose()
  baseUrl!: string;
}
