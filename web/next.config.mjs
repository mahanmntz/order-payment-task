/** @type {import('next').NextConfig} */
export default {
  // Browser calls /api/* on this origin; Next forwards to the Express API (no CORS needed).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://localhost:3000'}/:path*` }];
  },
};
