
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const child_process = require('child_process');

const isJExe = function(exe) {
    return fs.existsSync(exe) && fs.statSync(exe).isFile();
};

const find = function(jamovi_home) {

    let exe;

    if (jamovi_home !== undefined) {
        jamovi_home = path.resolve(jamovi_home);
        exe = path.join(jamovi_home, 'jamovi');
        if (isJExe(exe))
            return exe;
        exe = path.join(jamovi_home, 'jamovi.exe');
        if (isJExe(exe))
            return exe;
        exe = path.join(jamovi_home, 'bin', 'jamovi');
        if (isJExe(exe))
            return exe;
        exe = path.join(jamovi_home, 'bin', 'jamovi.exe');
        if (isJExe(exe))
            return exe;
        exe = path.join(jamovi_home, 'Contents', 'MacOS', 'jamovi')
        if (isJExe(exe))
            return exe;
        exe = path.join(jamovi_home + '.app', 'Contents', 'MacOS', 'jamovi')
        if (isJExe(exe))
            return exe;
        throw 'jamovi could not be found at: ' + jamovi_home;
    }

    if (process.platform === 'darwin') {
        exe = '/Applications/jamovi.app/Contents/MacOS/jamovi';
        if (isJExe(exe))
            return exe;
    }

    if (process.platform === 'win32') {

    }

    if (process.platform === 'linux') {
        exe = '/usr/lib/jamovi/bin/jamovi';
        if (isJExe(exe))
            return exe;
        exe = '/usr/bin/jamovi';
        if (isJExe(exe))
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

    if (response.stdout === null) {
        throw 'jamovi did not respond';
    }
    else {
        let match = response.stdout.match('^\r?\n?([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)\r?\n');

        let mas = parseInt(match[1]);
        let maj = parseInt(match[2]);
        let min = parseInt(match[3]);
        let rev = parseInt(match[4])

        if (mas < 0 || maj < 9 || (maj === 9 && min < 1))
            throw 'a newer version of jamovi is required, please update to the newest version';
        if (mas > 0 || maj > 9 || (maj === 9 && min > 2))
            throw 'a newer version of the jamovi-compiler (or jmvtools) is required';

        if (match) {
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
            console.log(response.stdout + '\n')
            throw 'jamovi could not be accessed';
        }
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
    }
};

module.exports = { find, check, install };
