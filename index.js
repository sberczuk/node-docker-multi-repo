
'use strict'

const util = require('util');
//const execSync = require('child_process').execSync;
const exec = util.promisify(require('child_process').exec);


const yaml = require('js-yaml');
const fs   = require('fs');
// Look into how to package this as a command line (Node JS In Action book?)

const program = require('commander');

program
  .version(0.1)
  .option('-d, --dockerFile <dockerFile>', 'Docker Compose file to read')
  .parse(process.argv);


  console.log(`Using Docker ${program.dockerFile}`);
 const dockerComposeFile = program.dockerFile;

 async function execFunc (cmd, dir, outputProcessor) {
  const { stdout, stderr } =  exec('git status', {cwd: dir});
  console.log(stdout);
  return outputProcessor(stdout, stderr);
}

async function gitStatus(dir, command) {
  let nonDevDirs = [];
  console.log(`CWD is ${dir}`);
  /**
  const branch =   await execFunc('git status',dir, (a,b) => {
   const match = a.match('On branch (.+)');
  return;
    match[0];

  });
  */
  const { stdout, stderr } =  await exec('git status', {cwd: dir});
  const match = stdout.match('On branch (.+)');
  const branch = match[0];
  console.log (`branch is ${branch}`);
  return;
  //const { stdout, stderr } =  exec('git status', {cwd: dir});
  //const match = stdout.match('On branch (.+)');
  //const branch = match[0];
  if(branch != 'development'){
    nonDevDirs.push(dir)
    console.log(`Changing ${dir} ${branch} -> development`);

    const { stdout2, stderr2 } =  exec('git checkout development', {cwd: dir});

  }
  // always
  console.log(`updating ${dir}`);
  const { stdout3, stderr3 } =  exec('git pull', {cwd: dir});
  console.log(`yarn install ${dir}`);

  const { stdout4, stderr4 } =  exec('yarn install', {cwd: dir});

  //console.log('stdout:', stdout);
  //console.log('stderr:', stderr);
  console.log(`dirs not on dev ${nonDevDirs}`);

}

// Get document, or throw exception on error
try {
  var doc = yaml.safeLoad(fs.readFileSync(dockerComposeFile, 'utf8'));
  // get all keys
  // get all volumes in keys
  console.log('docker deps include:');
  console.log(Object.keys(doc.services));
  //console.log(Object.keys(doc.services['file']));
  for(var service in doc.services){
    console.log(service);
    const s = doc.services[service];
    if(s.hasOwnProperty('volumes')){
      const volumes = s['volumes'];
      console.log(volumes.filter( v => v.startsWith('../ts-')));
      const projectDirs = volumes.filter( v => v.startsWith('../ts-'));
      projectDirs.forEach(f => {
       const baseDir = f.split(':')[0].replace('../', '');
       const projectPath =`/Users/sberczuk/code/${baseDir}`;
       console.log(`>>>> ${projectPath}`);

       // collect all that are not on development and can't be switched
      gitStatus(projectPath)
    });
    }

  }
 //console.log();

// console.log(doc);

  //console.log(doc);
} catch (e) {
  console.log(e);
}
