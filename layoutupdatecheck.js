
'use strict';

let _upgraded = false;

const checkForLayoutUpgrade = function(layout) {
    _upgraded = false;

    let message = "";
    if (layout.jus === undefined || layout.jus === '1.0') {
        applyUpgrade(layout, null, layoutUpgrade_2_0);
        layout.jus = "2.0";
        message = "from 1.0 => 2.0";
    }

    return { upgraded: _upgraded, message: message };
};

const applyUpgrade = function(ctrl, parent, upgrade) {

    let upgradeCtrl = upgrade(ctrl, parent);

    if (Array.isArray(ctrl.children)) {
        for (let i = 0; i < ctrl.children.length; i++)
            ctrl.children[i] = applyUpgrade(ctrl.children[i], ctrl, upgrade);
    }

    return upgradeCtrl;
};


const layoutUpgrade_2_0 = function(ctrl, parent) {
    if ( ! ctrl.type)
        return ctrl;

    let upgradedCtrl = ctrl;

    if (ctrl.type === "VariableTargetListBox" || ctrl.type === "TargetListBox") {
        _upgraded = true;
        if (ctrl.columns !== undefined) {
            for (let c = 0; c < ctrl.columns.length; c++) {
                let column = ctrl.columns[c];
                if (column.template === undefined) {

                    let template = { type: column.type };
                    delete column.type;

                    if (column.format !== undefined) {
                        template.format = column.format;
                        delete column.format;
                    }

                    if (column.horizontalAlignment !== undefined) {
                        template.horizontalAlignment = column.horizontalAlignment;
                        delete column.horizontalAlignment;
                    }

                    if (column.verticalAlignment !== undefined) {
                        template.verticalAlignment = column.verticalAlignment;
                        delete column.verticalAlignment;
                    }

                    if (template.type === "TextBox") {
                        if (column.inputPattern !== undefined) {
                            template.inputPattern = column.inputPattern;
                            delete column.inputPattern;
                        }
                    }

                    if (template.type === "ComboBox") {
                        if (column.options !== undefined) {
                            template.options = column.options;
                            delete column.options;
                        }
                    }

                    column.template = template;
                }
            }
        }

        ctrl.isTarget = true;

        if (ctrl.type === "VariableTargetListBox")
            ctrl.type = "VariablesListBox";
        else if (ctrl.type === "TargetListBox")
            ctrl.type = "ListBox";

        upgradedCtrl = {
              type: "TargetLayoutBox"
        };

        if (ctrl.label !== undefined) {
            upgradedCtrl.label = ctrl.label;
            delete ctrl.label
        }

        upgradedCtrl.children = [ ctrl ];
    }

    if (ctrl.type === "ComboBox") {
        _upgraded = true;
        if (ctrl.options !== undefined) {
            for (let i = 0; i < ctrl.options.length; i++) {
                let option = ctrl.options[i];
                option.title = option.label;
                option.name = option.value;
                delete option.label;
                delete option.value;
            }
        }
    }

    if (ctrl.type === "CheckBox" || ctrl.type === "RadioButton") {
        if (ctrl.checkedValue !== undefined) {
            ctrl.focusValue = ctrl.checkedValue;
            delete ctrl.checkedValue;
            _upgraded = true;
        }
    }

    return upgradedCtrl;
};

module.exports = checkForLayoutUpgrade;
