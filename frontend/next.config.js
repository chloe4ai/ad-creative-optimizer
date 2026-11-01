const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The demo imports the real prediction engine from ../src/services/prediction.js, and
  // Turbopack only resolves files inside its root, so the root is the repository, not this
  // folder. Setting it explicitly also stops Turbopack guessing a root from the two lockfiles.
  turbopack: {
    root: path.join(__dirname, '..'),
  },
};

module.exports = nextConfig;
