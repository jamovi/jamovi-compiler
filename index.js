#!/usr/bin/env node

'use strict';

console.log('\njamovi compiler\n');

const path = require('path');
const fs = require('fs');
const browserify = require('browserify');

const compiler = require('./compiler');

const exists = function(path) {
    try {
        fs.statSync(path);
    }
    catch (e) {
        return false;
    }
    return true;
}

let rootDir = '.';
if (process.argv.length > 2)
    rootDir = process.argv[2];
rootDir = path.resolve(rootDir);

if ( ! exists(path.join(rootDir, 'DESCRIPTION'))) {
    console.log('a DESCRIPTION file could not be found\n\nYou must be in the current directory of an R package, or provide a path to one\n');
    process.exit(1);
}

let defDir = path.join(rootDir, 'inst', 'jamovi');
let rDir = path.join(rootDir, 'R');
let uiDir = path.join(rootDir, 'ui');

if ( ! exists(rDir))
    fs.mkdirSync(rDir);

if ( ! exists(uiDir))
    fs.mkdirSync(uiDir);

let files = fs.readdirSync(defDir);

for (let file of files) {

    if (file.endsWith('.a.yaml')) {
        let analysisPath = path.join(defDir, file);
        let basename = path.basename(analysisPath, '.a.yaml');
        let resultsPath = path.join(defDir, basename + '.r.yaml');
        let hOutPath = path.join(rDir, basename + '.h.R');
        let bOutPath = path.join(rDir, basename + '.b.R');
        let oOutPath = path.join(uiDir, basename + '.options.js');
        let sOutPath = path.join(uiDir, basename + '.src.js');
        let uOutPath = path.join(defDir, basename + '.js');

        let hTemplPath = path.join(__dirname, 'header.template');
        let bTemplPath = path.join(__dirname, 'body.template');
        let oTemplPath = path.join(__dirname, 'options.template');
        let sTemplPath = path.join(__dirname, 'src.template');

        compiler(analysisPath, resultsPath, hTemplPath, hOutPath);
        console.log('wrote: ' + path.basename(hOutPath));

        if ( ! exists(bOutPath)) {
            compiler(analysisPath, resultsPath, bTemplPath, bOutPath);
            console.log('wrote: ' + path.basename(bOutPath));
        }

        compiler(analysisPath, resultsPath, oTemplPath, oOutPath);
        console.log('wrote: ' + path.basename(oOutPath));

        if ( ! exists(sOutPath)) {
            compiler(analysisPath, resultsPath, sTemplPath, sOutPath);
            console.log('wrote: ' + path.basename(sOutPath));
        }

        let stream = fs.createWriteStream(uOutPath);
        browserify(sOutPath, { standalone: 'module' }).bundle().pipe(stream);
        console.log('wrote: ' + path.basename(uOutPath));
    }
}
