import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const games = [
  { name: 'Block Blast', slug: 'block-blast', path: resolve(process.env.BLOCK_BLAST_PROJECT || join(root,'../d-Block-Blast')) },
  // Stable Mining is a published artifact. Building the launcher must never promote preview source.
  { name: 'Mining', slug: 'mining', artifact: resolve(process.env.MINING_RELEASE_DIST || join(root,'dist/games/mining')) },
  { name: 'Mining 测试版', slug: 'mining-test', path: resolve(process.env.MINING_TEST_PROJECT || process.env.MINING_PROJECT || join(root,'../d-Mining')) },
  { name: '松风矿谷 · 场景设计', slug: 'mining-surface', path: resolve(process.env.MINING_SURFACE_PROJECT || join(root,'../d-Mining/surface-study')) },
  { name: 'Survivor 测试版', slug: 'survivor-test', path: resolve(process.env.SURVIVOR_TEST_PROJECT || join(root,'../d-survivor')) },
  { name: '草堆寻针 测试版', slug: 'pick-needle-test', path: resolve(process.env.PICK_NEEDLE_TEST_PROJECT || join(root,'../d-PickNeedle')) },
];
const output = resolve(process.env.GAME_BUILD_OUT_DIR || join(root, 'dist'));
for (const game of games) {
  const required=game.path?join(game.path,'package.json'):join(game.artifact,'index.html');
  if (!existsSync(required)) throw new Error(`${game.name} input missing: ${required}. Set its project directory or MINING_RELEASE_DIST.`);
}
const run = (file,args,cwd=root) => execFileSync(process.execPath,[file,...args],{cwd,stdio:'inherit'});
// Stage child artifacts before Vite can empty the host output (which may hold the stable release).
const staged=mkdtempSync(join(tmpdir(),'game-launcher-'));
try {
  for (const game of games) {
    if(game.path)execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',['run','build'],{cwd:game.path,stdio:'inherit'});
    cpSync(game.artifact || join(game.path,'dist'),join(staged,game.slug),{recursive:true});
  }
  run('node_modules/typescript/bin/tsc',['--noEmit']);
  run('node_modules/vite/bin/vite.js',['build','--outDir',output,'--emptyOutDir']);
  for (const game of games) {
    cpSync(join(staged,game.slug),join(output,'games',game.slug),{recursive:true});
    console.log(`${game.name} mounted at /games/${game.slug}/index.html`);
  }
} finally { rmSync(staged,{recursive:true,force:true}); }
