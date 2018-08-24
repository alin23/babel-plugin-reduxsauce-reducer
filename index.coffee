import { constant, pascal } from "change-case"

isReducer = (path) ->
    path.node.params.length is 2 and
    path.node.params[0].name is "state" and
    (path.node.params[1].name is "ctx" or path.node.params[1].type is "ObjectPattern")

getActionsDefinition = (action) ->
    action
        .getAllPrevSiblings()
        .find((path) ->
            path.isExpressionStatement() and
            path.get("expression").isAssignmentExpression() and
            path.node.expression.left.name is "ACTIONS")

getActionHandlersDefinition = (action) ->
    action
        .getAllNextSiblings()
        .find((path) ->
            path.isExpressionStatement() and
            path.get("expression").isAssignmentExpression() and
            path.node.expression.left?.name is "ACTION_HANDLERS")

actionsDefinition = null
actionObjectExpr = null
actionHandlersDefinition = null

export default ({ types: t, template }) ->
    importCode = template(
        """
        import { createActions, createReducer } from 'reduxsauce';
        var ACTIONS, ACTION_HANDLERS, Creators, Types;
        """
        sourceType: "module", placeholderPattern: false
    )
    exportCode = template(
        """
        export { Types };
        export default Creators;
        """
        sourceType: "module", placeholderPattern: false
    )
    actionsCode = template(
        """
        ACTIONS = {};
        ({ Types, Creators } = createActions(ACTIONS, { prefix: PREFIX }));
        """
        sourceType: "module", placeholderPattern: false
    )

    actionHandlersCode = template(
        """
        ACTION_HANDLERS = {};
        export var reducer = createReducer(INITIAL_STATE, ACTION_HANDLERS);
        """
        sourceType: "module", placeholderPattern: false
    )
    actionCode = template(
        """
        if (typeof ACTION_NAME == 'undefined') {
            var ACTION_NAME = null;
        }

        ACTION_NAME = function(state, {STATE_PROP}) {
            return Object.assign({}, state, {STATE_PROP})
        };
        """
        sourceType: "module"
    )
    visitor:
        Program:
            exit: (path) ->
                if (
                    not path
                        .get("body")
                        .find((path) ->
                            path.isExpressionStatement() and
                            path.get("expression").isAssignmentExpression() and
                            path.node.expression.left.name is "INITIAL_STATE")
                )
                    return
                path.get("body.0").insertBefore(importCode())
                path.get("body.#{ path.node.body.length - 1 }").insertAfter(exportCode())
                return
        AssignmentExpression: (path) ->
            if (
                path.node.left.name is "INITIAL_STATE" and
                path.get("right").isCallExpression() and
                path.node.right.callee.name is "Immutable"
            )
                path.insertBefore(actionsCode())
                actionsDefinition = getActionsDefinition(path)
                state = path.node.right.arguments[0].properties
                for prop in state
                    path.insertAfter(
                        actionCode(
                            ACTION_NAME: t.identifier("set#{ pascal(prop.key.name) }")
                            STATE_PROP: t.identifier(prop.key.name)
                        )
                    )
            return
        FunctionExpression: (path) ->
            if not isReducer(path)
                return

            action = path.findParent((path) -> path.isExpressionStatement())
            if not action?
                return

            actionName = action.node.expression.left.name
            actionParams =
                if path.node.params[1].name is "ctx"
                    t.nullLiteral()
                else
                    t.arrayExpression(
                        path.node.params[1].properties.map((prop) ->
                            t.StringLiteral(prop.key.name))
                    )

            actionsDefinition = getActionsDefinition(action)
            actionHandlersDefinition = getActionHandlersDefinition(action)

            if actionsDefinition?
                actionProps = actionsDefinition.node.expression.right.properties
                if not actionProps.find((prop) -> prop.key.name is actionName)
                    actionProps.push(t.objectProperty(t.identifier(actionName), actionParams))

            if not actionHandlersDefinition?
                siblings = action.getAllNextSiblings()
                lastAction = siblings[siblings.length - 1] ? action
                lastAction.insertAfter(actionHandlersCode())
                actionHandlersDefinition = getActionHandlersDefinition(action)
                globalActionHandlersDefinition = actionHandlersDefinition

            handler = t.objectProperty(
                t.templateLiteral(
                    [
                        t.templateElement({ raw: "", cooked: "" }, false)
                        t.templateElement({ raw: "", cooked: "" }, true)
                    ]
                    [
                        t.memberExpression(
                            t.identifier("Types")
                            t.identifier(constant(actionName))
                        )
                    ]
                )
                t.identifier(actionName)
                true
            )

            handlers = actionHandlersDefinition.node.expression.right.properties
            if not handlers?
                actionHandlersDefinition.node.expression.right.properties = [handler]
            else if not handlers.find((prop) -> prop.value.name is actionName)
                handlers.push(handler)

            return
