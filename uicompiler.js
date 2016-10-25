
'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('underscore');

const uicompile = function(analysisPath, templPath, outPath) {

    let content;
    content = fs.readFileSync(analysisPath, 'utf-8');
    let analysis = yaml.safeLoad(content);

    let template = fs.readFileSync(templPath, 'utf-8');
    let compiler = _.template(template);

    var elements = createUIElements(analysis.options);

    let object = { analysis : analysis, elements: elements };
    content = compiler(object);

    fs.writeFileSync(outPath, content);
};

const createUIElements = function(options) {

    var currentGroup = null;
    var lastCtrlType = null;

    var controls = "[";
    var startOfList = true;
    var indentCount = 2;
    for (var i = 0; i < options.length; i++) {
        var item = options[i];
        var create = constructors[item.type];
        if (_.isUndefined(create) === false) {

            var neededGroup = groupConstructors.getAppropriateSupplier(item);

            if (neededGroup !== currentGroup || areControlsGroupCompatible(lastCtrlType, item.type) === false) {
                indentCount = 2;
                var indent = getIndent(indentCount);
                if (currentGroup !== null) {
                    controls += "\n" + groupConstructors.close(indent);
                    startOfList = false;
                }

                currentGroup = neededGroup;

                if (currentGroup !== null) {
                    if (startOfList === false)
                        controls += ",\n";
                    else
                        controls += "\n";

                    controls += groupConstructors['open_' + neededGroup](item, indent);
                    startOfList = true;
                    indentCount = 4;
                }
            }

            if (startOfList === false)
                controls += ',\n';
            else
                controls += "\n";
            startOfList = false;
            controls += create(item, getIndent(indentCount));

            lastCtrlType = item.type;
        }
    }
    indentCount = 2;
    if (currentGroup !== null)
        controls += groupConstructors.close(getIndent(indentCount));
    controls += "   ]";

    return { actions: "[]", controls: controls };
};

const areControlsGroupCompatible = function(ctrl1, ctrl2) {
    if ((ctrl1 === 'Bool' || ctrl2 === 'Bool') && ctrl1 !== ctrl2)
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
                return "variablesupplier";
            case "Terms":
            case "Term":
                return "supplier";
            case "Array":
                return null;
        }

        return "layoutbox";
    },

    open_layoutbox: function(item, indent) {
        var ctrl = indent + '{\n';
        ctrl += indent + '    type: "layoutbox",\n';
        ctrl += indent + '    margin: "large",\n';
        ctrl += indent + '    controls: [';

        return ctrl;
    },

    open_variablesupplier: function(item, indent) {
        var ctrl = indent + '{\n';
        ctrl += indent + '   type: "variablesupplier",\n'
        ctrl += indent + '   persistentItems: false,\n'
        ctrl += indent + '   stretchFactor: 1,\n'
        ctrl += indent + '   controls: ['

        return ctrl;
    },

    open_supplier: function(item, indent) {
        var ctrl = indent + '{\n';
        ctrl += indent + '   type: "supplier",\n'
        ctrl += indent + '   persistentItems: false,\n'
        ctrl += indent + '   stretchFactor: 1,\n'
        ctrl += indent + '   controls: ['

        return ctrl;
    },

    close: function(indent) {
        var ctrl = indent + '   ]\n';
        ctrl += indent + '}';
        return ctrl;
    }
};

