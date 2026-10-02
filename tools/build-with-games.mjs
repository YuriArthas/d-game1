import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const game = resolve(process.env.BLOCK_BLAST_PROJECT || join(root, '../d-Block-Blast'));
if (!existsSync(join(game, 'package.json'))) throw new Error(`Block Blast source missing: ${game}. Set BLOCK_BLAST_PROJECT to its checkout.`);
const run = (file,args,cwd=root) => execFileSync(process.execPath,[file,...args],{cwd,stdio:'inherit'});
// Build the child first: a child failure must not erase the currently served host dist.
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',['run','build'],{cwd:game,stdio:'inherit'});
run('node_modules/typescript/bin/tsc',['--noEmit']);
run('node_modules/vite/bin/vite.js',['build']);
const destination=join(root,'dist/games/block-blast');
rmSync(destination,{recursive:true,force:true});
cpSync(join(game,'dist'),destination,{recursive:true});
console.log('Block Blast mounted at /games/block-blast/index.html');
