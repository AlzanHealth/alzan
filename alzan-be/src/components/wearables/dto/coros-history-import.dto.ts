import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class CorosHistoryImportFileErrorDto {
  @ApiProperty()
  @Expose()
  fileName!: string;

  @ApiProperty()
  @Expose()
  code!: string;
}

export class CorosHistoryImportResultDto {
  @ApiProperty()
  @Expose()
  filesImported!: number;

  @ApiProperty()
  @Expose()
  filesSkipped!: number;

  @ApiProperty()
  @Expose()
  filesFailed!: number;

  @ApiProperty({ type: [CorosHistoryImportFileErrorDto] })
  @Expose()
  errorsByFile!: CorosHistoryImportFileErrorDto[];
}
