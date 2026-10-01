import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distRoot = join(projectRoot, 'dist');
const port = Number(process.env.PORT ?? 4173);

if (!existsSync(distRoot)) {
  console.error('dist/ does not exist. Run `npm run build` first.');
  process.exit(1);
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relativePath = requestPath.replace(/^\/+/, '');
  const candidate = normalize(join(distRoot, relativePath));
  const isInsideDist = candidate === distRoot || candidate.startsWith(`${distRoot}/`);
  const filePath = isInsideDist && existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(distRoot, 'index.html');

  response.setHeader('Content-Type', contentTypes[extname(filePath)] ?? 'application/octet-stream');
  createReadStream(filePath).on('error', () => {
    response.statusCode = 500;
    response.end('Unable to read the requested file.');
  }).pipe(response);
}).listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
});
