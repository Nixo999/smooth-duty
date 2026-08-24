import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Il foglio dei turni viaggia dentro una Server Action, e il limite
      // predefinito e' 1 MB: un file poco piu' grande verrebbe rifiutato
      // senza spiegare perche'.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
