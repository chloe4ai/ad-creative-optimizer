/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API's package-lock.json sits one level up; pin the workspace root to this folder
  // so Turbopack does not pick the repository root.
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
