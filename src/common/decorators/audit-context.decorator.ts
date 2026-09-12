import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserAuthContext } from '../../auth/interfaces/auth.interface';

export interface AuditMetadata {
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  method: string;
  endpoint: string;
}

interface RequestWithUser extends Request {
  user?: UserAuthContext;
}

export const AuditContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuditMetadata => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();

    const rawForwarded = request.headers['x-forwarded-for'];
    const forwardedStr =
      typeof rawForwarded === 'string'
        ? rawForwarded
        : Array.isArray(rawForwarded)
          ? rawForwarded[0]
          : undefined;

    const ipAddress =
      forwardedStr?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress ||
      'unknown';

    const rawUserAgent = request.headers['user-agent'];
    const userAgentStr: string | undefined =
      typeof rawUserAgent === 'string'
        ? rawUserAgent
        : Array.isArray(rawUserAgent)
          ? rawUserAgent[0]
          : undefined;

    return {
      userId: request.user?.id,
      ipAddress,
      userAgent: userAgentStr,
      method: request.method,
      endpoint: request.originalUrl || request.url,
    };
  },
);
