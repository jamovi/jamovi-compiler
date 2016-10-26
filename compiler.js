
'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('underscore');
const semver = require('semver');

const reject = function(filePath, message) {
    throw path.basename(filePath) + ' ' + message;
}

const compile = function(analysisPath, resultsPath, templPath, outPath) {

    let content;
    content = fs.readFileSync(analysisPath, 'utf-8');
    let analysis = yaml.safeLoad(content);
    let results;
    try {
        content = fs.readFileSync(resultsPath, 'utf-8');
        results = yaml.safeLoad(content);
    }
    catch (e) {
        results = null;
    }

    if (typeof analysis.name === 'undefined')
        reject(analysisPath, 'does not contain an analysis name');
    if (typeof analysis.title === 'undefined')
        reject(analysisPath, 'does not contain an analysis title');
    if (typeof analysis.version === 'undefined' || ! semver.valid(analysis.version))
        reject(analysisPath, 'does not contain a valid version');
    if (typeof analysis.api === 'undefined')
        reject(analysisPath, 'does not specify an API version');
    if (typeof analysis.api !== 'number')
        reject(analysisPath, 'specifies a non-numeric API version');
    if (analysis.api > 1)
        reject(analysisPath, 'uses a newer API version (requires a newer jamovi-compiler)');

    let template = fs.readFileSync(templPath, 'utf-8');
    let compiler = _.template(template);

    let imports = {
        sourcify : sourcify,
        optionify : optionify
    }

    let object = { analysis : analysis, results : results, imports : imports };
    content = compiler(object);

    fs.writeFileSync(outPath, content);
};

const sourcify = function(object, optionName, optionValue, indent) {
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
            str += sep + sourcify(value, optionName, optionValue, indent + '    ');
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
                str += sep + prop + '=' + sourcify(value, optionName, optionValue, indent);
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

        str += ',\n' + indent + prop + '=' + sourcify(option[prop], optionName, 'NULL', indent);
    }

    str += ')'

    return str;
}

module.exports = compile;
