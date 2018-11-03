"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;

var _changeCase = require("change-case");

// Generated by CoffeeScript 2.3.2
var getActionHandlersDefinition, getActionsDefinition, globals, isReducer;

isReducer = function (path) {
  return path.node.params.length === 2 && path.node.params[0].name === "state" && (path.node.params[1].name === "ctx" || path.node.params[1].type === "ObjectPattern");
};

getActionsDefinition = function (action) {
  return action.getAllPrevSiblings().find(function (path) {
    return path.isExpressionStatement() && path.get("expression").isAssignmentExpression() && path.node.expression.left.name === "ACTIONS";
  });
};

getActionHandlersDefinition = function (action) {
  return action.getAllNextSiblings().find(function (path) {
    var ref;
    return path.isExpressionStatement() && path.get("expression").isAssignmentExpression() && ((ref = path.node.expression.left) != null ? ref.name : void 0) === "ACTION_HANDLERS";
  });
};

globals = {
  actionsDefinition: null,
  actionHandlersDefinition: null,
  prefix: null
};

function _default({
  types: t,
  template
}) {
  var actionCode, actionHandlersCode, actionsCode, exportCode, importCode;
  importCode = template("import { createActions, createReducer } from 'reduxsauce';\nvar ACTIONS, ACTION_HANDLERS, Creators, Types;", {
    sourceType: "module",
    placeholderPattern: false
  });
  exportCode = template("var ACTIONS = Creators;\nexport { Types as TYPES };\nexport default ACTIONS;", {
    sourceType: "module"
  });
  actionsCode = template("ACTIONS = {};\n({ Types, Creators } = createActions(ACTIONS, { prefix: PREFIX }));", {
    sourceType: "module",
    placeholderPattern: false
  });
  actionHandlersCode = template("ACTION_HANDLERS = {};\nexport var reducer = createReducer(INITIAL_STATE, ACTION_HANDLERS);", {
    sourceType: "module",
    placeholderPattern: false
  });
  actionCode = template("if (typeof ACTION_NAME == 'undefined') {\n    var ACTION_NAME = null;\n}\n\nACTION_NAME = function(state, {STATE_PROP}) {\n    return Object.assign({}, state, {STATE_PROP})\n};", {
    sourceType: "module"
  });
  return {
    visitor: {
      Program: {
        exit: function (path) {
          var prefix;

          if (!path.get("body").find(function (path) {
            return path.isExpressionStatement() && path.get("expression").isAssignmentExpression() && path.node.expression.left.name === "INITIAL_STATE";
          })) {
            return;
          }

          path.get("body.0").insertBefore(importCode());
          prefix = (0, _changeCase.pascal)(globals.prefix.replace("/", ""));
          path.get(`body.${path.node.body.length - 1}`).insertAfter(exportCode({
            ACTIONS: t.identifier(`${prefix}Actions`),
            TYPES: t.identifier(`${prefix}Types`)
          }));
        }
      },
      AssignmentExpression: function (path) {
        var i, len, prop, state;

        if (path.node.left.name === "PREFIX") {
          globals.prefix = path.node.right.value;
        }

        if (path.node.left.name === "INITIAL_STATE" && path.get("right").isCallExpression() && path.node.right.callee.name === "Immutable") {
          path.insertBefore(actionsCode());
          globals.actionsDefinition = getActionsDefinition(path);
          state = path.node.right.arguments[0].properties;

          for (i = 0, len = state.length; i < len; i++) {
            prop = state[i];
            path.insertAfter(actionCode({
              ACTION_NAME: t.identifier(`set${(0, _changeCase.pascal)(prop.key.name)}`),
              STATE_PROP: t.identifier(prop.key.name)
            }));
          }
        }
      },
      FunctionExpression: function (path) {
        var action, actionName, actionParams, actionProps, handler, handlers, lastAction, ref, siblings;

        if (!isReducer(path)) {
          return;
        }

        action = path.findParent(function (path) {
          return path.isExpressionStatement();
        });

        if (action == null) {
          return;
        }

        actionName = action.node.expression.left.name;
        actionParams = path.node.params[1].name === "ctx" ? t.nullLiteral() : t.arrayExpression(path.node.params[1].properties.map(function (prop) {
          return t.StringLiteral(prop.key.name);
        }));
        globals.actionsDefinition = getActionsDefinition(action);
        globals.actionHandlersDefinition = getActionHandlersDefinition(action);

        if (globals.actionsDefinition != null) {
          actionProps = globals.actionsDefinition.node.expression.right.properties;

          if (!actionProps.find(function (prop) {
            return prop.key.name === actionName;
          })) {
            actionProps.push(t.objectProperty(t.identifier(actionName), actionParams));
          }
        }

        if (globals.actionHandlersDefinition == null) {
          siblings = action.getAllNextSiblings();
          lastAction = (ref = siblings[siblings.length - 1]) != null ? ref : action;
          lastAction.insertAfter(actionHandlersCode());
          globals.actionHandlersDefinition = getActionHandlersDefinition(action);
        }

        handler = t.objectProperty(t.templateLiteral([t.templateElement({
          raw: "",
          cooked: ""
        }, false), t.templateElement({
          raw: "",
          cooked: ""
        }, true)], [t.memberExpression(t.identifier("Types"), t.identifier((0, _changeCase.constant)(actionName)))]), t.identifier(actionName), true);
        handlers = globals.actionHandlersDefinition.node.expression.right.properties;

        if (handlers == null) {
          globals.actionHandlersDefinition.node.expression.right.properties = [handler];
        } else if (!handlers.find(function (prop) {
          return prop.value.name === actionName;
        })) {
          handlers.push(handler);
        }
      }
    }
  };
}

;
//# sourceMappingURL=index.js.map
