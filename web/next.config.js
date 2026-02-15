/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static optimization for pages using useSearchParams
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};

module.exports = nextConfig;
