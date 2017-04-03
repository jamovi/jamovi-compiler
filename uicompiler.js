
'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('underscore');
const validate = require('jsonschema').validate;
const util = require('util')
const uiUpdateCheck = require('./layoutupdatecheck');

let uiSchemaPath = path.join(__dirname, 'schemas', 'uischema.yaml');
let uiSchema = yaml.safeLoad(fs.readFileSync(uiSchemaPath));
let uiCtrlSchemasPath = path.join(__dirname, 'schemas', 'uictrlschemas.yaml');
let uiCtrlSchemas = yaml.safeLoad(fs.readFileSync(uiCtrlSchemasPath));

const uicompile = function(analysisPath, uiPath, sTemplPath, outPath) {

    let content = fs.readFileSync(analysisPath, 'utf-8');
    let analysis = yaml.safeLoad(content);

    let uiData = { title: analysis.title, name: analysis.name, jus: "2.0", stage: 0, children: [] };

    if (fs.existsSync(uiPath)) {
        try {
            uiData = yaml.safeLoad(fs.readFileSync(uiPath, 'utf-8'));
        }
        catch (e) {
            reject(uiPath, e.message);
        }
        if (uiData.children === undefined)
            uiData.children = [];
    }

    let upgradeInfo = uiUpdateCheck(uiData);
    if (upgradeInfo.upgraded)
        console.log("upgraded: " + path.basename(uiPath) + " : " + upgradeInfo.message);

    if (uiData === null || typeof uiData.jus !== 'string')
        reject(uiPath, "no 'jus' present");

    let jus = uiData.jus.match(/^([0-9]+)\.([0-9]+)$/)
    if ((jus[1] !== '1' && jus[1] !== '2') || jus[2] !== '0')
        reject(uiPath, 'requires a newer jamovi-compiler');


    let removed = removeMissingOptions(analysis.options, uiData);
    if (removed.length > 0) {
        console.log("modified: " + path.basename(uiPath));
        for (let i = 0; i < removed.length; i++)
            console.log("  - removed ctrl: " + ((removed[i].name === undefined) ? (removed[i].type + " - " + removed[i].label)  : removed[i].name));
    }

    let added = insertMissingControls(analysis.options, uiData);
    if (added.length > 0) {
        if (removed.length === 0)
            console.log("modified: " + path.basename(uiPath));
        for (let i = 0; i < added.length; i++)
            console.log("  - added ctrl: " + added[i].name);
    }

    let report = validate(uiData, uiSchema);
    if ( ! report.valid)
        throwVError(report, analysis.title, uiPath);


    checkControls(uiData.children, uiPath);

    if (upgradeInfo.upgraded || added.length > 0 || removed.length > 0) {
        fs.writeFileSync(uiPath,  yaml.safeDump(uiData));
        console.log('wrote: ' + path.basename(uiPath));
    }

    let template = fs.readFileSync(sTemplPath, 'utf-8');
    let compiler = _.template(template);

    let elements = createUIElementsFromYaml(uiData);
    let object = { analysis: analysis, elements: elements };
    content = compiler(object);

    fs.writeFileSync(outPath, content);

    console.log('wrote: ' + path.basename(outPath));
};



const reject = function(filePath, message) {
    throw "Unable to compile '" + path.basename(filePath) + "':\n\t" + message;
}

const throwVError = function(report, name, filename) {
    let errors = report.errors.map(e => {
        return e.stack.replace(/instance/g, name);
    }).join('\n\t');
    reject(filename, errors)
}

const extendSchemas = function(source, destination) {

    for (let name in source) {
        if (name === "properties") {
            for (let prop in source.properties) {
                if (prop === "events") {
                    if (destination.properties[prop] === undefined) {
                        destination.properties[prop] = {
                            type: "object",
                            additionalProperties: false,
                            properties: []
                        }
                    }
                    extendSchemas(source.properties[prop], destination.properties[prop]);
                }
                else
                    destination.properties[prop] = source.properties[prop];
            }
        }
        else if (name === "required" && destination.required)
            destination.required = destination.required.concat(source.required)
        else
            destination[name] = source[name];
    }
}

