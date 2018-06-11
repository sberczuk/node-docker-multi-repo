'use strict';


//TODOs:
//* output status of exec commands (In Progress)
//* better reporting of inconsistencies. Maybe a summary?
//* Also update internal libs that we reference in sundry package.json files
// * Make local module identification a function rather than inline.

const util = require('util');
//const execSync = require('child_process').execSync;
const exec = util.promisify(require('child_process').exec);
const execSync = require('child_process').execSync;

const yaml = require('js-yaml');
const fs = require('fs');

const path = require('path');
const program = require('commander');

const gitUrlBase = '';

program
  .version(0.1)
  .option('-d, --dockerFile <dockerFile>', 'Docker Compose file to read (Required. Full Path)')
  .option('-b, --branch <branch>', 'Branch to check(Required)')
  .option('-s, --statusOnly', 'only report on what branches are not on dev')
  .parse(process.argv);

// Assume that the docker compose is in a peer folder of the rest of the code
console.log(`${program.dockerFile}`);
const defaultDockerFile = path.normalize(path.join(__dirname, '../../docker-compose.yml'));
console.log(defaultDockerFile);
const dockerComposeFile = program.dockerFile || defaultDockerFile;


// we can add an override later
const codeBaseDir = path.normalize(path.dirname(path.dirname(dockerComposeFile)));

console.log(`Using Docker compose file: ${dockerComposeFile}`);
const doChange = !program.statusOnly;
const defaultBranch = program.branch;

// check for required args.
if (!(defaultBranch && dockerComposeFile)) {
  console.log("you must specify a branch and a docker compose file")
  program.outputHelp();
  return;
}

// Execute a function and extract information from  the output.
//TO DO exit if there is a error.
async function execFunc(cmd, dir, outputProcessor) {
  const {stdout, stderr} = await exec('git status', {cwd: dir});
  if (outputProcessor) {
    return outputProcessor(stdout, stderr);
  }
}

function gitStatus(module, command) {

  let nonDevDirs = [];
  const dir = fullPathToProject(module);
  console.log(`Processing ${module} in ${dir}`);
  const statusOutput = execSync('git status', {cwd: dir});
  console.log(statusOutput.toString());
  const s = statusOutput.toString();
  const match = s.match('On branch (.+)');
  const hasChanges = s.includes('modified');
  const branch = match[1];

  if (branch != defaultBranch) {
    console.log(` ${module} is ${branch} not ${defaultBranch} ${hasChanges ? ' and has changes' : ''}`);
    nonDevDirs.push(dir);
    if (doChange && !hasChanges) {// only update when there are no modified files
      console.log(`Changing ${dir} ${branch} -> ${defaultBranch}`);
      const checkoutOutput = execSync(`git checkout ${defaultBranch}`, {cwd: dir});
      console.log(checkoutOutput.toString());
    }
  }
  if (doChange && (branch === defaultBranch)) {
    console.log(`updating ${module}`);
    const pullOutput = execSync('git pull', {cwd: dir});
    console.log(`Pull ${dir} result : ${pullOutput.toString()}`);
    console.log(`yarn install ${dir}`);
    // add callback that does yarn reporting

    const output = execSync('yarn install', dir);
    console.log(`yarn install ${dir} result :${output}`);
  }

}

function projectPackageFileSystemPath(projectPath) {
  const pathToPackageFile = path.join(projectPath, 'package.json');
  return pathToPackageFile;
}

function fullPathToProject(project) {
  return path.join(codeBaseDir, project);
}

function cloneNewRepo(module) {
  const output = execSync(`git clone git@github.com:tetrascience/${module}.git`, {cwd: codeBaseDir});
  console.log(output.toString());
}

function getModules(dockerComposeFile) {
  let projects = [];
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
        const t = f.split(':')[0].replace('../', '');
        const end = t.lastIndexOf('/');
        const endSubstr = end > 0 ? end : t.length;
        const module = t.substring(0, endSubstr);

        //console.log(`>>>> ${module}`);
        const projectPath = fullPathToProject(module);

        // collect all that are not on development and can't be switched
        // only do node modules
        const pathToPackageFile = projectPackageFileSystemPath(projectPath);
        if (fs.existsSync(pathToPackageFile)) {
          projects.push(module);
        }
      });
    }
  }
  return projects;
}

// Get document, or throw exception on error
try {
  const modules = getModules(dockerComposeFile);

  modules.forEach(m => {
    const modulePath = fullPathToProject(m);
    if (!fs.existsSync(modulePath) && doChange) {
      console.log(`Project ${modulePath} does not exist. Getting.`);
      cloneNewRepo(module);
    }
    gitStatus(m);
  });


} catch (e) {
  console.log(e);
}
