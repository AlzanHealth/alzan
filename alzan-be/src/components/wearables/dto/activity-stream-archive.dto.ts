import { Expose } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReadArchivedActivityStreamsDto {
  @ApiProperty({ type: [String], maxItems: 20, uniqueItems: true })
  @Expose()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  session_ids!: string[];
}

export class ArchivedActivityStreamSampleDto {
  @ApiProperty()
  @Expose()
  session_id!: string;

  @ApiProperty({ enum: ['heart_rate', 'speed', 'power'] })
  @Expose()
  stream_type!: string;

  @ApiProperty({ nullable: true })
  @Expose()
  offset_s!: number | null;

  @ApiProperty({ nullable: true })
  @Expose()
  timestamp!: string | null;

  @ApiProperty()
  @Expose()
  value!: number;
}

export class ReadArchivedActivityStreamsOutputDto {
  @ApiProperty({ type: [String] })
  @Expose()
  archived_session_ids!: string[];

  @ApiProperty({ type: [ArchivedActivityStreamSampleDto] })
  @Expose()
  samples!: ArchivedActivityStreamSampleDto[];
}
