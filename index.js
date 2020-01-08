#!/usr/bin/env node

'use strict';

console.log('\njamovi compiler\n');

const path = require('path');
const fs = require('fs-extra');
const browserify = require('browserify');
const yaml = require('js-yaml');
const JSZip = require('jszip');
const walkSync = require('walk-sync');
const CLA = require('command-line-args');
const needle = require('needle');
const Log = require('log');
const _ = require('underscore');
const child_process = require('child_process');

const ARGS = [
    { name: 'build',   alias: 'b', type: String },
    { name: 'prepare', alias: 'p', type: String },
    { name: 'install', alias: 'i', type: String },
    { name: 'submit', type: String },
    { name: 'check',   alias: 'c', type: Boolean },
    { name: 'home',  type: String },
    { name: 'rhome', type: String },
    { name: 'to',    type: String },
    { name: 'rpath', type: String },
    { name: 'debug', type: Boolean },
    { name: 'jmo',   type: String },
    { name: 'mirror', type: String },
];

const temp = require('temp');
temp.track();

const compiler = require('./compiler');
const uicompiler = require('./uicompiler');
const compileR = require('./compilerr');
const parseR = require('./parser');
const utils = require('./utils');
const installer = require('./installer');
const sourcify = require('./sourcify');

try {

    let usage = 'Usage:\n';
    usage += '    jmc --build path\n';
    usage += '    jmc --prepare path\n';
    usage += '    jmc --install path [--home path]\n';
    usage += '    jmc --submit path\n';
    usage += '    jmc --check        [--home path]\n';

    let isBuilding = true;
    let isInstalling = false;
    let isInstallingTo = false;
    let isSubmitting = false;

    const args = CLA(ARGS);

    let log;
    if (args.debug)
        log = new Log('debug');
    else
        log = new Log('notice');

    let srcDir;
    let installDir;

    if (args.check) {
        installer.check(args.home);
        process.exit(0);
    }
    else if (args.install) {

        srcDir = args.install;

        if ( ! args.to) {
            isBuilding = true;
            isInstalling = true;
            isInstallingTo = false;
        }
        else {
            installDir = args.to;
            isBuilding = false;
            isInstalling = false;
            isInstallingTo = true;
        }
    }
    else if (args.build) {
        isBuilding = true;
        isInstallingTo = false;
        srcDir = args.build;
    }
    else if (args.prepare) {
        isBuilding = false;
        isInstallingTo = false;
        srcDir = args.prepare;
    }
    else if (args.submit) {
        isBuilding = true;
        isSubmitting = true;
        srcDir = args.submit;
    }
    else {
        console.log(usage);
        process.exit(0);
    }

    let mirror = args.mirror || 'https://cran.microsoft.com/snapshot/2020-01-01';

    installer.check(args.home);

    let paths;
    let platName;

    if (process.platform === 'win32') {
        let exe = installer.find(args.home);
        let bin  = path.dirname(exe);
        let home = path.dirname(bin);
        let rHome = path.join(home, 'Frameworks', 'R');
        let rExe  = path.join(rHome, 'bin', 'x64', 'R.exe');
        let rLibs = path.join(home, 'Resources', 'modules', 'base', 'R');
        paths = { home, rHome, rExe, rLibs };
        platName = 'win64';
    }
    else if (process.platform === 'darwin') {
        let exe = installer.find(args.home);
        let bin  = path.dirname(exe);
        let home = path.dirname(bin);
        let rHome = path.join(home, 'Frameworks', 'R.framework', 'Versions', '3.6', 'Resources');
        let rExe  = path.join(bin, 'R');
        let rLibs = path.join(home, 'Resources', 'modules', 'base', 'R');
        paths = { home, rHome, rExe, rLibs };
        platName = 'macos';
    }
    else if (args.home === 'flatpak') {
        let home = 'flatpak';
        let rHome = '/app/lib/R';
        let rLibs = rHome + 'library';
        let rExe = 'flatpak" run --devel org.jamovi.jamovi "-R';
        paths = { home, rHome, rExe, rLibs };
        platName = 'linux';
    }
    else {
        let exe = installer.find(args.home);
        let bin  = path.dirname(exe);
        let home = path.dirname(bin);
        let rHome;
        if (args.rhome)
            rHome = args.rhome;
        else
            rHome = path.join(home, 'lib/R');
        let rExe = path.join(rHome, 'bin', 'R');
        let rLibs = path.join(home, 'Resources', 'modules', 'base', 'R');
        paths = { home, rHome, rExe, rLibs };
        platName = 'linux';
    }

    let env = Object.assign({}, process.env);
    env['R_HOME'] = paths.rHome;

    let rVersionOutput;
    if (process.platform === 'win32') {
        // on windows, R outputs version, etc. stuff to stderr, which execSync doesn't catch
        // so we have to use spawnSync instead
        rVersionOutput = child_process.spawnSync(paths.rExe, ['--version'], { encoding: 'UTF-8', env: env }).output;
    }
    else {
        // on linux, we use 'flatpak org.jamovi.jamovi ....' as the cmd, which is why
        // i'm using execSync, rather than spawnSync
        let cmd = '"' + paths.rExe + '" --version'
        rVersionOutput = child_process.execSync(cmd, { encoding: 'UTF-8', env: env });
    }

    let rVersion = /R version ([0-9]+\.[0-9]+\.[0-9]+)/g.exec(rVersionOutput);

    if (rVersion === null && process.platform === 'win32') {
        rVersion = [ undefined, '3.4.1' ];
    }

    if (rVersion === null)
        throw 'unable to determine R version';
    rVersion = rVersion[1];


    srcDir = path.resolve(srcDir);

    if ( ! utils.exists(srcDir))
        throw "path '%s' does not exist\n".replace('%s', srcDir);

    if (isInstallingTo) {
        installDir = path.resolve(installDir);
        if ( ! utils.exists(installDir))
            throw "path '%s' does not exist\n".replace('%s', installDir);
    }

    let defDir = path.join(srcDir, 'jamovi');
    let rDir = path.join(srcDir, 'R');
    let jsBuildDir = path.join(srcDir, 'build', 'js');
    let jsSrcDir = path.join(defDir, 'js');
    let packageInfoPath = path.join(defDir, '0000.yaml');
    let refsPath = path.join(defDir, '00refs.yaml');

    let packageInfo;

    if (utils.exists(packageInfoPath)) {
        let content = fs.readFileSync(packageInfoPath);
        packageInfo = yaml.safeLoad(content);
        if ('jms' in packageInfo) {
            if (packageInfo.jms !== '1.0')
                throw 'this module requires a newer jmc';
        }
        else {
            packageInfo.jms = '1.0';
        }
    }
    else {
        packageInfo = parseR(srcDir);
    }

    if ( ! ('usesNative' in packageInfo))
        packageInfo.usesNative = true;

    if ( ! ('minApp' in packageInfo))
        packageInfo.minApp = '1.0.8';

    let refs = undefined;
    if (utils.exists(refsPath)) {
        let content = fs.readFileSync(refsPath);
        refs = yaml.safeLoad(content).refs;
    }

    if ( ! utils.exists(defDir))
        fs.mkdirSync(defDir);

    if ( ! utils.exists(rDir))
        fs.mkdirSync(rDir);

    if (utils.exists(jsSrcDir)) {
        fs.removeSync(jsBuildDir);
        fs.copySync(jsSrcDir, jsBuildDir);
    }
    else {
        fs.emptyDirSync(jsBuildDir);
    }

    let files = fs.readdirSync(defDir);


    let modDir;
    let uiOutDir;
    let yamlOutDir;

    if (isBuilding) {
        modDir = temp.mkdirSync(packageInfo.name);
    }
    else if (isInstallingTo) {
        modDir = path.join(installDir, packageInfo.name);
        fs.emptyDirSync(modDir);
    }

    if (isBuilding || isInstallingTo) {
        uiOutDir = path.join(modDir, 'ui');
        if ( ! utils.exists(uiOutDir))
            fs.mkdirSync(uiOutDir);
        yamlOutDir = path.join(modDir, 'analyses');
        if ( ! utils.exists(yamlOutDir))
            fs.mkdirSync(yamlOutDir);
    }

    let waits = [ ]

    for (let file of files) {

        if (file.endsWith('.a.yaml')) {
            let analysisPath = path.join(defDir, file);
            let basename = path.basename(analysisPath, '.a.yaml');
            let resultsPath = path.join(defDir, basename + '.r.yaml');
            let uiPath = path.join(defDir, basename + '.u.yaml');
            let jsPath = path.join(jsSrcDir, basename + '.js');
            let hOutPath = path.join(rDir, basename + '.h.R');
            let bOutPath = path.join(rDir, basename + '.b.R');
            let sOutPath = path.join(jsBuildDir, basename + '.src.js');

            let hTemplPath = path.join(__dirname, 'header.template');
            let bTemplPath = path.join(__dirname, 'body.template');
            let sTemplPath = path.join(__dirname, 'src.template');

            compiler(packageInfo.name, analysisPath, resultsPath, hTemplPath, hOutPath, refs);
            console.log('wrote: ' + path.basename(hOutPath));

            if ( ! utils.exists(bOutPath)) {
                compiler(packageInfo.name, analysisPath, resultsPath, bTemplPath, bOutPath, refs);
                console.log('wrote: ' + path.basename(bOutPath));
            }

            uicompiler(analysisPath, uiPath, jsPath, basename, sTemplPath, sOutPath);


            if (isBuilding || isInstallingTo) {

                let uOutPath = path.join(uiOutDir, basename + '.js');

                waits.push(Promise.resolve().then(() => {
                    let stream = fs.createWriteStream(uOutPath);
                    return new Promise((resolve) => {
                        browserify(sOutPath, { standalone: 'module' })
                            .bundle().pipe(stream);
                        stream.on('close', resolve);
                    });
                }));

                let content = fs.readFileSync(analysisPath);
                fs.writeFileSync(path.join(yamlOutDir, basename + '.a.yaml'), content);

                if (utils.exists(resultsPath)) {
                    content = fs.readFileSync(resultsPath);
                    fs.writeFileSync(path.join(yamlOutDir, basename + '.r.yaml'), content);
                }

                console.log('wrote: ' + path.basename(uOutPath));
            }

            let content = fs.readFileSync(analysisPath, 'utf-8');
            let analysis = yaml.safeLoad(content);
            let title = ('title' in analysis ? analysis.title : analyis.name);
            let aObj = {
                title: title,
                name: analysis.name,
                ns: packageInfo.name,
            };

            if ('menuGroup' in analysis)
                aObj.menuGroup = analysis.menuGroup;
            else
                aObj.menuGroup = packageInfo.name;

            if ('menuSubgroup' in analysis)
                aObj.menuSubgroup = analysis.menuSubgroup;

            if ('menuTitle' in analysis)
                aObj.menuTitle = analysis.menuTitle;
            else
                aObj.menuTitle = title;

            if ('menuSubtitle' in analysis)
                aObj.menuSubtitle = analysis.menuSubtitle;
            if (analysis.description) {
                if (typeof analysis.description === 'string')
                    aObj.description = analysis.description.split('\n\n')[0];
                else if (typeof analysis.description.main === 'string')
                    aObj.description = analysis.description.main.split('\n\n')[0];
            }
            if (analysis.hidden === true)
                aObj.hidden = analysis.hidden;

            let found = false;
            for (let existing of packageInfo.analyses) {
                if (existing.name === analysis.name) {
                    Object.assign(existing, aObj);
                    found = true;
                    break;
                }
            }
            if (found === false)
                packageInfo.analyses.push(aObj);
        }
    }

    Promise.all(waits).then(() => {  // wait for all the browserifies to finish

        console.log('writing module meta');

        let pOutPath = path.join(rDir, '00jmv.R');

        if (refs) {
            let pOutPath = path.join(rDir, '00jmv.R');
            let pTemplPath = path.join(__dirname, 'pkg.template');

            let template = fs.readFileSync(pTemplPath, 'utf-8');
            let compiler = _.template(template);

            let object = { refs: refs, imports: { sourcify } };
            let content = compiler(object);

            fs.writeFileSync(pOutPath, content);
            console.log('wrote: 00jmv.R');
        }
        else if (fs.existsSync(pOutPath)) {
            fs.unlinkSync(pOutPath);
        }

        if (packageInfo.datasets) {
            for (let dataset of packageInfo.datasets) {
                let from = path.join(srcDir, 'data', dataset.path);
                let to = path.join(modDir, 'data', dataset.path);
                fs.copySync(from, to);
                console.log('copied', dataset.path);
            }
        }

        let indexPath = path.join(defDir, '0000.yaml');

        if (packageInfo.date instanceof Date)
            packageInfo.date = packageInfo.date.toISOString().slice(0,10)

        let content = '---\n' + yaml.safeDump(packageInfo) + '\n...\n';
        fs.writeFileSync(indexPath, content);
        console.log('wrote: 0000.yaml');

        if (isBuilding || isInstallingTo) {

            packageInfo.rVersion = rVersion;
            content = '---\n' + yaml.safeDump(packageInfo) + '\n...\n';

            fs.writeFileSync(path.join(modDir, 'jamovi.yaml'), content);
            console.log('wrote: jamovi.yaml');

            try {
                content = fs.readFileSync(refsPath);
                fs.writeFileSync(path.join(modDir, 'refs.yaml'), content);
            }
            catch (e) {
                // do nothing
            }

            compileR(srcDir, modDir, paths, packageInfo, log, { mirror });

            if (isBuilding) {

                let zipPath;
                if (args.jmo)
                    zipPath = args.jmo
                else
                    zipPath = `${ packageInfo.name }_${ packageInfo.version }-${ platName }-R${ packageInfo.rVersion }.jmo`;

                let zip = new JSZip();
                let paths = walkSync(modDir, { directories: false });

                for (let relPath of paths) {
                    relPath = relPath.replace(/\\/g, '/');
                    if (relPath.startsWith('R/BH'))
                        continue;
                    let archivePath = packageInfo.name + '/' + relPath;
                    let fullPath = path.join(modDir, relPath);
                    let contents = fs.readFileSync(fullPath);
                    zip.file(archivePath, contents);
                }

                return new Promise((resolve, reject) => {
                    zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }).then(content => {
                        fs.writeFileSync(zipPath, content);
                        console.log('wrote module: ' + path.basename(zipPath) + '\n');
                        resolve(zipPath);
                    }, err => fs.writeSync(2, err))
                });
            }
        }

    }).then(path => {

        if (isInstalling)
            installer.install(path, args.home);

        if (isSubmitting) {
            return new Promise((resolve, reject) => {
                let path = packageInfo.name + '.jmo';
                console.log('Submitting: ' + path);
                let data = { module: { file: path, content_type: 'application/zip' } };
                needle.post('https://store.jamovi.org/submit/', data, { multipart: true, open_timeout: 0 }, (err, resp, body) => {
                    if (err)
                        reject('Unable to submit module:\n    ' + err.message);
                    else {
                        console.log("Module '" + packageInfo.name + "' succesfully submitted");
                        resolve();
                    }
                });
            });
        }

    }).catch(e => {
        fs.writeSync(2, '\n');
        fs.writeSync(2, e);
        fs.writeSync(2, '\n\n');
        process.exit(1);
    });

}
catch (e) {
    fs.writeSync(2, '\n');
    if (typeof(e) === 'string') {
        fs.writeSync(2, e);
    }
    else if ('message' in e) {
        fs.writeSync(2, e.stack)
        fs.writeSync(2, '\n\n');
        fs.writeSync(2, e.message);
    }
    else {
        fs.writeSync(2, e);
    }
    fs.writeSync(2, '\n\n');
    process.exit(1);
}
