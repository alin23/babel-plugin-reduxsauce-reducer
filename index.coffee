import { constantCase } from 'change-case'


isReducer = (path) -> (
    path.node.params.length is 2 and
    path.node.params[0].name is 'state' and
    (
        path.node.params[1].name is 'ctx' or
        path.node.params[1].type is 'ObjectPattern'
    )
)

getActionsDefinition = (action) ->
    action.getAllPrevSiblings().find (path) ->
        path.isExpressionStatement() and
        path.get('expression').isAssignmentExpression() and
        path.node.expression.left?.properties?[0]?.key?.name is 'Types' and
        path.node.expression.left?.properties?[1]?.key?.name is 'Creators'

getActionHandlersDefinition = (action) ->
    action.getAllNextSiblings().find (path) ->
        path.isExpressionStatement() and
        path.get('expression').isAssignmentExpression() and
        path.node.expression.left?.name is 'ACTION_HANDLERS'

export default ({ types: t, template }) ->
    actionsCode = template("""
    import { createActions, createReducer } from 'reduxsauce';

    var ACTIONS, ACTION_HANDLERS, Creators, Types;

    ACTIONS = {};
    ({ Types, Creators } = createActions(ACTIONS, { prefix: PREFIX }));

    export { Types };
    export default Creators;
    """, { sourceType: 'module', placeholderPattern: false })

    actionHandlersCode = template("""
    ACTION_HANDLERS = {};
    export var reducer = createReducer(INITIAL_STATE, ACTION_HANDLERS);
    """, { sourceType: 'module', placeholderPattern: false })
    {
        visitor: {
            FunctionExpression: (path) ->
                if not isReducer(path)
                    return

                action = path.findParent((path) -> path.isExpressionStatement())
                if not action?
                    return

                actionName = action.node.expression.left.name
                actionParams = if path.node.params[1].name is 'ctx'
                    t.nullLiteral()
                else
                    t.arrayExpression(
                        path.node.params[1].properties.map(
                            (prop) -> t.StringLiteral(prop.key.name)
                        )
                    )

                actionsDefinition = getActionsDefinition(action)
                actionHandlersDefinition = getActionHandlersDefinition(action)

                if not actionsDefinition?
                    action.insertBefore(actionsCode())
                    actionsDefinition = getActionsDefinition(action)

                actionObjectExpr = actionsDefinition.getPrevSibling()
                actionObjectExpr.node.expression.right.properties.push(
                    t.objectProperty(
                        t.identifier(actionName)
                        actionParams
                    )
                )

                if not actionHandlersDefinition?
                    siblings = action.getAllNextSiblings()
                    lastAction = siblings[siblings.length - 1] ? action
                    lastAction.insertAfter(actionHandlersCode())
                    actionHandlersDefinition = getActionHandlersDefinition(action)

                actionHandlersDefinition.node.expression.right.properties.push(
                    t.objectProperty(
                        t.templateLiteral(
                            [
                                t.templateElement({ raw: '', cooked: '' }, false)
                                t.templateElement({ raw: '', cooked: '' }, true)
                            ]
                            [t.memberExpression(
                                t.identifier('Types')
                                t.identifier(constantCase(actionName))
                            )]
                        )
                        t.identifier(actionName)
                        true
                    )
                )

                return
        }
    }
