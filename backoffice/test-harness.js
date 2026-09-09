// Test-only entry point. Wrangler deploys src/index.js and never this file.
// Public routes run through the real worker; admin routes skip the Cloudflare
// Access check so the business logic can be exercised offline. The deployed
// Worker always verifies the signed Access assertion first.
import worker, { adminRoutes } from './src/index.js';

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/admin/')) {
      return adminRoutes(request, env, url, env.ADMIN_EMAIL);
    }
    return worker.fetch(request, env, ctx);
  },
};
