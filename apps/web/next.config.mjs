/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages are TypeScript sources with no separate build step; let
  // Next compile them (db, ring and sim all ship `.ts` through their exports).
  transpilePackages: ['@predator-guard/db', '@predator-guard/ring', '@predator-guard/sim'],
  // PGlite loads a WASM Postgres and postgres-js is a native client - both must
  // stay out of the server bundle and be required at runtime instead.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
};

export default nextConfig;
