export interface ActivityImportUploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type ActivityImportKind = 'route' | 'strength';

export const ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const STRENGTH_FILE_IMPORT_SOURCE = 'strength_file_import';
