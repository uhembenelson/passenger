import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ConvexHttpClient } from '../../node_modules/convex/dist/esm/browser/http_client.js';
const root = process.cwd();
const backend = path.join(root, 'packages/backend');
const env = await fs.readFile(path.join(backend, '.env.local'), 'utf8');
const deploymentName = env.match(/^CONVEX_DEPLOYMENT=["']?dev:([^\s"'#]+)/m)?.[1];
if (!deploymentName) throw new Error('Expected the configured development deployment.');
const config = JSON.parse(await fs.readFile(path.join(os.homedir(), '.convex/config.json'), 'utf8'));
const response = await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project', {
 method:'POST', headers: {'Authorization':`Bearer ${config.accessToken}`, 'Content-Type':'application/json'},
 body:JSON.stringify({selectedDeploymentName:deploymentName, projectSelection:{kind:'deploymentName', deploymentName}}),
});
if (!response.ok) throw new Error(`Deployment authorization failed: ${response.status}`);
const credentials = await response.json();
if (!credentials.adminKey || !credentials.url) throw new Error('Missing authorized deployment credentials.');
const client = new ConvexHttpClient(credentials.url);
client.setAdminAuth(credentials.adminKey);
const rows = JSON.parse(execFileSync('bunx',['convex','run','--inline-query','await ctx.db.query("promotions").collect()'],{cwd:backend,encoding:'utf8'}));
const seedPath = 'packages/backend/seed-data/promotions.json';
const seeds = JSON.parse(await fs.readFile(seedPath, 'utf8'));
const ids = seeds.map(seed => {
 const matches = rows.filter(row => row.title === seed.title);
 if (matches.length !== 1) throw new Error(`Expected exactly one offer: ${seed.title}`);
 return matches[0]._id;
});
if (ids.length !== 6) throw new Error('Expected six seeded offers.');
const result = await client.mutation('_system/frontend/patchDocumentsFields:default', {
 table: 'promotions', ids, fields: { published: true },
});
if (!result.success) throw new Error('Publishing failed.');
const verified = JSON.parse(execFileSync('bunx', ['convex', 'run', '--inline-query', 'await ctx.db.query("promotions").withIndex("by_published_and_position", q => q.eq("published", true)).collect()'], {cwd: backend, encoding: 'utf8'}));
if (!ids.every(id => verified.some(row => row._id === id && row.published))) throw new Error('Publication verification failed.');
for (const seed of seeds) seed.published = true;
await fs.writeFile(seedPath, JSON.stringify(seeds, null, 2) + '\n');
console.log(JSON.stringify(verified.filter(row => ids.includes(row._id)).map(row => ({title: row.title, published: row.published, hasImage: !!row.imageUrl})), null, 2));
