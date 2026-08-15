import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // padrão é 1MB — cadastro de imóvel manda vídeo+PDF+fotos numa Server Action só,
    // qualquer mídia de celular estoura isso na hora (mesmo bug documentado no Corrêa/MVF)
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
