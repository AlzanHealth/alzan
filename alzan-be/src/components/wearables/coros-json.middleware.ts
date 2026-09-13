import { BadRequestException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { parseCorosJson } from '../activity-import/parsers/coros-json';

export function corosJsonMiddleware(request: Request, _response: Response, next: NextFunction): void {
  try {
    if (typeof request.body === 'string') request.body = parseCorosJson(request.body);
    next();
  } catch {
    next(new BadRequestException('COROS_JSON_INVALID'));
  }
}
