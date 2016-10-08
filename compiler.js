
'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('underscore');

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

const sourcify = function(object, optionName, optionValue) {
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
        let sep = '';
        for (let value of object) {
            str += sep + sourcify(value, optionName, optionValue);
            sep = ', '
        }
        str += ')';
    }
    else if (_.isObject(object)) {
        if (object.type) {
            str = optionify(object, optionName, optionValue)
        }
        else {
            str = 'list(';
            let sep = '';
            for (let prop in object) {
                let value = object[prop];
                str += sep + prop + '=' + sourcify(value, optionName, optionValue);
                sep = ', '
            }
            str += ')';
        }
    }
    return str;
}

const optionify = function(option, optionName, optionValue) {

    if (option.name)
        optionName = option.name;
    if (typeof optionValue === 'undefined')
        optionValue = option.name;

    let str = 'jmvcore::Option' + option.type + '$new("' + optionName + '", ' + optionValue

    for (let prop in option) {
        if (prop === 'type' ||
            prop === 'name' ||
            prop === 'title' ||
            prop === 'description')
                continue;

        str += ', ' + prop + '=' + sourcify(option[prop], optionName, 'NULL');
    }

    str += ')'

    return str;
}

module.exports = compile;
