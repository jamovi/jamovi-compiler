
'use strict';

const path = require('path');
const fs = require('fs');
const util = require('util');
const sh = require('child_process').execSync;

const compile = function(srcDir, moduleDir) {

    let rDir = path.join(moduleDir, 'R');

    try {
        fs.statSync(rDir);
    }
    catch (e) {
        fs.mkdirSync(rDir);
    }

    let basePath = path.join(moduleDir, '..', 'base', 'R');
    let cmd = util.format('R CMD INSTALL --no-test-load --library="%s" "%s"', rDir, srcDir);
    console.log(cmd);
    console.log(sh(cmd, { encoding: 'utf-8', env: { R_LIBS: basePath } } ));
}

module.exports = compile
