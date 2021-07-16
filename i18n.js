
'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const utils = require('./utils');


const translations = { };

const getTranslation = function(key, code, source) {
    let v = translations[code]._list;
    for (let pair of v) {
        if (pair.key === key) {
            if (pair.source === undefined)
                pair.source = [];
            if (pair.source.includes(source) === false)
                pair.source.push(source);
            return pair;
        }
        else if (pair.key.toLowerCase() === key.toLowerCase()) {
            let found = false;
            if (pair._clash === undefined)
                pair._clash = [];
            else {
                for (let clash of pair._clash) {
                    if (clash === key) {
                        found = true;
                        break;
                    }
                }
            }
            if ( ! found)
                pair._clash.push(key);
        }
    }
    let newItem = { key: key, val: '', source: [ source ], _clash: [] }
    translations[code]._list.push(newItem);
    return newItem;
};

const updateEntry = function(key, value, source) {
    for (let code in translations) {
        let pair = getTranslation(key, code, source);
        pair._inUse = true;
    }
};

const finalise = function(verbose) {
    for (let code in translations) {
        for (let pair of translations[code]._list) {
            if (pair._inUse) {
                if (verbose && pair._clash && pair._clash.length > 0)
                    console.log(` !! TRANSLATION WARNING: '${pair._clash.join(', ')}' and '${ pair.key }' have been added as seperate strings.`)
                delete pair._inUse;
                delete pair._clash;
                if ( ! verbose)
                    delete pair.source;
                translations[code].list.push(pair);
            }
        }
        delete translations[code]._list;
    }
};

const extract = function(obj, address, filter) {
    for (let property in obj) {
        let include = !filter || filter.includes(property);
        if (include) {
            let value = obj[property];
            if (typeof value === 'string') {
                value = value.trim();
                if (value !== '')
                    updateEntry(value, value, `${address}.${property}`);
            }
            else if (typeof value === 'object')
                extract(value, `${address}.${property}`);
        }
    }
}

const checkItem = function(item, address) {

    let filter = ['label', 'title', 'description', 'addButton', 'ghostText', 'suffix'];

    if (typeof item === 'object') {
        extract(item, address, filter);

        if (item.template) {
            checkItem(item.template, `${address}.template`);
        }

        if (item.columns) {
            for (let column of item.columns)
                checkItem(column, `${address}.columns`);
        }

        if (item.children) {
            for (let i = 0; i < item.children.length; i++) {
                let child = item.children[i];
                let childAddress = '';
                if (child.name)
                    childAddress = `${address}/${child.name}`;
                else
                    childAddress = `${address}[${i}]`;

                checkItem(child, childAddress);
            }
        }

        if (item.items) {
            for (let i = 0; i < item.items.length; i++) {
                let child = item.items[i];
                let childAddress = '';
                if (child.name)
                    childAddress = `${address}/${child.name}`;
                else
                    childAddress = `${address}[${i}]`;

                checkItem(child, childAddress);
            }
        }

        if (item.elements) {
            for (let i = 0; i < item.elements.length; i++) {
                let child = item.elements[i];
                let childAddress = '';
                if (child.name)
                    childAddress = `${address}/${child.name}`;
                else
                    childAddress = `${address}[${i}]`;

                checkItem(child, childAddress);
            }
        }

        if (item.options) {
            for (let i = 0; i < item.options.length; i++) {
                let child = item.options[i];
                let childAddress = '';
                if (child.name)
                    childAddress = `${address}/${child.name}`;
                else
                    childAddress = `${address}[${i}]`;

                checkItem(child, childAddress);
            }
        }
    }
    else if (Array.isArray(item)) {
        for (let i = 0; i < item.length; i++) {
            let child = item[i];
            let childAddress = '';
            if (child.name)
                childAddress = `${address}/${child.name}`;
            else
                childAddress = `${address}[${i}]`;

            checkItem(child, childAddress);
        }
    }
}

