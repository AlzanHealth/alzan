import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  readonly limit: number = 10;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  readonly offset: number = 0;
}
