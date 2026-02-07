import { z } from 'zod';
import { insertBotConfigSchema, botConfigs } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  bots: {
    list: {
      method: 'GET' as const,
      path: '/api/bots' as const,
      responses: {
        200: z.array(z.custom<typeof botConfigs.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/bots/:id' as const,
      responses: {
        200: z.custom<typeof botConfigs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/bots' as const,
      input: insertBotConfigSchema,
      responses: {
        201: z.custom<typeof botConfigs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/bots/:id' as const,
      input: insertBotConfigSchema.partial(),
      responses: {
        200: z.custom<typeof botConfigs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/bots/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    // Bot Actions
    restart: {
        method: 'POST' as const,
        path: '/api/bots/:id/restart' as const,
        responses: {
            200: z.object({ success: z.boolean(), message: z.string() }),
            404: errorSchemas.notFound
        }
    },
    stop: {
        method: 'POST' as const,
        path: '/api/bots/:id/stop' as const,
        responses: {
            200: z.object({ success: z.boolean(), message: z.string() }),
            404: errorSchemas.notFound
        }
    }
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
