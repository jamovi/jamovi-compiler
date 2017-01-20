
'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('underscore');

const uicompile = function(analysisPath, uiPath, sTemplPath, outPath) {

    let content = fs.readFileSync(analysisPath, 'utf-8');
    let analysis = yaml.safeLoad(content);

    let uiData = { title: analysis.title, name: analysis.name, version: "1.0", stage: 0, children: [] };

    if (fs.existsSync(uiPath)) {
        uiData = yaml.safeLoad(fs.readFileSync(uiPath, 'utf-8'));
        if (uiData.children === undefined)
            uiData.children = [];
    }

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

    if (added.length > 0 || removed.length > 0) {
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

    let newCtrl =  constructors[option.type](option);
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
        parentControl.children.push(newCtrl);
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
    index = index + 1;
    if (index >= parentCtrl.children.length) {
        parentCtrl.children.push(newCtrl);
        index = parentCtrl.children.length - 1;
    }
    else
        parentCtrl.children.splice(index, 0, newCtrl);

    return index;
};

const createUIElements = function(options) {

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
};

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

    return { events: events, controls: "[\n" + data.ctrls + "\n\t]", title: uiData.title, name: uiData.name, stage: uiData.stage };
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
    return ctrl.type === "LayoutBox" || ctrl.type === "CollapseBox" || ctrl.type === "Supplier" || ctrl.type === "VariableSupplier" || ctrl.type === "Label";
};

const isOptionControl = function(ctrl, optionName) {
    let isOptionCtrl = ctrl.optionId !== undefined ||
            (ctrl.type === "Supplier" || ctrl.type === "VariableSupplier" || ctrl.type === "CollapseBox" || ctrl.type === "Label" || ctrl.type === "LayoutBox") === false;

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

const groupConstructors = {

    getAppropriateSupplier: function(item) {

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

    open_LayoutBox: function(margin) {
        var ctrl = {};
        ctrl.type = "LayoutBox";
        ctrl.margin = margin !== undefined ? margin : "large";
        ctrl.children = [ ];
        return ctrl;
    },

    open_VariableSupplier: function() {
        var ctrl = { };
        ctrl.type = "VariableSupplier"
        ctrl.persistentItems = false;
        ctrl.stretchFactor = 1;
        ctrl.children = [ ];
        return ctrl;
    },

    open_Supplier: function() {
        var ctrl = { };
        ctrl.type = "Supplier"
        ctrl.persistentItems = false;
        ctrl.stretchFactor = 1;
        ctrl.children = [ ];
        return ctrl;
    }
};

const constructors = {

    Number: function(item) {
        let ctrl = { };
        ctrl.name = item.name;
        ctrl.type = "TextBox";
        ctrl.label = item.title;
        ctrl.format = "number";
        ctrl.inputPattern = "[0-9]+";
        return ctrl
    },

    Bool: function(item) {
        let ctrl = { };
        ctrl.name = item.name;
        ctrl.type = "CheckBox";
        ctrl.label = item.title;
        return ctrl
    },

    List: function(item) {
        var ctrl = { };
        ctrl.name = item.name;
        ctrl.type ="ComboBox";
        ctrl.label = item.title;
        if (item.options.length > 0) {
            ctrl.options = [];
            for (let j = 0; j < item.options.length; j++)
                ctrl.options.push({ label: item.options[j], value: item.options[j] });
        }
        return ctrl;
    },

    Terms: function(item) {
        var ctrl = { };

        ctrl.type = "TargetListBox";
        ctrl.name = item.name;
        ctrl.label = (item.title ? item.title : "");
        ctrl.showColumnHeaders = false;
        ctrl.fullRowSelect = true;
        ctrl.columns = [];
        ctrl.columns.push( {
            type: "ListItem.TermLabel",
            name: "column1",
            label: "",
            stretchFactor: 1
        })


        return ctrl;
    },

    Variables: function(item) {
        var ctrl = { };

        ctrl.type = "VariableTargetListBox";
        ctrl.name = item.name;
        ctrl.label = (item.title ? item.title : '');
        ctrl.showColumnHeaders = false;
        ctrl.fullRowSelect = true;
        ctrl.columns = [];
        ctrl.columns.push({
            type: "ListItem.VariableLabel",
            name: "column1",
            label: "",
            stretchFactor: 1
        });
        return ctrl;
    },

    Variable: function(item) {
        var ctrl = { };

        ctrl.type = "VariableTargetListBox";
        ctrl.name = item.name;
        ctrl.label = (item.title ? item.title : '');
        ctrl.maxItemCount = 1;
        ctrl.showColumnHeaders = false;
        ctrl.fullRowSelect = true;
        ctrl.columns = [ ];
        ctrl.columns.push({
            type: "ListItem.VariableLabel",
            name: "column1",
            label: "",
            stretchFactor: 1
        });

        return ctrl;
    },

    Array: function(item) {
        var ctrl = { };

        ctrl.type = "ListBox";
        ctrl.name = item.name;
        ctrl.label = (item.title ? item.title : '');
        ctrl.showColumnHeaders = false;
        ctrl.fullRowSelect = true;
        ctrl.stretchFactor = 1;
        ctrl.columns = [ ];

        if (item.template.type === 'Group') {
            for (let i = 0; i < item.template.elements.length; i++) {
                var column = item.template.elements[i];
                var columnData = {
                    type: "ListItem.Label",
                    name: column.name,
                    label: "",
                    stretchFactor: 1
                }
                switch (column.type) {
                    case "Variable":
                        columnData.type = "ListItem.VariableLabel";
                        break;
                    case "List":
                        columnData.type = "ListItem.ComboBox";
                        columnData.options = column.options;
                }

                ctrl.columns.push(column);
            }
        }

        return ctrl;
    },

    Pairs: function(item) {
        var ctrl = { };

        ctrl.type = "VariableTargetListBox";
        ctrl.name = item.name;
        ctrl.label = (item.title ? item.title : '');
        ctrl.showColumnHeaders = false;
        ctrl.fullRowSelect = true;
        ctrl.columns = [ ];
        ctrl.columns.push({
            type: "ListItem.VariableLabel",
            name: "column1",
            label: "",
            stretchFactor: 1
        });

        ctrl.columns.push({
            type: "ListItem.VariableLabel",
            name: "column2",
            label: "",
            stretchFactor: 1
        });

        return ctrl;
    }
}

module.exports = uicompile;
