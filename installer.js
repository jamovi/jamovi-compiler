
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const sh = require('child_process').execSync;

module.exports = function(pth) {

    console.log('Installing ' + pth);

    let exePath;

    if ('JAMOVI_HOME' in process.env) {
        let home = process.env.JAMOVI_HOME
        exePath = path.join(home, 'bin', 'jamovi')
    }
    else if (process.platform === 'darwin')
        exePath = '/Applications/jamovi.app/Contents/MacOS/jamovi';
    else
        exePath = 'jamovi';

    let cmd = util.format('"%s" --install "%s"', exePath, pth);
    try {
        sh(cmd, { stdio: 'inherit', encoding: 'utf-8' });
        console.log('Module installed successfully');
    }
    catch (e) {
        console.log(e)
        throw 'Could not install module';
        //throw e;
    }
};