const createSchema = function(ctrl) {
    let schema = { };
    schema["$schema"] = 'http://json-schema.org/draft-04/schema#';
    schema.type = "object";
    schema.additionalProperties = false;
    schema.properties = { };
    if (ctrl.children)
        schema.properties.children = { type: "array" };
    let list = uiCtrlSchemas.ControlInheritance[ctrl.type];
    for (let i = 0; i < list.length; i++) {
        let partSchema = uiCtrlSchemas[list[i]];
        extendSchemas(partSchema, schema);
    }
    return schema;
}

const checkControl = function(ctrl, uifilename) {
    let schema = createSchema(ctrl);
    if (schema) {
        let report = validate(ctrl, schema);
        if ( ! report.valid)
            throwVError(report, ctrl.name, uifilename);
    }
};

const checkControls = function(ctrls, uifilename) {
    for (let i = 0; i < ctrls.length; i++) {
        checkControl(ctrls[i]);

        if (ctrls[i].template)
            checkControl(ctrls[i].template, uifilename);

        if (ctrls[i].children)
            checkControls(ctrls[i].children, uifilename);
    }
}

const removeMissingOptions = function(options, parent) {
    let list = [];
    let i = 0;
    while (i < parent.children.length) {
        let removed = false;

        let ctrl = parent.children[i];
        if (ctrl.children !== undefined)
            list = list.concat(removeMissingOptions(options, ctrl));

        var optionName = isOptionControl(ctrl);
        if (optionName === false) {
            if (ctrl.children.length === 0) {
                parent.children.splice(i, 1);
                removed = true;
            }
        }
        else if (containsOption(optionName, options) === false) {
            list.push(ctrl);
            if (ctrl.children !== undefined && ctrl.children.length > 0) {
                let newCtrl = groupConstructors.open_LayoutBox();
                for (let j = 0; j < ctrl.children.length; j++)
                    newCtrl.children.push(ctrl.children[j]);
                parent.children[i] = newCtrl;
            }
            else {
                parent.children.splice(i, 1);
                removed = true;
            }
        }

        if (removed === false)
            i += 1;
    }

    return list;
};

const containsOption = function(name, options) {
    for (let i = 0; i < options.length; i++) {
        if (options[i].name === name)
            return true;
    }

    return false;
};

const insertMissingControls = function(options, uiData) {
    var baseObj = { ctrl: uiData, index: 0, parentData: null };
    let lastPosData = baseObj;
    var updated = [];
    for (var i = 0; i < options.length; i++) {
        var option = options[i];
        if (option.hidden)
            continue;
        let posData = findOptionControl(option, baseObj);
        if (posData === null) {
            posData = addOptionAsControl(option, lastPosData);
            if (posData !== null)
                updated.push(option);
        }

        if (posData !== null)
            lastPosData = posData;
    }

    return updated;
};

const findOptionControl = function(option, posData) {
    var ctrl = posData.ctrl;
    if (isOptionControl(ctrl, option.name))
        return posData;

    if (ctrl.children !== undefined) {
        for (let i = 0; i < ctrl.children.length; i++) {
            let found = findOptionControl(option, { ctrl: ctrl.children[i], index: i, parentData: posData } );
            if (found !== null) {
                return found;
            }
        }
    }

    return null;
};

