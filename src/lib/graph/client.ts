// Client Microsoft Graph via client credentials flow (app registration,
// permissões de aplicação Mail.Read/Mail.Send) — nunca login interativo.
// Ver CLAUDE.md "Microsoft Graph" e PRD §5/§10 item 1.

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

type TokenCache = { accessToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

async function obterAccessToken(): Promise<string> {
  const agora = Date.now();
  if (tokenCache && tokenCache.expiresAt > agora + 60_000) {
    return tokenCache.accessToken;
  }

  const tenantId = process.env.MS_GRAPH_TENANT_ID!;
  const clientId = process.env.MS_GRAPH_CLIENT_ID!;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET!;

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const corpo = await response.text();
    throw new Error(`Falha ao obter token do Microsoft Graph (HTTP ${response.status}): ${corpo}`);
  }

  const dados = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: dados.access_token,
    expiresAt: agora + dados.expires_in * 1000,
  };
  return dados.access_token;
}

export type GraphRequestInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

/**
 * Chamada autenticada à Graph API em nome da caixa configurada em
 * `MS_GRAPH_AUTHORIZED_EMAIL` — nunca conta individual de consultor
 * (CLAUDE.md, requisito mandatório do cliente Snow).
 */
export async function graphFetch(path: string, init: GraphRequestInit = {}): Promise<Response> {
  const accessToken = await obterAccessToken();
  return fetch(`${GRAPH_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

export function caixaAutorizada(): string {
  const email = process.env.MS_GRAPH_AUTHORIZED_EMAIL;
  if (!email) {
    throw new Error("MS_GRAPH_AUTHORIZED_EMAIL não configurado no .env.");
  }
  return email;
}
