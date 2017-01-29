
'use strict';

const path = require('path');
const fs = require('fs-extra');
const util = require('util');
const sh = require('child_process').execSync;

const included = [

    // base

    'R',
    'base',
    'compiler',
    'datasets',
    'graphics',
    'grDevices',
    'grid',
    'methods',
    'parallel',
    'splines',
    'stats',
    'stats4',
    'tcltk',
    'utils',

    // recommended

    'KernSmooth',
    'MASS',
    'Matrix',
    'boot',
    'class',
    'cluster',
    'codetools',
    'foreign',
    'lattice',
    'mgcv',
    'nlme',
    'nnet',
    'rpart',
    'spatial',
    'survival',

    // jamovi

    'jmvcore',
    'R6',
];

const compile = function(srcDir, moduleDir) {

    let rDir = path.join(moduleDir, 'R');
    let buildDir = path.join(srcDir, 'build', 'R');

    try {
        fs.statSync(buildDir);
    }
    catch (e) {
        fs.mkdirsSync(buildDir);
    }

    let installed = fs.readdirSync(buildDir);

    let descPath = path.join(srcDir, 'DESCRIPTION');
    let desc = fs.readFileSync(descPath, 'utf-8');
    desc = desc.replace(/\n /g, ' ')

    let depends = desc.match(/\nDepends\s*:(.*)\n/);
    let imports = desc.match(/\nImports\s*:(.*)\n/);

    if (depends !== null) {
        depends = depends[1];
        depends = depends.match(/([A-Za-z][A-Za-z0-9_]*)/g);
    }
    else {
        depends = [ ];
    }

    if (imports !== null) {
        imports = imports[1];
        imports = imports.match(/([A-Za-z][A-Za-z0-9_]*)/g);
    }
    else {
        imports = [ ];
    }

    try {

        depends = depends.concat(imports);
        depends = depends.filter(x => included.indexOf(x) === -1);
        depends = depends.filter(x => installed.indexOf(x) === -1);

        let cmd;

        let rLibs = buildDir + path.delimiter + path.join(__dirname, 'rlibs');
        let env = process.env;
        env.R_LIBS = rLibs;
        env.R_LIBS_USER = 'notthere';

        if (depends.length > 0) {
            console.log('Installing dependencies')
            console.log(depends.join(', '));

            depends = depends.join("','");

            cmd = util.format('R --slave -e "utils::install.packages(c(\'%s\'), lib=\'%s\', repos=c(\'https://repo.jamovi.org\', \'https://cran.r-project.org\'), INSTALL_opts=c(\'--no-data\', \'--no-help\', \'--no-demo\'))"', depends, buildDir);
            sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
        }

        cmd = util.format('R CMD INSTALL "--library=%s" "%s"', buildDir, srcDir);
        sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
    }
    catch (e) {
        throw 'Could not build module';
    }

    fs.copySync(buildDir, rDir);
}

module.exports = compile
