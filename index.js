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

const ARGS = [
    { name: 'build',   alias: 'b', type: String },
    { name: 'prepare', alias: 'p', type: String },
    { name: 'install', alias: 'i', type: String },
    { name: 'check',   alias: 'c', type: Boolean },
    { name: 'home', type: String },
    { name: 'to',   type: String },
];

const temp = require('temp');
temp.track();

const compiler = require('./compiler');
const uicompiler = require('./uicompiler');
const compileR = require('./compilerr');
const parseR = require('./parser');
const utils = require('./utils');
const installer = require('./installer');

let usage = 'Usage:\n';
usage += '    jmc --build path\n';
usage += '    jmc --prepare path\n';
usage += '    jmc --install path [--home path]\n';
usage += '    jmc --check        [--home path]\n';

let isBuilding = true;
let isInstalling = false;
let isInstallingTo = false;

const args = CLA(ARGS);

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
else {
    console.log(usage);
    process.exit(1);
}

srcDir = path.resolve(srcDir);

if ( ! utils.exists(srcDir)) {
    console.log("path '%s' does not exist\n".replace('%s', srcDir));
    process.exit(1);
}

if (isInstallingTo) {
    installDir = path.resolve(installDir);
    if ( ! utils.exists(installDir)) {
        console.log("path '%s' does not exist\n".replace('%s', installDir));
        process.exit(1);
    }
}

let packageInfo;

try {
    packageInfo = parseR(srcDir);
}
catch (e) {
    console.log(e);
    console.log();
    process.exit(1);
}

let defDir = path.join(srcDir, 'jamovi');
let rDir = path.join(srcDir, 'R');
let uiDir = path.join(srcDir, 'jamovi/ui');

if ( ! utils.exists(defDir))
    fs.mkdirSync(defDir);

if ( ! utils.exists(rDir))
    fs.mkdirSync(rDir);

if ( ! utils.exists(uiDir))
    fs.mkdirSync(uiDir);

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
        let hOutPath = path.join(rDir, basename + '.h.R');
        let bOutPath = path.join(rDir, basename + '.b.R');
        let sOutPath = path.join(uiDir, basename + '.src.js');
        let oOutPath = path.join(uiDir, basename + '.options.js');

        let hTemplPath = path.join(__dirname, 'header.template');
        let bTemplPath = path.join(__dirname, 'body.template');
        let oTemplPath = path.join(__dirname, 'options.template');
        let sTemplPath = path.join(__dirname, 'src.template');

        compiler(packageInfo.name, analysisPath, resultsPath, hTemplPath, hOutPath);
        console.log('wrote: ' + path.basename(hOutPath));

        if ( ! utils.exists(bOutPath)) {
            compiler(packageInfo.name, analysisPath, resultsPath, bTemplPath, bOutPath);
            console.log('wrote: ' + path.basename(bOutPath));
        }

        compiler(packageInfo.name, analysisPath, resultsPath, oTemplPath, oOutPath);
        console.log('wrote: ' + path.basename(oOutPath));

        if ( ! utils.exists(sOutPath)) {
            uicompiler(analysisPath, sTemplPath, sOutPath);
            console.log('wrote: ' + path.basename(sOutPath));
        }

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
            menuGroup:    ('menuGroup' in analysis ? analysis.menuGroup : packageInfo.name),
            menuSubgroup: ('menuSubgroup' in analysis ? analysis.menuSubgroup : null),
            menuTitle:    ('menuTitle' in analysis ? analysis.menuTitle : title),
            menuSubtitle: ('menuSubTitle' in analysis ? analysis.menuSubtitle : null),
            description: ('description' in analysis ? analysis.description : null),
        };

        packageInfo.analyses.push(aObj);
    }
}

Promise.all(waits).then(() => {  // wait for all the browserifies to finish

    if (isBuilding || isInstallingTo) {

        let indexPath = path.join(defDir, '0000.yaml');
        let content;
        if (utils.exists(indexPath))
            content = fs.readFileSync(indexPath);
        else
            content = yaml.safeDump(packageInfo);
        fs.writeFileSync(path.join(modDir, 'jamovi.yaml'), content);

        compileR(srcDir, modDir);

        if (isBuilding) {

            let zipPath = packageInfo.name + '.jmo';
            let zip = new JSZip();
            let paths = walkSync(modDir, { directories: false });

            for (let relPath of paths) {
                let archivePath = path.join(packageInfo.name, relPath);
                let fullPath = path.join(modDir, relPath);
                let contents = fs.readFileSync(fullPath);
                zip.file(archivePath, contents);
            }

            return new Promise((resolve, reject) => {
                zip.generateAsync({ type: 'nodebuffer' }).then(content => {
                    fs.writeFileSync(zipPath, content);
                    console.log('wrote module: ' + path.basename(zipPath) + '\n');
                    resolve(zipPath);
                }, err => console.log(err))
            });
        }
    }

}).then(path => {

    if (isInstalling)
        installer.install(path, args.home);

}).catch(e => console.log(e));