const addOptionAsControl = function(option, sibblingData) {

    var create = constructors[option.type];
    if (create === undefined)
        return null;

    let newCtrl =  create(option);
    var index;

    var neededGroup = groupConstructors.getAppropriateSupplier(option);
    var parentData = sibblingData.parentData;

    if (parentData === null) {
        parentData = sibblingData;
        sibblingData = { ctrl: parentData.ctrl.children[parentData.ctrl.children.length - 1], index: parentData.ctrl.children.length - 1, parentData: parentData };
    }

    var parentCtrl = parentData.ctrl;
    while (parentData.parentData !== null && (neededGroup !== parentCtrl.type || areControlsCompatibleSibblings(sibblingData.ctrl, newCtrl) === false)) {
        sibblingData = parentData;
        parentData = parentData.parentData;
        parentCtrl = parentData.ctrl;
    }


    if ((parentData.parentData === null || isPureContainerControl(sibblingData.ctrl)) && neededGroup !== null) {
        var parentControl = groupConstructors["open_" + neededGroup]();
        //parentControl.children.push(newCtrl);
        addChild(newCtrl, parentControl, 0);
        var ii = addChild(parentControl, parentCtrl, sibblingData.index + 1);
        parentData = { ctrl: parentControl, index: ii, parentData: parentData };
        parentCtrl = parentControl;
        index = 0;
    }
    else
        index = addChild(newCtrl, parentCtrl, sibblingData.index + 1);

    return { ctrl: newCtrl, index: index, parentData: parentData };
};

const addChild = function(newCtrl, parentCtrl, index) {
    if (parentCtrl.type === "Supplier" || parentCtrl.type === "VariableSupplier") {
        let label = newCtrl.name;;
        if (newCtrl._target_label !== undefined) {
            label = newCtrl._target_label;
            delete newCtrl._target_label;
        }

        let cc = groupConstructors.open_TargetLayoutBox(label);
        cc.children.push(newCtrl);
        newCtrl = cc;
    }

    if (newCtrl._target_label !== undefined)
        delete newCtrl._target_label;

    index = index + 1;
    if (index >= parentCtrl.children.length) {
        parentCtrl.children.push(newCtrl);
        index = parentCtrl.children.length - 1;
    }
    else
        parentCtrl.children.splice(index, 0, newCtrl);

    return index;
};

/*const createUIElements = function(options) {

    var currentGroup = null;
    var lastCtrlType = null;

    var parentControls = [{ children: []}];
    for (var i = 0; i < options.length; i++) {
        var item = options[i];
        var create = constructors[item.type];
        if (create !== undefined) {

            var neededGroup = groupConstructors.getAppropriateSupplier(item);

            if (neededGroup !== currentGroup || areControlsGroupCompatible(lastCtrlType, item.type) === false) {
                if (parentControls.length > 1)
                    parentControls.shift();

                currentGroup = neededGroup;

                if (currentGroup !== null) {

                    let ctrl = groupConstructors['open_' + neededGroup](item);

                    parentControls[0].children.push(ctrl);
                    parentControls.unshift(ctrl);
                }
            }

            let ctrl =  create(item);
            parentControls[0].children.push(ctrl);

            lastCtrlType = item.type;
        }
    }

    return { controls: yaml.safeDump(parentControls[parentControls.length - 1]) };
};*/

const replaceAt = function(value, index, character) {
    return value.substr(0, index) + character + value.substr(index+character.length);
}

const createUIElementsFromYaml = function(uiData) {

    var data = createChildTree(uiData.children, "\t\t");

    if (uiData.stage === undefined)
        uiData.stage = 0;

    let mainEvents = uiData.events;
    let events = "events: [\n" + data.events + "\n\t]";
    for (let eventName in mainEvents)
        events = events + ",\n\n\t" + eventName + ": " + functionify(mainEvents[eventName]);

    return { events: events, controls: "[\n" + data.ctrls + "\n\t]", title: uiData.title, name: uiData.name, stage: uiData.stage, jus: uiData.jus };
};

