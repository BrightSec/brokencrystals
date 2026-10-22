/**
 * Minimal evidence server: boots the real OrcaRouter Cyber Inference NestJS
 * module (the same controller, catalog, credential store and service used by
 * the application) and serves the built React client from `client/dist`.
 *
 * Only the provider module is mounted so the benchmark's Postgres/Keycloak
 * dependencies are not required to exercise the provider UI.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const clientDist = path.join(repoRoot, 'client', 'dist');

const { NestFactory } = require('@nestjs/core');
const { FastifyAdapter } = require('@nestjs/platform-fastify');
const fastifyStatic = require('@fastify/static');
const { OrcaRouterModule } = require(
  path.join(repoRoot, 'dist', 'orcarouter', 'orcarouter.module.js')
);

if (!existsSync(clientDist)) {
  console.error(
    'client/dist is missing; run `npm run build --prefix=client` first'
  );
  process.exit(2);
}

const port = Number(process.env.ORCA_EVIDENCE_PORT ?? 3000);

const app = await NestFactory.create(OrcaRouterModule, new FastifyAdapter(), {
  logger: ['error', 'warn']
});

// Nest installs its own not-found handler during init; register the SPA
// fallback afterwards so client-side routes such as /chat resolve.
await app.init();

const fastify = app.getHttpAdapter().getInstance();
await fastify.register(fastifyStatic, {
  root: clientDist,
  prefix: '/',
  wildcard: false
});

fastify.get('/*', (request, reply) => {
  const url = (request.raw.url ?? '/').split('?')[0];
  if (url.startsWith('/api/')) {
    return reply.code(404).send({ message: 'Not found' });
  }
  const candidate = path.resolve(clientDist, `.${url}`);
  if (
    url !== '/' &&
    candidate.startsWith(clientDist) &&
    existsSync(candidate)
  ) {
    return reply.sendFile(url.replace(/^\//, ''));
  }
  return reply.sendFile('index.html');
});

await app.listen(port, '127.0.0.1');
console.log(`evidence server listening on http://127.0.0.1:${port}`);
