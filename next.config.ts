import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // padrão é 1MB — cadastro de imóvel manda vídeo+PDF+fotos numa Server Action só,
    // qualquer mídia de celular estoura isso na hora (mesmo bug documentado no Corrêa/MVF)
    serverActions: {
      bodySizeLimit: "50mb",
    },
    // o proxy (checagem de login) bufferiza o corpo com teto próprio de 10MB — acima disso
    // a Server Action recebe o upload cortado e a página cai em "server error". Tem que
    // acompanhar o bodySizeLimit de cima.
    proxyClientMaxBodySize: "60mb",
  },
};

export default nextConfig;