const createChildTree = function(list, indent) {
    if (list === undefined)
        return { ctrls: "", events: "" };

    var ctrlList = "";
    var events = "";
    var children = list;
    for (let i = 0; i < children.length; i++) {
        let child = children[i];
        let copy = "";
        for (let name in child) {
            if (name !== "events" && copy !== "")
                copy += ",\n";

            if (name === "type") {
                copy += indent + "\t" + name + ": " + processEnum("DefaultControls", child[name]);
            }
            else if (name === "format") {
                copy += indent + "\t" + name + ": " + processEnum("FormatDef", child[name]);
            }
            else if (name === "events") {
                if (child.name === undefined)
                    throw "A control cannot have events with no name.";
                if (events !== "")
                    events += ",\n";
                events += processEventsList(child.name, child[name], "\t\t");
            }
            else if (name === "children") {
                var data = createChildTree(child.children, indent + "\t\t");
                copy += indent + "\t" + "controls: [\n" + data.ctrls + "\n\t" + indent + "]";
                if (data.events !== "") {
                    if (events !== "")
                        events += ",\n";
                    events += data.events;
                }
            }
            else if (name === "columns") {
                var data = createChildTree(child.columns, indent + "\t\t");
                copy += indent + "\t" + "columns: [\n" + data.ctrls + "\n\t" + indent + "]";
            }
            else if (name === "template") {
                var data = createChildTree([child.template], indent + "\t");
                copy += indent + "\t" + "template:\n" + data.ctrls + "\t" + indent;
            }
            else
                copy += indent + "\t" + name + ": " + JSON.stringify(child[name]);
        }
        copy += "\n";
        copy = indent + "{\n" +  copy + indent + "}";
        if (ctrlList !== "")
            ctrlList += ",\n";
        ctrlList += copy;
    }

    return { ctrls: ctrlList, events: events };
};

const processEnum = function(type, value) {
    let pvalue = value;
    if (value.startsWith('.')) {
        let list = value.split("::");
        pvalue = "require('" + list[0] + "')";
        if (list.length > 1)
            pvalue = pvalue + "." + list[1];
    }
    else
        pvalue = type + "." + pvalue;

    return pvalue;
};

const processEventsList = function(ctrlName, events, indent) {
    var list = "";
    for (let name in events) {

        var eventData = events[name];
        var event = "";
        if (name === "change") {
            event += "onChange: '" + ctrlName + "', ";
            event += "execute: " + functionify(eventData);
        }
        else {
            event += "onEvent: '" + ctrlName + "." + name + "', ";
            event += "execute: " + functionify(eventData, "data");
        }
        //event += "\n";
        event = indent + "{ " + event + " }";
        if (list !== "")
            list += ",\n";
        list += event;
    }
    return list;
};

const functionify = function(value, indent, args) {

    let init = value;
    if (init === undefined)
        init = "function(ui" + (args !== undefined ? (", " + args) : "") + ") { }";
    else if (init.startsWith('.')) {
        let initList = init.split("::");
        init = "require('" + initList[0] + "')";
        if (initList.length > 1)
            init = init + "." + initList[1];
    }
    else
        init = "function(ui" + (args !== undefined ? (", " + args) : "") + ") { " + init + " }";

    return init;
};

const isPureContainerControl = function(ctrl) {
    return ctrl.type === "LayoutBox" || ctrl.type === "TargetLayoutBox" || ctrl.type === "CollapseBox" || ctrl.type === "Supplier" || ctrl.type === "VariableSupplier" || ctrl.type === "Label";
};

const isOptionControl = function(ctrl, optionName) {
    let isOptionCtrl = ctrl.optionId !== undefined ||
            (ctrl.type === "Supplier" || ctrl.type === "VariableSupplier" || ctrl.type === "CollapseBox" || ctrl.type === "Label" || ctrl.type === "TargetLayoutBox" || ctrl.type === "LayoutBox") === false;

    if (isOptionCtrl) {
        if (optionName !== undefined)
            return ctrl.optionId === optionName || ctrl.name === optionName;

        return (ctrl.optionId === undefined) ? ctrl.name : ctrl.optionId;
    }

    return false;
};

const areControlsCompatibleSibblings = function(ctrl1, ctrl2) {

    if (ctrl1.type === 'CheckBox' || ctrl1.type === 'RadioButton')
        return ctrl2.type === 'CheckBox' || ctrl2.type === 'RadioButton';
    else if (ctrl2.type === 'CheckBox' || ctrl2.type === 'RadioButton')
            return false

    return true;
};

const areControlsGroupCompatible = function(optionType1, optionType2) {
    if ((optionType1 === 'Bool' || optionType2 === 'Bool') && optionType1 !== optionType2)
        return false;

    return true;
};

