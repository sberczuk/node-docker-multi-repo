'use strict';

//TODOs:

//* better reporting of inconsistencies. Maybe a summary?
//* Also update internal libs that we reference in sundry package.json files
// * Make local module identification a function rather than inline.

const util = require('util');
const exec = util.promisify(require('child_process').exec);
//const execSync = require('child_process').execSync;

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
const cloned = [];
const switched = [];
const updated = [];
const notUpdated = [];

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

runProgram();
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
        //console.log(`${dependency}  ${internalModule}`);
        deps.push(internalModule);
      }
    }
  });
  console.log(deps);
  return deps;
}

async function getPossibleBranch(module, desiredBranch) {
  const dir = fullPathToProject(module);
  let supportedBranch = desiredBranch;
  try {
    //const branchOutput = execSync(`git branch -r`, {cwd: dir});
    const {stderr, stdout} = await exec(`git branch -r`, {cwd: dir});
    const branchOutput = stdout;
    // console.log(branchOutput.toString());
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

async function yarnInstall(dir) {
//const output = execSync('yarn install', {cwd: dir});
  const {stdout: output, stderr: err2} = await exec('yarn install', {cwd: dir});
  console.log(`yarn install ${dir} result :\n  ${output}`);
  return true;
}

async function gitPull(dir) {
  const {stdout: pullOutput, stderr} = await exec('git pull', {cwd: dir});
  console.log(`Pull ${dir} result :\n ${pullOutput.toString()}`);
  const wasUpdated = !pullOutput.indexOf('Your branch is up to date') > -1;
  if (!wasUpdated) {
    updated.push(dir);
    return true;
  }
  return false;
}

async function switchBranch(module, branchToSwitchTo, dir, currentBranch) {

  console.log(`Changing ${dir} ${currentBranch} -> ${branchToSwitchTo}`);
  // const checkoutOutput = execSync(`git checkout ${theBranch}`, {cwd: dir});
  try {
    const {stdout: checkoutOutput, stderr} = await exec(`git checkout ${branchToSwitchTo}`, {cwd: dir});
    //
    // switched.push(dir);

    console.log(checkoutOutput.toString());
    return true;
  } catch (e) {
    return false;
  }
}

async function updateGitRepo(module, branchToSwitchTo = defaultBranch) {

  let nonDevDirs = [];
  const dir = fullPathToProject(module);
  console.log(`Processing ${module} in ${dir}`);
  //const statusOutput = execSync('git status', {cwd: dir});
  const {stdout: statusOutput, stderr} = await exec('git status', {cwd: dir});
  console.log(statusOutput.toString());
  const s = statusOutput.toString();
  const match = s.match('On branch (.+)');
  const hasChanges = s.includes('modified');
  const currentBranch = match[1];

  if (hasChanges) {
    notUpdated.push(module);
  }

  if (currentBranch != branchToSwitchTo) {
    console.log(` ${module} is ${currentBranch} not ${branchToSwitchTo} ${hasChanges ? ' and has changes' : ''}`);
    nonDevDirs.push(dir);
    if (doChange && !hasChanges) {// only update when there are no modified files
      try {
        const theBranch = await getPossibleBranch(module, branchToSwitchTo);

        if (await switchBranch(module, theBranch, dir, currentBranch)) {
          switched.push(module);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }
  if (doChange && ( currentBranch === branchToSwitchTo )) {
    console.log(`updating ${module}`);
    //const pullOutput = execSync('git pull', {cwd: dir});
    try {
      if (await gitPull(dir)) {
        updated.push(module);
      }
      await yarnInstall(dir);
    } catch (e) {
      console.log(`error doing update ${e}`);
    }
  }
  return true;
}

function projectPackageFileSystemPath(projectPath) {
  const pathToPackageFile = path.join(fullPathToProject(projectPath), 'package.json');
  return pathToPackageFile;
}

function fullPathToProject(project) {
  return path.join(codeBaseDir, project);
}

async function cloneNewRepo(module) {
  //const output = execSync(`git clone git@github.com:tetrascience/${module}.git`, {cwd: codeBaseDir});
  try {
    const {stdout: output, stderr} = await exec(`git clone git@github.com:tetrascience/${module}.git`, {cwd: codeBaseDir});
    console.log(output.toString());
    return module;
  } catch (e) {
    return null;
  }
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

//main
async function runProgram() {
  try {
    const modules = getModules(dockerComposeFile);
    console.log(` Modules are ${modules}`);
    let libSet = new Set();
    for (let i = 0; i < modules.length; i++) {
      const m = modules[i];
      const modulePath = fullPathToProject(m);
      if (!fs.existsSync(modulePath) && doChange) {
        console.log(`Project ${modulePath} does not exist. Getting.`);
        await cloneNewRepo(m);
        cloned.push(m);
        console.log(`CLONED! ${cloned.length}`);
      }

      await updateGitRepo(m, defaultBranch);
      const libs = discoverLibModules(m);
      libs.forEach(l => {libSet.add(l);});

    }

    console.log('updating libraries');
      for(let ii = 0; ii < libSet.length; ii++){
        const i = libSet[ii];

      const modulePath = fullPathToProject(i);
      if (!fs.existsSync(modulePath) && doChange) {
        console.log(`Project ${modulePath} does not exist. Getting.`);
        await cloneNewRepo(i);
      }
      await updateGitRepo(i, 'master'); // libs on master for now
    }
    // summary -- doesn't work with async/await Fix is TBD
    console.log('\n\n\nSummary ----------------');
    console.log('\nSwitched Branches:');
    switched.forEach(d => console.log(`switched ${d}`));
    console.log('\nUpdated Repository:');
    updated.forEach(d => console.log(`updated ${d}`));
    console.log('\nCloned Repository:');
    cloned.forEach(d => console.log(`cloned ${d}`));
    // switched.forEach(d => console.log(`switched ${d}`));

    console.log('\nNOT Updated (because of existing changes)');
    notUpdated.forEach(d => console.log(`NOT UPDATED ${d}`));

  } catch (e) {
    console.log('>>> Tool exited with an error');
    console.log(e);
  }
}
