'use strict';

const util = require('util');
//const execSync = require('child_process').execSync;
const exec = util.promisify(require('child_process').exec);

const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const program = require('commander');

program
  .version(0.1)
  .option('-d, --dockerFile <dockerFile>', 'Docker Compose file to read (Required)')
  .option('-b, --branch <branch>', 'Branch to check(Required)')
  .option('-s --statusOnly', 'only report on what branches are not on dev')
  .parse(process.argv);

console.log(`Using Docker ${program.dockerFile}`);
const dockerComposeFile = program.dockerFile;
const doChange = !program.statusOnly;
const defaultBranch = program.branch;

if(!defaultBranch || ! dockerComposeFile){
  program.outputHelp();
  return;
}

// Assume that the docker compose is in a peer folder of the rest of the code
// we can add an override later
const codeBaseDir = path.normalize(path.dirname(path.dirname(dockerComposeFile)));


async function execFunc(cmd, dir, outputProcessor) {
  const { stdout, stderr } = await exec('git status', { cwd: dir });
  if (outputProcessor) {
    return outputProcessor(stdout, stderr);
  }
}

async function gitStatus(dir, command) {
  let nonDevDirs = [];
  const branch = await execFunc('git status', dir, (a, b) => {
    const match = a.match('On branch (.+)');
    //console.log(`The Callback ${match}`);
    return match[1]; // 0 is the whole string
  });
  if (branch != defaultBranch) {
    console.log(` ${dir} is ${branch} not ${defaultBranch}`);
    nonDevDirs.push(dir);
    if(doChange){
      console.log(`Changing ${dir} ${branch} -> ${defaultBranch}`);
      const { stdout2, stderr2 } = exec('git checkout development', dir);
    }
  }
  if(doChange){
   console.log(`updating ${dir}`);
   await execFunc('git pull', dir);
   console.log(`yarn install ${dir}`);
   await execFunc('yarn install', dir);
}
  //console.log('stdout:', stdout);
  //console.log('stderr:', stderr);
}

// Get document, or throw exception on error
try {
  var doc = yaml.safeLoad(fs.readFileSync(dockerComposeFile, 'utf8'));
  // get all keys
  // get all volumes in keys
  console.log('docker deps include:');
  console.log(Object.keys(doc.services));
  //console.log(Object.keys(doc.services['file']));
  for (var service in doc.services) {
    console.log(service);
    const s = doc.services[service];
    if (s.hasOwnProperty('volumes')) {
      const volumes = s['volumes'];
      console.log(volumes.filter(v => v.startsWith('../ts-')));
      const projectDirs = volumes.filter(v => v.startsWith('../ts-'));
      projectDirs.forEach(f => {
        const projDir = f.split(':')[0].replace('../', '');
        const projectPath = `${codeBaseDir}/${projDir}`;
        console.log(`>>>> ${projectPath}`);

        // collect all that are not on development and can't be switched
        gitStatus(projectPath);
      });
    }
  }
  //console.log();

  // console.log(doc);

  //console.log(doc);
} catch (e) {
  console.log(e);
}
