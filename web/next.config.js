/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  // Disable static optimization for pages using useSearchParams
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://silvertown-tunnel-production.up.railway.app/v1',
  },
};

module.exports = nextConfig;
