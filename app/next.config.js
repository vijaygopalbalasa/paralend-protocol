/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  transpilePackages: ['@solana/wallet-adapter-react-ui'],
};
module.exports = nextConfig;
