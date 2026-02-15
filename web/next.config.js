/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://silvertown-tunnel-production.up.railway.app/v1',
  },
};

module.exports = nextConfig;
