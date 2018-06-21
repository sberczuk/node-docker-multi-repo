'use strict';

//TODOs:

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

// summary data
let cloned = [];
let switched = [];
let updated = [];
let notUpdated = [];

// we can add an override later
const codeBaseDir = path.normalize(path.dirname(path.dirname(dockerComposeFile)));

console.log(`Using Docker compose file: ${dockerComposeFile}`);
const doChange = !program.statusOnly;
const defaultBranch = program.branch;

// check for required args.
if (!( defaultBranch && dockerComposeFile )) {
  console.log('you must specify a branch and a docker compose file');
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

function discoverLibModules(module) {
  //find each package.json, and collect a list of tsModulesToGet
  let deps = [];
  const pkgJsonPath = projectPackageFileSystemPath(module);
  console.log(`parsing ${pkgJsonPath}`);
  // look for deps and dev deps, filter for 'tetrascience/...'
  const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath));
  //console.log(JSON.stringify(pkgData.dependencies));
  Object.keys(pkgData.dependencies).forEach(k => {
    if (k.startsWith('ts-')) {
      const depsRe = /tetrascience\/(.*)#/;
      const dependency = pkgData.dependencies[k];
      const match = dependency.match(depsRe);
      if (match) {
        const internalModule = match[1];
        console.log(`${dependency}  ${internalModule}`);
        deps.push(internalModule);
      }
    }
  });
  console.log(deps);
  return deps;
}

function getPossibleBranch(module, desiredBranch) {
  const dir = fullPathToProject(module);
  let supportedBranch = desiredBranch;
  try {
    const branchOutput = execSync(`git branch -r`, {cwd: dir});
    console.log(branchOutput.toString());
    if (branchOutput.includes(`origin/${desiredBranch}`)) {
      supportedBranch = desiredBranch;
    } else {
      console.log(`Branch ${desiredBranch} is not available for ${module}. Using master`);
      supportedBranch = 'master';
    }
    // look for the desired branch in the origins, else return master
  } catch (e) {
    console.error(e);
  }
  return supportedBranch;
}

function updateGitRepo(module, branchToSwitchTo = defaultBranch) {

  let nonDevDirs = [];
  const dir = fullPathToProject(module);
  console.log(`Processing ${module} in ${dir}`);
  const statusOutput = execSync('git status', {cwd: dir});
  console.log(statusOutput.toString());
  const s = statusOutput.toString();
  const match = s.match('On branch (.+)');
  const hasChanges = s.includes('modified');
  const branch = match[1];

  if (hasChanges) {
    notUpdated.push(module);
  }

  if (branch != branchToSwitchTo) {
    console.log(` ${module} is ${branch} not ${branchToSwitchTo} ${hasChanges ? ' and has changes' : ''}`);
    nonDevDirs.push(dir);
    if (doChange && !hasChanges) {// only update when there are no modified files
      try {
        const theBranch = getPossibleBranch(module, branchToSwitchTo);
        console.log(`Changing ${dir} ${branch} -> ${theBranch}`);
        const checkoutOutput = execSync(`git checkout ${theBranch}`, {cwd: dir});
        switched.push(dir);

        console.log(checkoutOutput.toString());
      } catch (e) {
        console.error(e);
      }
    }
  }
  if (doChange && ( branch === branchToSwitchTo )) {
    console.log(`updating ${module}`);
    const pullOutput = execSync('git pull', {cwd: dir});
    console.log(`Pull ${dir} result :\n ${pullOutput.toString()}`);
    const wasUpdated = !pullOutput.indexOf('Your branch is up to date') > -1;
    const output = execSync('yarn install', {cwd: dir});
    console.log(`yarn install ${dir} result :\n  ${output}`);
    if (!wasUpdated) {
      updated.push(dir);
    }
  }

}

function projectPackageFileSystemPath(projectPath) {
  const pathToPackageFile = path.join(fullPathToProject(projectPath), 'package.json');
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
  let projects = new Set();
  var doc = yaml.safeLoad(fs.readFileSync(dockerComposeFile, 'utf8'));
  // get all keys
  // get all volumes in keys
  //console.log('docker deps include:');
  //console.log(Object.keys(doc.services));
  for (var service in doc.services) {
    console.log(`Processing ${service}`);
    const s = doc.services[service];
    if (s.hasOwnProperty('volumes')) {
      const volumes = s['volumes'];
      // this is a rough heuristic. We need a better one.
      const projectDirs = volumes.filter(v => v.startsWith('../ts-'));
      projectDirs.forEach(f => {

        // ignore anything with a / past position 4
        const t = f.split(':')[0].replace('../', '');
        const end = t.lastIndexOf('/');
        const endSubstr = end > 0 ? end : t.length;
        const module = t.substring(0, endSubstr);
        const projectPath = fullPathToProject(module);

        // only do node modules & ignore submodules of our projects
        const pathToPackageFile = projectPackageFileSystemPath(projectPath);
        if (end < 0) {
          projects.add(module);
        } else {
          console.log(`Skipping ${t}`);
        }
      });
    }
  }
  return Array.from(projects);
}

try {
  const modules = getModules(dockerComposeFile);
  console.log(` Modules are ${modules}`);
  let libSet = new Set();
  modules.forEach(m => {
    const modulePath = fullPathToProject(m);
    if (!fs.existsSync(modulePath) && doChange) {
      console.log(`Project ${modulePath} does not exist. Getting.`);
      cloneNewRepo(m);
      cloned.push(m);
    }
    updateGitRepo(m, defaultBranch);
    const libs = discoverLibModules(m);
    libs.forEach(l => {libSet.add(l);});

  });
  libSet.forEach(i => {
    const modulePath = fullPathToProject(i);
    if (!fs.existsSync(modulePath) && doChange) {
      console.log(`Project ${modulePath} does not exist. Getting.`);
      cloneNewRepo(i);
    }
    updateGitRepo(i, 'master'); // libs on master for now
  });
  // summary
  console.log('\n\n\nSummary ----------------');
  updated.forEach(d => console.log(`updated ${d}`));
  cloned.forEach(d => console.log(`cloned ${d}`));
  switched.forEach(d => console.log(`switched ${d}`));
  console.log('\nNOT Updated (because of existing changes)');
  notUpdated.forEach(d => console.log(`NOT UPDATED ${d}`));

} catch (e) {
  console.log(e);
}