const constructors = {

    Number: function(item, indent) {
        return indent + '{ name: "' + item.name + '", type:"textbox", label: "' + item.title + '", format: FormatDef.number, inputPattern: "[0-9]+" }';
    },

    Bool: function(item, indent) {
        return indent + '{ name: "' + item.name + '",   type:"checkbox", label: "' + item.title + '" }';
    },

    List: function(item, indent) {
        var ctrl = "";
        ctrl += indent + '{ name: "' + item.name + '", type:"combobox", label: "' + item.title + '", options: [\n';
        for (let j = 0; j < item.options.length; j++) {
            ctrl += indent + '    { label: "' + item.options[j] + '", value: "' + item.options[j] + '" }';
            if (j !== item.options.length - 1)
                ctrl += ',\n';
            else
                ctrl += '\n';
        }
        ctrl += indent + '] }';

        return ctrl;
    },

    Terms: function(item, indent) {
        var ctrl = "";

        ctrl += indent + "{\n";
        ctrl += indent + '   type: "targetlistbox",\n'
        ctrl += indent + '   name: "' + item.name + '",\n'
        ctrl += indent + '   label: "' + (item.title ? item.title : '') + '",\n'
        ctrl += indent + '   showColumnHeaders: false,\n'
        ctrl += indent + '   fullRowSelect: true,\n'
        ctrl += indent + '   columns: [\n'
        ctrl += indent + '       { type: "listitem.termlabel", name: "column1", label: "", format: FormatDef.term, stretchFactor: 1 }\n';
        ctrl += indent + '   ]\n'
        ctrl += indent + "}";
        return ctrl;
    },

    Variables: function(item, indent) {
        var ctrl = "";

        ctrl += indent + "{\n";
        ctrl += indent + '   type: "variabletargetlistbox",\n'
        ctrl += indent + '   name: "' + item.name + '",\n'
        ctrl += indent + '   label: "' + (item.title ? item.title : '') + '",\n'
        ctrl += indent + '   showColumnHeaders: false,\n'
        ctrl += indent + '   fullRowSelect: true,\n'
        ctrl += indent + '   columns: [\n'
        ctrl += indent + '       { type: "listitem.variablelabel", name: "column1", label: "", format: FormatDef.variable, stretchFactor: 1 }\n';
        ctrl += indent + '   ]\n'
        ctrl += indent + "}";
        return ctrl;
    },

    Variable: function(item, indent) {
        var ctrl = "";

        ctrl += indent + "{\n";
        ctrl += indent + '   type: "variabletargetlistbox",\n'
        ctrl += indent + '   name: "' + item.name + '",\n'
        ctrl += indent + '   label: "' + (item.title ? item.title : '') + '",\n'
        ctrl += indent + '   maxItemCount: 1,\n'
        ctrl += indent + '   showColumnHeaders: false,\n'
        ctrl += indent + '   fullRowSelect: true,\n'
        ctrl += indent + '   columns: [\n'
        ctrl += indent + '       { type: "listitem.variablelabel", name: "column1", label: "", format: FormatDef.variable, stretchFactor: 1 }\n';
        ctrl += indent + '   ]\n'
        ctrl += indent + "}";
        return ctrl;
    },

    Array: function(item, indent) {
        var ctrl = indent + "{\n";

        ctrl += indent + '   type: "listbox",\n'
        ctrl += indent + '   name: "' + item.name + '",\n'
        ctrl += indent + '   label: "' + (item.title ? item.title : '') + '",\n'
        ctrl += indent + '   showColumnHeaders: false,\n'
        ctrl += indent + '   fullRowSelect: true,\n'
        ctrl += indent + '   stretchFactor: 1,\n'
        ctrl += indent + '   columns: [\n'

        if (item.template.type === 'Group') {
            for (let i = 0; i < item.template.elements.length; i++) {
                var column = item.template.elements[i];
                var columnFormat = "FormatDef.string";
                var columnControl = "listitem.label";
                var columnOptions = null;
                switch (column.type) {
                    case "Variable":
                        columnFormat = "FormatDef.variable";
                        columnControl = "listitem.variablelabel";
                        break;
                    case "List":
                        columnFormat = "FormatDef.string";
                        columnControl = "listitem.combobox";
                        columnOptions = "[";
                        for (let j = 0; j < column.options.length; j++) {
                            if (j !== 0)
                                columnOptions += ',';
                            columnOptions += '"' + column.options[j] + '"';
                        }
                        columnOptions += "]";
                }
                ctrl += indent + '       { type: "' + columnControl + '", name: "' + column.name + '", label: "", format: ' + columnFormat + ', stretchFactor: 1' + (columnOptions === null ? "" : (", options: " + columnOptions)) + ' }';
                if (i !== item.template.elements.length - 1)
                    ctrl += ',\n';
                else
                    ctrl += '\n';
            }
        }

        ctrl += indent + '   ]\n'
        ctrl += indent + "}";
        return ctrl;
    },

    Pairs: function(item, indent) {
        var ctrl = "";

        ctrl += indent + "{\n";
        ctrl += indent + '   type: "variabletargetlistbox",\n'
        ctrl += indent + '   name: "' + item.name + '",\n'
        ctrl += indent + '   label: "' + (item.title ? item.title : '') + '",\n'
        ctrl += indent + '   showColumnHeaders: false,\n'
        ctrl += indent + '   fullRowSelect: true,\n'
        ctrl += indent + '   columns: [\n'
        ctrl += indent + '       { type: "listitem.variablelabel", name: "column1", label: "", format: FormatDef.variable, stretchFactor: 1 }\n';
        ctrl += indent + '       { type: "listitem.variablelabel", name: "column2", label: "", format: FormatDef.variable, stretchFactor: 1 }\n';
        ctrl += indent + '   ]\n'
        ctrl += indent + "}";

        return ctrl;
    }
}

module.exports = uicompile;
