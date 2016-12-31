
'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('underscore');
const semver = require('semver');

const reject = function(filePath, message) {
    throw path.basename(filePath) + ' ' + message;
}

const compile = function(packageName, analysisPath, resultsPath, templPath, outPath) {

    let content;
    content = fs.readFileSync(analysisPath, 'utf-8');
    let analysis = yaml.safeLoad(content);

    let results;
    try {
        content = fs.readFileSync(resultsPath, 'utf-8');
        results = yaml.safeLoad(content);
    }
    catch (e) {
        results = {
            'name' : analysis.name,
            'title': analysis.title,
        }
    }

    if (typeof analysis.name === 'undefined')
        reject(analysisPath, 'does not contain an analysis name');
    if (typeof analysis.title === 'undefined')
        reject(analysisPath, 'does not contain an analysis title');
    if (typeof analysis.version === 'undefined' || ! semver.valid(analysis.version))
        reject(analysisPath, 'does not contain a valid version');

    if ('jas' in analysis) {
        if (typeof analysis.jas !== 'string')
            reject(analysisPath, 'does not contain a valid jamovi analysis spec (jas)');
        let jas = analysis.jas.match(/^([0-9]+)\.([0-9]+)$/)
        if (jas === null)
            reject(analysisPath, 'does not contain a valid jamovi analysis spec (jas)');
        if (jas[1] !== '1' || jas[2] !== '0')
            reject(analysisPath, 'requires a newer jamovi-compiler');
    }

    let template = fs.readFileSync(templPath, 'utf-8');
    let compiler = _.template(template);

    let imports = { sourcifyOption, optionify, sourcifyResults, resultsify };
    let object = { packageName, analysis, results, imports };
    content = compiler(object);

    fs.writeFileSync(outPath, content);
};

const sourcifyOption = function(object, optionName, optionValue, indent) {

    if (indent === undefined)
        indent = '            ';

    let str = '';
    if (object === null) {
        str = 'NULL';
    }
    else if (object === true || object === false) {
        str = (object ? 'TRUE' : 'FALSE');
    }
    else if (typeof(object) === 'number') {
        str = '' + object;
    }
    else if (typeof(object) === 'string') {
        str = '"' + object + '"';
    }
    else if (_.isArray(object)) {
        str = 'list('
        let sep = '\n' + indent + '    ';
        for (let value of object) {
            str += sep + sourcifyOption(value, optionName, optionValue, indent + '    ');
            sep = ',\n' + indent + '    ';
        }
        str += ')';
    }
    else if (_.isObject(object)) {
        if (object.type) {
            str = optionify(object, optionName, optionValue, indent + '    ')
        }
        else {
            str = 'list(';
            let sep = '';
            for (let prop in object) {
                let value = object[prop];
                str += sep + prop + '=' + sourcifyOption(value, optionName, optionValue, indent);
                sep = ', '
            }
            str += ')';
        }
    }
    return str;
}

const optionify = function(option, optionName, optionValue, indent) {

    if (option.name)
        optionName = option.name;
    if (typeof optionValue === 'undefined')
        optionValue = option.name;
    if (typeof indent === 'undefined')
        indent = '                ';

    let str = 'jmvcore::Option' + option.type + '$new(\n' + indent + '"' + optionName + '",\n' + indent + optionValue

    for (let prop in option) {
        if (prop === 'type' ||
            prop === 'name' ||
            prop === 'title' ||
            prop === 'description')
                continue;

        str += ',\n' + indent + prop + '=' + sourcifyOption(option[prop], optionName, 'NULL', indent);
    }

    str += ')'

    return str;
}

const sourcifyResults = function(object, indent) {

    if (typeof indent === 'undefined')
        indent = '                ';

    let str = '';
    if (object === null) {
        str = 'NULL';
    }
    else if (object === true || object === false) {
        str = (object ? 'TRUE' : 'FALSE');
    }
    else if (typeof(object) === 'number') {
        str = '' + object;
    }
    else if (typeof(object) === 'string') {
        str = '"' + object + '"';
    }
    else if (_.isArray(object)) {
        str = 'list('
        let sep = '\n' + indent + '        ';
        for (let value of object) {
            str += sep + sourcifyResults(value, indent + '    ');
            sep = ',\n' + indent + '        ';
        }
        str += ')';
    }
    else if (_.isObject(object)) {
        if (object.type && (object.type === 'Table' || object.type === 'Image' || object.type === 'Array' || object.type === 'Group' || object.type === 'Preformatted')) {
            str = resultsify(object, indent + '    ')
        }
        else {
            str = 'list(';
            let sep = '';
            for (let prop in object) {
                let value = object[prop];
                str += sep + '`' + prop + '`' + '=' + sourcifyResults(value, indent + '    ');
                sep = ', '
            }
            str += ')';
        }
    }
    return str;
}

const resultsify = function(item, indent, root) {

    if (typeof indent === 'undefined')
        indent = '';

    let str = '';

    if (root || item.type === 'Group') {

        let title = item.title;
        if (title === undefined)
            title = 'no title';

        let name = item.name;
        if (root)
            name = ''

        let items = item.items;
        if (items === undefined)
            items = [ ];

        str += 'R6::R6Class(';
        str += '\n    ' + indent + 'inherit = jmvcore::Group,';

        str += '\n    ' + indent + 'active = list(';

        let sep = '';
        for (let child of items) {
            str += sep + '\n        ' + indent + child.name + ' = function() private$..' + child.name
            sep = ',';
        }
        str += '),'


        str += '\n    ' + indent + 'private = list(';

        sep = '';
        for (let child of items) {
            str += sep + '\n    ' + indent + '    ..' + child.name + ' = NA'
            sep = ',';
        }
        str += '),'

        str += '\n    ' + indent + 'public=list(';
        str += '\n    ' + indent + '    initialize=function(options) {';
        str += '\n    ' + indent + '        super$initialize(options=options, name="' + name + '", title="' + title + '")';

        for (let child of items)
            str += '\n    ' + indent + '        private$..' + child.name + ' <- ' + sourcifyResults(child, indent + '        ');

        for (let child of items)
            str += '\n    ' + indent + '        self$add(private$..' + child.name + ')';

        str += '}'
        str += ')'
        str += ')';

        if ( ! root)
            str += '$new(options=options)';
    }
    else if (item.type) {

        str = 'jmvcore::' + item.type + '$new(';
        str += '\n' + indent + '    options=options';

        for (let prop in item) {
            if (prop === 'type' ||
                prop === 'description')
                    continue;

            str += ',\n    ' + indent + prop + '=' + sourcifyResults(item[prop], indent + '');
        }

        str += ')';
    }

    return str;
}

module.exports = compile;
