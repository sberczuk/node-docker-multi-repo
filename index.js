'use strict';

const util = require('util');
//const execSync = require('child_process').execSync;
const exec = util.promisify(require('child_process').exec);
const execSync =require('child_process').execSync;

const yaml = require('js-yaml');
const fs = require('fs');

const path = require('path');
const program = require('commander');

const gitUrlBase = '';

program
  .version(0.1)
  .option('-d, --dockerFile <dockerFile>', 'Docker Compose file to read (Required)')
  .option('-b, --branch <branch>', 'Branch to check(Required)')
  .option('-s --statusOnly', 'only report on what branches are not on dev')
  .parse(process.argv);

console.log(`Using Docker compose file: ${program.dockerFile}`);
const dockerComposeFile = program.dockerFile;
const doChange = !program.statusOnly;
const defaultBranch = program.branch;


// check for required args.
if(!(defaultBranch && dockerComposeFile){
  console.log("you must specify a branch and a docker compose file")
  program.outputHelp();
  return;
}

// Assume that the docker compose is in a peer folder of the rest of the code
// we can add an override later
const codeBaseDir = path.normalize(path.dirname(path.dirname(dockerComposeFile)));


// Execute a function and extract information from  the output.
//TO DO exit if there is a error.
async function execFunc(cmd, dir, outputProcessor) {
  const { stdout, stderr } = await exec('git status', { cwd: dir });
  if (outputProcessor) {
    return outputProcessor(stdout, stderr);
  }
}

async function gitStatus(dir, command) {
  let nonDevDirs = [];
  const [branch, hasChanges] = await execFunc('git status', dir, (a, b) => {
    const match = a.match('On branch (.+)');
    const hasChanges = a.includes('modified');
  //  console.log(`=The Callback|${match}|${match[1]}`);
    return  [match[1], hasChanges]; // 0 is the whole string
  });
  if (branch != defaultBranch) {
    console.log(` ${dir} is ${branch} not ${defaultBranch} ${hasChanges?' and has changes':''}`);
    nonDevDirs.push(dir);
    if(doChange && ! hasChanges){// only update when there are no modified files
      console.log(`Changing ${dir} ${branch} -> ${defaultBranch}`);
      execSync(`git checkout ${defaultBranch}` , dir);
    }
  }
  if(doChange){
   console.log(`updating ${dir}`);
    execSync('git pull', dir);
   console.log(`yarn install ${dir}`);
   // add callback that does yarn reporting

    execSync('yarn install', dir);
}

}

// Get document, or throw exception on error
try {
  var doc = yaml.safeLoad(fs.readFileSync(dockerComposeFile, 'utf8'));
  // get all keys
  // get all volumes in keys
  console.log('docker deps include:');
  console.log(Object.keys(doc.services));
  for (var service in doc.services) {
    console.log(`Processing ${service}`);
    const s = doc.services[service];
    if (s.hasOwnProperty('volumes')) {
      const volumes = s['volumes'];
      //console.log(volumes.filter(v => v.startsWith('../ts-')));
      // this is a rough heuristic. We need a better one.
      const projectDirs = volumes.filter(v => v.startsWith('../ts-'));
      projectDirs.forEach(f => {
        const projDir = f.split(':')[0].replace('../', '');
        const projectPath = `${codeBaseDir}/${projDir}`;
      //  console.log(`>>>> ${projectPath}`);
        if(!fs.existsSync(projectPath)){
          // get the folder
          console.log(`Project ${projDir} does not exist. Getting.`);
          // TODO: Git Checkout
          //execFunc()
        }
        // collect all that are not on development and can't be switched
        // only do node modules
        if(fs.existsSync(path.join(projectPath,'package.json'))){
          gitStatus(projectPath);
      }
      });
    }
  }

} catch (e) {
  console.log(e);
}
