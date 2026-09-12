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
const assets = [
 ['Send a little love home','send-love-home'],
 ['Your next trip could pay','trip-could-pay'],
 ['Back to campus, bag by bag','back-to-campus'],
];
const records = [];
for (const [title,name] of assets) {
 const matches=rows.filter(r=>r.title===title);
 if(matches.length!==1) throw new Error(`Expected one promotion for ${title}`);
 const row=matches[0];
 if(row.imageUrl) throw new Error(`Promotion already has an image: ${title}`);
 const uploadUrl = await client.mutation('_system/frontend/fileStorageV2:generateUploadUrl', {});
 const file = `output/imagegen/promotions/assets/${name}.webp`;
 const upload = await fetch(uploadUrl,{method:'POST',headers:{'Content-Type':'image/webp'},body:await fs.readFile(file)});
 if(!upload.ok) throw new Error(`Upload failed: ${upload.status}`);
 const {storageId}=await upload.json();
 const metadata=await client.query('_system/frontend/fileStorageV2:getFile',{storageId});
 if(!metadata?.url?.startsWith('https://')) throw new Error('Expected an HTTPS asset URL');
 const patch=await client.mutation('_system/frontend/patchDocumentsFields:default',{table:'promotions',ids:[row._id],fields:{imageUrl:metadata.url}});
 if(!patch.success) throw new Error('Promotion update failed');
 records.push({title,promotionId:row._id,storageId,imageUrl:metadata.url,file});
 await fs.writeFile('output/imagegen/promotions/attachments.json',JSON.stringify(records,null,2)+'\n');
 console.log(`Attached image: ${title}`);
}
const seedPath='packages/backend/seed-data/promotions.json';
const seeds=JSON.parse(await fs.readFile(seedPath,'utf8'));
for(const seed of seeds){const image=records.find(r=>r.title===seed.title);if(image)seed.imageUrl=image.imageUrl;}
await fs.writeFile(seedPath,JSON.stringify(seeds,null,2)+'\n');
