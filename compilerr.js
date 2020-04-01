
'use strict';

const path = require('path');
const fs = require('fs-extra');
const util = require('util');
const sh = require('child_process').execSync;
const process = require('process');

const temp = require('temp');
temp.track();

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
    'tools',

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
    'Rcpp',
    'stringi',
    'stringr',
    'ggplot2',
    'knitr',

    // suppress installation of
    'testthat',
];

const compile = function(srcDir, moduleDir, paths, packageInfo, log, options) {

    options = options || {};

    let rDir = path.join(moduleDir, 'R');
    let buildDir = path.join(srcDir, 'build', 'R');
    let tempPath = path.join(srcDir, 'temp');

    let platform;
    switch (process.platform) {
    case 'win32':
        platform = 'win64';
        break;
    case 'darwin':
        platform = 'macos';
        break;
    default:
        platform = 'linux';
        break;
    }

    let rVersion = packageInfo.rVersion;

    if ((platform === 'win64' && rVersion !== '3.4.1')
            || (platform === 'macos' && rVersion !== '3.3.0')
            || (platform === 'linux' && rVersion !== '3.5.1'))
        buildDir = path.join(srcDir, 'build', `R${ rVersion }-${ platform }`);

    try {
        log.debug('checking existence of ' + buildDir);
        fs.statSync(buildDir);
        log.debug('exists');
    }
    catch (e) {
        log.debug(e.message);
        log.debug('creating ' + buildDir);
        fs.mkdirsSync(buildDir);
        log.debug('created');
    }

    log.debug('reading dir ' + buildDir);
    let installed = fs.readdirSync(buildDir);
    log.debug('read');

    log.debug('reading DESCRIPTION');
    let descPath = path.join(srcDir, 'DESCRIPTION');
    let desc = fs.readFileSync(descPath, 'utf-8');
    desc += '\n';  // add a newline to the end to help the regexes below
    log.debug('read');
    desc = desc.replace(/\t/g, ' ');
    desc = desc.replace(/\r?\n /g, ' ');

    let depends = desc.match(/\nDepends\s*:\s*(.*)\r?\n/);
    let imports = desc.match(/\nImports\s*:\s*(.*)\r?\n/);
    let suggests = desc.match(/\nSuggests\s*:\s*(.*)\r?\n/);
    let linkingTo = desc.match(/\nLinkingTo\s*:\s*(.*)\r?\n/);
    let remotes = desc.match(/\nRemotes\s*:\s*(.*)\r?\n/);

    if (depends !== null) {
        depends = depends[1];
        depends = depends.match(/([A-Za-z][A-Za-z0-9_\.]*)/g);
    }
    else {
        depends = [ ];
    }

    if (imports !== null) {
        imports = imports[1];
        imports = imports.match(/([A-Za-z][A-Za-z0-9_\.]*)/g);
    }
    else {
        imports = [ ];
    }

    if (suggests !== null) {
        suggests = suggests[1];
        suggests = suggests.match(/([A-Za-z][A-Za-z0-9_\.]*)/g);
    }
    else {
        suggests = [ ];
    }

    if (linkingTo !== null) {
        linkingTo = linkingTo[1];
        linkingTo = linkingTo.match(/([A-Za-z][A-Za-z0-9_\.]*)/g);
    }
    else {
        linkingTo = [ ];
    }

    if (remotes !== null) {
        remotes = remotes[1];
        remotes = remotes.match(/([A-Za-z0-9\#_\./@-]+)/g);
    }
    else {
        remotes = [ ];
    }

    depends = depends.concat(imports);
    depends = depends.concat(suggests);
    depends = depends.concat(linkingTo);
    depends = depends.filter(x => included.indexOf(x) === -1);
    depends = depends.filter(x => installed.indexOf(x) === -1);
    // remove duplicates
    depends = Array.from(new Set(depends));

    let cmd;

    let env = process.env;
    env.R_LIBS = buildDir;
    env.R_LIBS_SITE = paths.rLibs;
    env.R_LIBS_USER = 'notthere';
    env.R_REMOTES_NO_ERRORS_FROM_WARNINGS = '1';

    if (paths.rHome) {
        env.R_HOME = paths.rHome;

        if (process.platform === 'darwin') {
            env.R_SHARE_DIR = path.join(paths.rHome, 'share');
        }
    }

    let installType = 'getOption(\'pkgType\')'
    if (process.platform === 'darwin')
        installType = '\'mac.binary.el-capitan\''

    if (depends.length > 0) {
        console.log('Installing dependencies');
        console.log(depends.join(', '));

        depends = depends.join("','");

        let mirrors = options.mirror.split(',').map(x => `'${x}'`).join(',');

        cmd = util.format('"%s" --vanilla --slave -e "utils::install.packages(c(\'%s\'), lib=\'%s\', type=%s, repos=c(%s), INSTALL_opts=c(\'--no-data\', \'--no-help\', \'--no-demo\', \'--no-html\'))"', paths.rExe, depends, buildDir, installType, mirrors);
        cmd = cmd.replace(/\\/g, '/');
        try {
            sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
        }
        catch(e) {
            throw 'Failed to install dependencies';
        }
    }

    if (remotes.length > 0) {
        console.log('Installing remotes');
        console.log(remotes.join(', '));

        for (let remote of remotes) {

            cmd = util.format('"%s" --vanilla --slave -e "remotes::install_github(\'%s\', lib=\'%s\', type=%s, INSTALL_opts=c(\'--no-data\', \'--no-help\', \'--no-demo\', \'--no-html\'), dependencies=FALSE, upgrade=FALSE)"', paths.rExe, remote, buildDir, installType);
            cmd = cmd.replace(/\\/g, '/');
            try {
                sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
            }
            catch(e) {
                throw 'Failed to install remotes';
            }
        }
    }

    if (process.platform === 'darwin' && fs.existsSync('/usr/bin/install_name_tool')) {
        log.debug('fixing paths')

        let installed = fs.readdirSync(buildDir);

        const subs = {
            '/Library/Frameworks/R.framework/Versions/3.6/Resources/lib/libR.dylib':
                '@executable_path/../Frameworks/R.framework/Versions/3.6/Resources/lib/libR.dylib',
            '/Library/Frameworks/R.framework/Versions/3.6/Resources/lib/libRlapack.dylib':
                '@executable_path/../Frameworks/R.framework/Versions/3.6/Resources/lib/libRlapack.dylib',
            '/Library/Frameworks/R.framework/Versions/3.6/Resources/lib/libRblas.dylib':
                '@executable_path/../Frameworks/R.framework/Versions/3.6/Resources/lib/libRblas.dylib',
            '/usr/local/lib/libgfortran.3.dylib':
                '@executable_path/../Frameworks/R.framework/Versions/3.6/Resources/lib/libgfortran.3.dylib',
            '/Library/Frameworks/R.framework/Versions/3.6/Resources/lib/libgfortran.3.dylib':
                '@executable_path/../Frameworks/R.framework/Versions/3.6/Resources/lib/libgfortran.3.dylib',
            '/usr/local/lib/libquadmath.0.dylib':
                '@executable_path/../Frameworks/R.framework/Versions/3.6/Resources/lib/libquadmath.0.dylib',
            '/Library/Frameworks/R.framework/Versions/3.6/Resources/lib/libquadmath.0.dylib':
                '@executable_path/../Frameworks/R.framework/Versions/3.6/Resources/lib/libquadmath.0.dylib',
            '/Library/Frameworks/R.framework/Versions/3.6/Resources/lib/libomp.dylib':
                '@executable_path/../Frameworks/R.framework/Versions/3.6/Resources/lib/libomp.dylib',
            '/Library/Frameworks/R.framework/Versions/3.6/Resources/lib/libc++.1.dylib':
                '@executable_path/../Frameworks/R.framework/Versions/3.6/Resources/lib/libc++.1.dylib',
            '/Library/Frameworks/R.framework/Versions/3.6/Resources/lib/libc++abi.1.dylib':
                '@executable_path/../Frameworks/R.framework/Versions/3.6/Resources/lib/libc++abi.1.dylib',
        }

        for (let pkg of installed) {
            let so1 = pkg + '.so';
            let so2 = pkg.replace(/\./g, '') + '.so';
            let pkgPath;
            let pkgPath1 = path.join(buildDir, pkg, 'libs', so1);
            let pkgPath2 = path.join(buildDir, pkg, 'libs', so2);
            if (fs.existsSync(pkgPath1))
                pkgPath = pkgPath1;
            else if (fs.existsSync(pkgPath2))
                pkgPath = pkgPath2;

            if (pkgPath) {

                log.debug('patching ' + pkgPath);

                for (let sub in subs) {
                    cmd = util.format('/usr/bin/install_name_tool -change %s %s "%s"', sub, subs[sub], pkgPath);
                    sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
                }

                let dSymPath = pkgPath + '.dSYM';
                if (fs.existsSync(dSymPath))
                    fs.removeSync(dSymPath);
            }

        }

        log.debug('paths fixed')
    }

    let SHLIB_EXT = '.so';
    if (process.platform === 'win32')
        SHLIB_EXT = '.dll';
    let dllPath = path.join(srcDir, 'src', packageInfo.name + SHLIB_EXT);

    if ( ! fs.existsSync(path.join(srcDir, 'src'))) {
        log.debug('no src directory found - no compilation');
    }
    else if (fs.existsSync(dllPath)) {
        log.debug('src directory found, but binary already built');
    }
    else {
        log.debug('src directory found - compilation will begin!');
        log.debug('building binaries');

        let srcs = [ ];
        for (let child of fs.readdirSync(path.join(srcDir, 'src'))) {
            if (child.match(/.+\.([cfmM]|cc|cpp|f90|f95|mm)$/g))
                srcs.push(child);
        }

        let srcPaths = srcs.map(src => '"' + path.join(srcDir, 'src', src) + '"').join(' ');
        let incPaths = linkingTo.map(pkg => '-I"' + path.join(buildDir, pkg, 'include') + '"').join(' ');
        incPaths += ' ' + linkingTo.map(pkg => '-I"' + path.join(paths.rHome, 'library', pkg, 'include') + '"').join(' ');

        log.debug('setting CLINK_CPPFLAGS=' + incPaths);
        env['CLINK_CPPFLAGS'] = incPaths;

        cmd = util.format('"%s" CMD SHLIB -o "%s" %s', paths.rExe, dllPath, srcPaths);

        log.debug('running command:\n' + cmd);
        sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
        log.debug('build complete');
    }

    log.debug('creating temp dir');
    fs.emptydirSync(tempPath);
    log.debug('created');

    log.debug('copying src to temp');
    for (let child of fs.readdirSync(srcDir)) {
        if (child.startsWith('.'))
            continue;
        if (child === 'temp')
            continue;
        if (child === 'build')
            continue;
        if (child.startsWith('build-'))
            continue;
        if (child === '.git')
            continue;
        if (child.endsWith('.jmo'))
            continue;
        let src = path.join(srcDir, child);
        let dest = path.join(tempPath, child);
        log.debug('copying ' + child);
        fs.copySync(src, dest);
        log.debug('copied');
    }
    log.debug('all files copied to temp')

    let toAppend = ''
    for (let analysis of packageInfo.analyses)
        toAppend += util.format('\nexport(%sClass)\nexport(%sOptions)\n', analysis.name, analysis.name)

    let tempNAMESPACE = path.join(tempPath, 'NAMESPACE');
    log.debug('appending to NAMESPACE');
    fs.appendFileSync(tempNAMESPACE, toAppend);
    log.debug('appended');

    try {
        if (process.platform === 'darwin')
            cmd = util.format('"%s" "--library=%s" --no-help --no-demo --no-html "%s"', path.join(paths.rHome, 'bin', 'INSTALL'), buildDir, tempPath);
        else if (paths.rHome)
            cmd = util.format('"%s" CMD INSTALL "--library=%s" --no-help --no-demo --no-html "%s"', paths.rExe, buildDir, tempPath);
        else
            cmd = util.format('R CMD INSTALL "--library=%s" --no-help --no-demo --no-html "%s"', buildDir, tempPath);
        log.debug('executing ' + cmd);
        sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
        log.debug('executed');
    }
    catch(e) {
        throw 'Could not build module';
    }

    log.debug('copying to R dir');
    fs.copySync(buildDir, rDir);
    log.debug('copied');

    log.debug('deleting temp');
    fs.removeSync(tempPath);
    log.debug('deleted');
}

module.exports = compile
