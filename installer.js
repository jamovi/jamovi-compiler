
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const child_process = require('child_process');

const find = function(jamovi_home) {

    let exe;

    if (jamovi_home !== undefined) {
        jamovi_home = path.resolve(jamovi_home);
        exe = path.join(jamovi_home, 'jamovi');
        if (fs.existsSync(exe))
            return exe;
        exe = path.join(jamovi_home, 'bin', 'jamovi');
        if (fs.existsSync(exe))
            return exe;
        exe = path.join(jamovi_home, 'Contents', 'MacOS', 'jamovi')
        if (fs.existsSync(exe))
            return exe;
        exe = path.join(jamovi_home + '.app', 'Contents', 'MacOS', 'jamovi')
        if (fs.existsSync(exe))
            return exe;
        throw 'jamovi could not be found at: ' + jamovi_home;
    }

    if (process.platform === 'darwin') {
        exe = '/Applications/jamovi.app/Contents/MacOS/jamovi';
        if (fs.existsSync(exe))
            return exe;
    }

    if (process.platform === 'win32') {

    }

    if (process.platform === 'linux') {
        exe = '/usr/lib/jamovi/bin/jamovi';
        if (fs.existsSync(exe))
            return exe;
        exe = '/usr/bin/jamovi';
        if (fs.existsSync(exe))
            return exe;
    }

    throw 'jamovi could not be found!';
};

const check = function(jamovi_home) {
    let exe = find(jamovi_home);
    let response = child_process.spawnSync(
        exe,
        [ '--version' ],
        {
            stdio: [ 'ignore', 'pipe', 'inherit' ],
            encoding: 'utf-8'
        });
    if (response.stdout !== null && response.stdout.match('^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\n')) {
        if (process.platform === 'darwin') {
            let m = exe.match(/^(.+)\/Contents\/MacOS\/jamovi$/);
            if (m)
                console.log('jamovi found at ' + m[1]);
            else
                console.log('jamovi found at ' + exe);
        }
        else {
            console.log('jamovi found at ' + exe);
        }
    }
    else {
        throw 'jamovi could not be accessed';
    }
};

const install = function(pth, jamovi_home) {
    let exe = find(jamovi_home);

    console.log('Installing ' + pth);

    let cmd = util.format('"%s" --install "%s"', exe, pth);
    try {
        child_process.execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
        console.log('Module installed successfully');
    }
    catch (e) {
        console.log(e)
        throw 'Could not install module';
        //throw e;
    }
};

module.exports = { find, check, install };