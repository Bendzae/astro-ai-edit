import type { AstroIntegration } from 'astro';

export default function astroAiEdit(): AstroIntegration {
  return {
    name: 'astro-ai-edit',
    hooks: {
      'astro:config:setup': ({ injectRoute, addMiddleware }) => {
        // Page routes
        injectRoute({ pattern: '/admin', entrypoint: 'astro-ai-edit/pages/admin/index.astro' });
        injectRoute({ pattern: '/admin/login', entrypoint: 'astro-ai-edit/pages/admin/login.astro' });

        // API routes
        injectRoute({ pattern: '/api/auth', entrypoint: 'astro-ai-edit/pages/api/auth' });
        injectRoute({ pattern: '/api/prompt', entrypoint: 'astro-ai-edit/pages/api/prompt' });
        injectRoute({ pattern: '/api/status', entrypoint: 'astro-ai-edit/pages/api/status' });
        injectRoute({ pattern: '/api/issues', entrypoint: 'astro-ai-edit/pages/api/issues' });
        injectRoute({ pattern: '/api/upload', entrypoint: 'astro-ai-edit/pages/api/upload' });
        injectRoute({ pattern: '/api/archive', entrypoint: 'astro-ai-edit/pages/api/archive' });
        injectRoute({ pattern: '/api/merge', entrypoint: 'astro-ai-edit/pages/api/merge' });

        // Auth middleware
        addMiddleware({ order: 'pre', entrypoint: 'astro-ai-edit/middleware' });
      },
    },
  };
}
