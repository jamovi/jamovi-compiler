
'use strict';

const path = require('path');
const fs = require('fs-extra');
const util = require('util');
const sh = require('child_process').execSync;

const compile = function(srcDir, moduleDir) {

    let rDir = path.join(moduleDir, 'R');
    let buildDir = path.join(srcDir, 'build')

    try {
        fs.statSync(buildDir);
    }
    catch (e) {
        fs.mkdirSync(buildDir);
    }

    let rLibs = buildDir + ':' + path.join(__dirname, 'rlibs');

    try {
        console.log('Installing dependencies')
        let cmd;
        cmd = util.format('R --silent -e "devtools::install_deps(\'%s\', upgrade_dependencies=FALSE, lib=\'%s\')"', srcDir, buildDir);
        sh(cmd, { stdio: 'inherit', encoding: 'utf-8', env: { R_LIBS: rLibs } } );
        cmd = util.format('R --silent -e "devtools::install(\'%s\', upgrade_dependencies=FALSE, lib=\'%s\')"', srcDir, buildDir);
        sh(cmd, { stdio: 'inherit', encoding: 'utf-8', env: { R_LIBS: rLibs } } );
    }
    catch (e) {
        throw 'Could not build module';
    }

    fs.copySync(buildDir, rDir);
}

module.exports = compile