const getIndent = function(count) {
    var s = '';
    for (let i = 0; i < count; i++)
        s += '    ';
    return s;
};

const ff = function(item) {
    switch (item.type) {
        case "Variables":
        case "Variable":
        case "Pairs":
        case "Pair":
            return "VariableSupplier";
        case "Terms":
        case "Term":
            return "Supplier";
    }

    if (item.template !== undefined) {
        let template = item.template;
        if (template.elements !== undefined) {
            for (let i = 0; i < template.elements.length; i++) {
                let rr = ff(template.elements[i]);
                if (rr !== null)
                    return rr;
            }
        }

        if (template.template !== undefined) {
            let rr = ff(template.template);
            if (rr !== null)
                return rr;
        }
    }

    return null;
};

const groupConstructors = {

    getAppropriateSupplier: function(item) {

        let ss = ff(item);
        if (ss !== null)
            return ss;

        switch (item.type) {
            case "Variables":
            case "Variable":
            case "Pairs":
            case "Pair":
                return "VariableSupplier";
            case "Terms":
            case "Term":
                return "Supplier";
            case "Array":

                return null;
        }

        return "LayoutBox";
    },

    open_TargetLayoutBox: function(label) {
        let ctrl = { };
        ctrl.type = "TargetLayoutBox";
        if (label !== undefined)
            ctrl.label = label;
        ctrl.children = [ ];
        return ctrl;
    },

    open_LayoutBox: function(margin) {
        var ctrl = {};
        ctrl.type = 'LayoutBox';
        ctrl.margin = margin !== undefined ? margin : "large";
        ctrl.children = [ ];
        return ctrl;
    },

    open_Label: function(label) {
        var ctrl = {};
        ctrl.type = 'Label';
        ctrl.label = label;
        ctrl.children = [ ];
        return ctrl;
    },

    open_VariableSupplier: function() {
        var ctrl = { };
        ctrl.type = 'VariableSupplier'
        ctrl.persistentItems = false;
        ctrl.stretchFactor = 1;
        ctrl.children = [ ];
        return ctrl;
    },

    open_Supplier: function() {
        var ctrl = { };
        ctrl.type = 'Supplier'
        ctrl.persistentItems = false;
        ctrl.stretchFactor = 1;
        ctrl.format = 'term';
        ctrl.children = [ ];
        return ctrl;
    }
};

const CheckTemplateState = function(item, ctrl, isTemplate) {
    if(item.name !== undefined) {
        if (!isTemplate)
            ctrl.name = item.name;
    }
};


