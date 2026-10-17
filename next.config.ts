import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["xmllint-wasm", "xadesjs", "@peculiar/x509"],
  outputFileTracingIncludes: { "/api/ksef-test": ["./lib/ksef/schemas/*.*", "./node_modules/.pnpm/xmllint-wasm@*/node_modules/xmllint-wasm/xmllint.wasm"] },
};

export default nextConfig;
