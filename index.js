
'use strict'

const util = require('util');
const exec = util.promisify(require('child_process').exec);


const yaml = require('js-yaml');
const fs   = require('fs');
// Look into how to package this as a command line (Node JS In Action book?)

async function cmd(dir, command) {
  console.log(`CWD is ${dir}`);
  const { stdout, stderr } = await exec('git status', {cwd: dir});
  console.log('stdout:', stdout);
  console.log('stderr:', stderr);
}

// Get document, or throw exception on error
try {
  var doc = yaml.safeLoad(fs.readFileSync('/Users/sberczuk/code/ts-devops-informatics-stack/docker-compose.yml', 'utf8'));
  // get all keys
  // get all volumes in keys
  console.log('docker deps include:');
  console.log(Object.keys(doc.services));
  //console.log(Object.keys(doc.services['file']));

  for(var service in doc.services){
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
      cmd(projectPath, 'git status')
    });
    }

  }
 //console.log();

// console.log(doc);

  //console.log(doc);
} catch (e) {
  console.log(e);
}