const load = function(defDir, code, create) {
    let transDir = path.join(defDir, 'i18n');
    if ( ! utils.exists(transDir)) {
        if (create)
            fs.mkdirSync(transDir);
        else
            throw 'No translation files found.';
    }

    if (code && create)
        translations[code] = { code: code, name: '', label: '', _list: [], list: [] };

    let transfiles = fs.readdirSync(transDir);
    if (create === false && transfiles.length === 0)
        throw 'No translation files found.';

    let translationLoaded = false;
    for (let file of transfiles) {

        if (code) {
            if (translationLoaded)
                break;
            if (file.startsWith(code.toLowerCase()) === false)
                continue;
            else if (create) {
                throw `Translation for language code ${code} already exists.`;
            }
        }

        let langPath = path.join(transDir, file);
        let translation = yaml.safeLoad(fs.readFileSync(langPath));

        if (translation.code) {
            if (translation.name === undefined)
                translation.name = '';

            if (translation.label === undefined)
                translation.label = '';

            if (Array.isArray(translation.list) === false)
                translation._list = [];
            else
                translation._list = translation.list;
            translation.list = [];

            translations[translation.code] = translation;
            translationLoaded = true;
        }
    }

    if (create === false && code && translationLoaded === false)
        throw `No translation for language code ${code} found.
Try using:    jmc --i18n path  --create ${code}`;

    return transDir;
}

const scanAnalyses = function(defDir) {
    let files = fs.readdirSync(defDir);
    for (let file of files) {

        if (file.endsWith('.a.yaml')) {
            let analysisPath = path.join(defDir, file);
            let basename = path.basename(analysisPath, '.a.yaml');
            let resultsPath = path.join(defDir, basename + '.r.yaml');
            let uiPath = path.join(defDir, basename + '.u.yaml');

            let content = fs.readFileSync(analysisPath, 'utf-8');
            let analysis = yaml.safeLoad(content);

            checkItem(analysis, `${analysis.name}/options`);

            if (utils.exists(uiPath)) {
                let uiData = yaml.safeLoad(fs.readFileSync(uiPath));
                checkItem(uiData, `${analysis.name}/ui`);
            }

            if (utils.exists(resultsPath)) {
                let results = yaml.safeLoad(fs.readFileSync(resultsPath));
                checkItem(results, `${analysis.name}/results`);
            }
        }
    }
}

const save = function(transDir, verbose) {
    finalise(verbose);
    for (let code in translations) {
        let transOutPath = path.join(transDir, `${code.toLowerCase()}.yaml`);
        fs.writeFileSync(transOutPath,  yaml.safeDump(translations[code], { indent: 4, lineWidth: -1 }));
        if (verbose)
            console.log('wrote: ' + `${translations[code].list.length } unique strings found`);
        console.log('wrote: ' + path.basename(transOutPath));
    }
}

const create = function(code, defDir, verbose, list) {
    let transDir = load(defDir, code, true);
    scanAnalyses(defDir);
    save(transDir, verbose);
}

const update = function(code, defDir, verbose, list) {
    let transDir = load(defDir, code, false);
    scanAnalyses(defDir);
    save(transDir, verbose);
};

const list = function(defDir) {
    let transDir = path.join(defDir, 'i18n');
    if ( ! utils.exists(transDir)) {
        console.log('No translation files found.');
        return;
    }

    let transfiles = fs.readdirSync(transDir);
    if (create === false && transfiles.length === 0) {
        console.log('No translation files found.');
        return;
    }

    if (transfiles.length === 1)
        console.log(`    ${transfiles.length} language code file was found:`);
    else
        console.log(`    ${transfiles.length} language code files were found:`);
        console.log('');

    for (let file of transfiles)
        console.log(`      ${file}`);
    console.log('');
    console.log('');

    console.log(`To update a specific language code file use:
     jmc --i18n path  --update code

To update all language code files use:
     jmc --i18n path  --update

To create a new language code file use:
    jmc --i18n path  --create code`);
}

module.exports = { create, update, list, translations };
