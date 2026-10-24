import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda';
import { handle, type State } from './app.js';

let state: State | null = null;

async function loadState(): Promise<State> {
  if (state) return state;
  const sm = new SecretsManagerClient({});
  const r = await sm.send(new GetSecretValueCommand({ SecretId: process.env.STATE_SECRET_ID! }));
  state = JSON.parse(r.SecretString!) as State;
  return state;
}

export async function handler(event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResult> {
  try {
    const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : '';
    const res = await handle(
      { method: event.requestContext.http.method, path: event.rawPath, body: raw ? JSON.parse(raw) : null, headers: event.headers },
      await loadState(),
      process.env.DEMO_TOKEN,
    );
    return { statusCode: res.status, headers: res.headers, body: res.body, isBase64Encoded: !!res.base64 };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: (e as Error).message }) };
  }
}
