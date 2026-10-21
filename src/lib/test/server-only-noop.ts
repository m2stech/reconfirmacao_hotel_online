// Substitui `server-only` em testes (Vitest) — ver vitest.config.ts. No
// bundler do Next.js esse pacote é um no-op em Server Components e só lança
// erro quando importado de um Client Component; fora do Next, o import teria
// que ser mockado de qualquer forma, então aqui ele vira um módulo vazio.
export {};
