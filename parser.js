
'use strict';

const path = require('path');
const fs = require('fs');

const utils = require('./utils');

const parse = function(srcDir) {
    let descPath = path.join(srcDir, 'DESCRIPTION');

    if ( ! utils.exists(descPath)) {
        console.log('a DESCRIPTION file could not be found\n\nIs the path specified an R/jamovi package?\n');
        process.exit(1);
    }

    let descContent = fs.readFileSync(descPath, 'utf-8');
    let packageMatch = descContent.match(/^Package: *(.+)$/m);
    if (packageMatch === null)
        throw 'DESCRIPTION file does not contain a package name';
    let packageName = packageMatch[1];

    let descMatch = descContent.match(/\nDescription: ((.|\r?\n )+)\r?\n[A-Z]/);
    if (descMatch === null)
        throw 'DESCRIPTION file does not contain a description (irony much?)';
    let description = descMatch[1]
    description = description.replace(/\r?\n/g, '');
    description = description.replace(/  +/g, ' ');

    let entries = descContent.match(/((.|\r?\n )+)\r?\n(?! )|$/g);
    entries = entries.filter(entry => entry !== '');
    entries = entries.map(entry => entry.replace(/\r?\n/g, ''));
    entries = entries.map(entry => entry.split(':'));

    let obj = { }
    for (let entry of entries)
        obj[entry[0].trim()] = entry[1].trim();

    let authors = [ ];
    if ('Author' in obj) {
        authors = obj.Author.split(',');
        authors = authors.map(author => author.trim())
    }

    return {
        title: ('Title' in obj ? obj.Title : packageName),
        name: packageName,
        version: ('Version' in obj ? obj.Version : '0.0.0'),
        authors: authors,
        maintainer: ('Maintainer' in obj ? obj.Maintainer : '(no maintainer, sorry)'),
        date: ('Date' in obj ? obj.Date : '1970-01-01'),
        type: 'R',
        description: ('Description' in obj ? obj.Description : '(no description)'),
        jmc: '1.0.0',
        analyses: [ ],
    };
}

module.exports = parse;
