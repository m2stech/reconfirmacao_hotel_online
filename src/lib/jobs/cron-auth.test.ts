import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requisicaoAutenticadaComoCron } from "./cron-auth";

const ENV_ORIGINAL = { ...process.env };

function requestComAuth(header: string | null) {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return { headers } as unknown as import("next/server").NextRequest;
}

describe("requisicaoAutenticadaComoCron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "segredo-fake";
  });

  afterEach(() => {
    process.env = { ...ENV_ORIGINAL };
  });

  it("autentica quando o header Bearer bate com CRON_SECRET", () => {
    expect(requisicaoAutenticadaComoCron(requestComAuth("Bearer segredo-fake"))).toBe(true);
  });

  it("rejeita quando o header não bate", () => {
    expect(requisicaoAutenticadaComoCron(requestComAuth("Bearer outro-valor"))).toBe(false);
  });

  it("rejeita quando não há header de autorização", () => {
    expect(requisicaoAutenticadaComoCron(requestComAuth(null))).toBe(false);
  });

  it("rejeita sempre quando CRON_SECRET não está configurado no ambiente (nunca autentica por omissão)", () => {
    delete process.env.CRON_SECRET;
    expect(requisicaoAutenticadaComoCron(requestComAuth("Bearer qualquer-coisa"))).toBe(false);
  });
});
