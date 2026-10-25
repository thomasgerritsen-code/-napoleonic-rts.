'use strict';

const fs = require('node:fs');
const path = require('node:path');

function stampDeployment(root, { sha, runNumber, deployedAt }) {
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error('Deployment requires the 40-character Git commit SHA');
  }
  const run = Number(runNumber);
  if (!Number.isSafeInteger(run) || run < 1) {
    throw new Error('Deployment requires a positive GitHub Actions run number');
  }
  if (typeof deployedAt !== 'string' || !Number.isFinite(Date.parse(deployedAt))) {
    throw new Error('Deployment requires a valid timestamp');
  }

  const marker = 'src/foundation/deployment-info.js?build=local';
  const pages=['index.html','play.html'].filter(file=>fs.existsSync(path.join(root,file))).map(file=>({file,index:fs.readFileSync(path.join(root,file),'utf8')}));
  if(!pages.some(p=>p.file==='index.html'))throw new Error('Missing index.html');
  for(const page of pages)if(!page.index.includes(marker))throw new Error(`Expected deployment-info script marker missing from ${page.file}`);

  const info = { commit: sha.toLowerCase(), runNumber: run, deployedAt };
  const jsPath = path.join(root, 'src/foundation/deployment-info.js');
  // Only the Pages deployment workspace is stamped; repository files are unchanged.
  fs.writeFileSync(jsPath,
    `'use strict';\nwindow.RTS_DEPLOYMENT_INFO = Object.freeze(${JSON.stringify(info)});\n`);
  for(const page of pages)fs.writeFileSync(path.join(root,page.file),
    page.index.replace(marker, `src/foundation/deployment-info.js?build=${sha.slice(0, 12)}`));
  return info;
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const info = stampDeployment(root, {
    sha: process.env.GITHUB_SHA,
    runNumber: process.env.GITHUB_RUN_NUMBER,
    deployedAt: new Date().toISOString()
  });
  console.log(`Published RTS v build ${info.runNumber} from ${info.commit.slice(0, 7)}`);
}

module.exports = { stampDeployment };