const constructors = {

    Integer: function(item, isTemplate) {
        let ctrl = { };
        ctrl.type = 'TextBox';
        CheckTemplateState(item, ctrl, isTemplate);
        if (item.name !== undefined || item.title !== undefined)
            ctrl.label = item.title !== undefined ? item.title : item.name;
        ctrl.format = "number";
        ctrl.inputPattern = "[0-9]+";
        return ctrl
    },

    Number: function(item, isTemplate) {
        let ctrl = { };
        ctrl.type = 'TextBox';
        CheckTemplateState(item, ctrl, isTemplate);
        if (item.name !== undefined || item.title !== undefined)
            ctrl.label = item.title !== undefined ? item.title : item.name;
        ctrl.format = "number";
        ctrl.inputPattern = "[0-9]+";
        return ctrl
    },

    Bool: function(item, isTemplate) {
        let ctrl = { };
        ctrl.type = 'CheckBox';
        CheckTemplateState(item, ctrl, isTemplate);
        if (item.name !== undefined || item.title !== undefined)
            ctrl.label = item.title !== undefined ? item.title : item.name;
        return ctrl
    },

    NMXList: function(item, isTemplate) {
        let ctrl = groupConstructors.open_Label(item.title);
        CheckTemplateState(item, ctrl, isTemplate);
        if (item.options.length <= 3)
            ctrl.style = "list-inline";
        for (let i = 0; i < item.options.length; i++) {
            let option = item.options[i];
            let checkbox = { };
            checkbox.name = item.name + "_" + option.name;
            checkbox.type = 'CheckBox';
            checkbox.label = option.title;
            checkbox.checkedValue = option.name;
            checkbox.optionId = item.name;
            ctrl.children.push(checkbox);
        }

        return ctrl;
    },

    List: function(item, isTemplate) {
        var ctrl = { };
        ctrl.type = 'ComboBox';
        CheckTemplateState(item, ctrl, isTemplate);
        if (item.name !== undefined || item.title !== undefined)
            ctrl.label = item.title !== undefined ? item.title : item.name;
        if (item.options.length > 0) {
            ctrl.options = [];
            for (let j = 0; j < item.options.length; j++) {
                let option = item.options[j];
                if (typeof option === "string")
                    ctrl.options.push({ label: option, value: option });
                else
                    ctrl.options.push({ label: option.title, value: option.name });
            }
        }
        return ctrl;
    },

    Terms: function(item, isTemplate) {
        let ctrl = { };
        ctrl.type = 'ListBox';
        CheckTemplateState(item, ctrl, isTemplate);
        if (item.name !== undefined || item.title !== undefined)
            ctrl._target_label = item.title !== undefined ? item.title : item.name;
        ctrl.isTarget = true;
        ctrl.template = {
            type: "TermLabel"
        };

        return ctrl;
    },

    String: function(item, isTemplate) {
        let ctrl = { };
        ctrl.type = "TextBox";
        CheckTemplateState(item, ctrl, isTemplate);
        if (item.name !== undefined || item.title !== undefined)
            ctrl.label = item.title !== undefined ? item.title : item.name;
        ctrl.format = "string";
        return ctrl;
    },

    Variables: function(item, isTemplate) {
        let ctrl = { }
        ctrl.type = "VariablesListBox";
        CheckTemplateState(item, ctrl, isTemplate);
        if (isTemplate === false && (item.name !== undefined || item.title !== undefined))
            ctrl._target_label = item.title !== undefined ? item.title : item.name;
        ctrl.isTarget = true;
        return ctrl;
    },

    Variable: function(item, isTemplate) {
        let ctrl = { }
        ctrl.type = "VariablesListBox";
        CheckTemplateState(item, ctrl, isTemplate);
        if (isTemplate === false && (item.name !== undefined || item.title !== undefined))
            ctrl._target_label = item.title !== undefined ? item.title : item.name;
        ctrl.maxItemCount = 1;
        ctrl.isTarget = true;
        return ctrl;
    },

    Array: function(item, isTemplate) {
        var ctrl = { };

        ctrl.type = "ListBox";
        CheckTemplateState(item, ctrl, isTemplate);
        if (isTemplate === false && (item.name !== undefined || item.title !== undefined))
            ctrl._target_label = item.title !== undefined ? item.title : item.name;
        ctrl.showColumnHeaders = false;
        ctrl.fullRowSelect = true;
        ctrl.stretchFactor = 1;

        if (item.template.type === 'Group') {
            ctrl.columns = [ ];
            for (let i = 0; i < item.template.elements.length; i++) {
                let column = item.template.elements[i];
                let columnData = {
                    name: column.name,
                    stretchFactor: 1
                }
                columnData.template = constructors[column.type](column, true);
                ctrl.columns.push(columnData);
            }
        }
        else
            ctrl.template = constructors[item.template.type](item.template, true);

        return ctrl;
    },

    Pairs: function(item, isTemplate) {
        var ctrl = { };
        ctrl.type = "VariablesListBox";
        CheckTemplateState(item, ctrl, isTemplate);
        if (isTemplate === false && (item.name !== undefined || item.title !== undefined))
            ctrl._target_label = item.title !== undefined ? item.title : item.name;
        ctrl.fullRowSelect = true;
        ctrl.isTarget = true;
        ctrl.columns = [
            {
                name: "i1",
                stretchFactor: 1,
                template: {
                    type: "VariableLabel"
                }
            },
            {
                name: "i2",
                stretchFactor: 1,
                template: {
                    type: "VariableLabel"
                }
            }
        ];
        return ctrl;
    }
}

module.exports = uicompile;
