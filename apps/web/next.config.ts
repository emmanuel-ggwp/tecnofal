import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @tecnofal/core se publica como fuente TS (main: src/index.ts) — Next debe transpilarlo.
  transpilePackages: ['@tecnofal/core'],
  webpack: (config) => {
    // core usa imports estilo NodeNext ('./types.js' apuntando a types.ts)
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
