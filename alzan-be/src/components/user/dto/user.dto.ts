import { IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class UserSearchDto extends PaginationDto {
  @IsString()
  readonly q!: string;
}
