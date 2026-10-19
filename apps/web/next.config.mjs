/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@predator-guard/db', '@predator-guard/ring', '@predator-guard/sim', '@predator-guard/vision'],
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  experimental: {
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
};

export default nextConfig;
