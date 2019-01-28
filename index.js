const { constant, pascal } = require('change-case')

function isReducer(path) {
    return (
        path.node.params.length === 2 &&
        path.node.params[0].name === 'state' &&
        (path.node.params[1].name === 'ctx' || path.node.params[1].type === 'ObjectPattern')
    )
}

function getActionsDefinition(action) {
    let actionDeclaration = action
        .getAllPrevSiblings()
        .find(
            (path) =>
                path.isVariableDeclaration() &&
                path.node.declarations[0].id.name === 'ACTIONS'
        )

    if (actionDeclaration) {
        return actionDeclaration.node.declarations[0].init
    }
    return null
}

function getActionHandlersDefinition(action) {
    let actionDeclaration = action
        .getAllNextSiblings()
        .find(
            (path) =>
                path.isVariableDeclaration() &&
                path.node.declarations[0].id.name === 'ACTION_HANDLERS'
        )

    if (actionDeclaration) {
        return actionDeclaration.node.declarations[0].init
    }
    return null
}

const globals = {
    actionsDefinition: null,
    actionHandlersDefinition: null,
    prefix: null
}

module.exports = function({ types: t, template }) {
    const importCode = template(
        `
import { createActions, createReducer } from 'reduxsauce';
`,
        { sourceType: 'module', placeholderPattern: false }
    )
    const exportCode = template(
        `
var ACTIONS = Creators;
export { Types as TYPES };
export default ACTIONS;
`,
        { sourceType: 'module' }
    )
    const actionsCode = template(
        `
var ACTIONS = {};
var Types, Creators;
({ Types, Creators } = createActions(ACTIONS, { prefix: PREFIX }));
`,
        { sourceType: 'module', placeholderPattern: false }
    )

    const actionHandlersCode = template(
        `
var ACTION_HANDLERS = {};
export var reducer = createReducer(INITIAL_STATE, ACTION_HANDLERS);
`,
        { sourceType: 'module', placeholderPattern: false }
    )
    const actionCode = template(
        `
function ACTION_NAME(state, {STATE_PROP}) {
    return Object.assign({}, state, {STATE_PROP});
}
`,
        { sourceType: 'module' }
    )
    return {
        visitor: {
            Program: {
                exit(path) {
                    const initialState = path
                        .get('body')
                        .find(
                            (pth) =>
                                pth.isVariableDeclaration() &&
                                pth.node.declarations[0].id.name === 'INITIAL_STATE'
                        )

                    if (!initialState) {
                        return
                    }
                    path.get('body.0').insertBefore(importCode())

                    const prefix = pascal(globals.prefix.replace('/', ''))
                    path.get(`body.${path.node.body.length - 1}`).insertAfter(
                        exportCode({
                            ACTIONS: t.identifier(`${prefix}Actions`),
                            TYPES: t.identifier(`${prefix}Types`)
                        })
                    )
                }
            },
            VariableDeclaration(path) {
                if (path.node.declarations[0].id.name === 'PREFIX') {
                    globals.prefix = path.node.declarations[0].init.value
                }

                if (
                    path.node.declarations[0].id.name === 'INITIAL_STATE' &&
                    path.get('declarations.0.init').isCallExpression() &&
                    path.node.declarations[0].init.callee.name === 'Immutable'
                ) {
                    path.insertBefore(actionsCode())

                    globals.actionsDefinition = getActionsDefinition(path)
                    const state = path.node.declarations[0].init.arguments[0].properties
                    for (let prop of state) {
                        path.insertAfter(
                            actionCode({
                                ACTION_NAME: t.identifier(`set${pascal(prop.key.name)}`),
                                STATE_PROP: t.identifier(prop.key.name)
                            })
                        )
                    }
                }
            },
            FunctionDeclaration(path) {
                if (!isReducer(path)) {
                    return
                }

                let action = path
                const actionName = action.node.id.name
                let actionParams = t.nullLiteral()
                if (path.node.params[1].name !== 'ctx') {
                    actionParams = t.arrayExpression(
                        path.node.params[1].properties.map((prop) =>
                            t.StringLiteral(prop.key.name)
                        )
                    )
                }
                globals.actionsDefinition = getActionsDefinition(action)
                globals.actionHandlersDefinition = getActionHandlersDefinition(action)

                if (globals.actionsDefinition !== null) {
                    const actionProps = globals.actionsDefinition.properties
                    if (!actionProps.find((prop) => prop.key.name === actionName)) {
                        actionProps.push(
                            t.objectProperty(t.identifier(actionName), actionParams)
                        )
                    }
                }

                if (globals.actionHandlersDefinition === null) {
                    const siblings = action.getAllNextSiblings()
                    let lastAction = siblings[siblings.length - 1]
                    if (lastAction === null || typeof lastAction === 'undefined') {
                        lastAction = action
                    }
                    lastAction.insertAfter(actionHandlersCode())
                    globals.actionHandlersDefinition = getActionHandlersDefinition(action)
                }

                const handler = t.objectProperty(
                    t.templateLiteral(
                        [
                            t.templateElement({ raw: '', cooked: '' }, false),
                            t.templateElement({ raw: '', cooked: '' }, true)
                        ],
                        [
                            t.memberExpression(
                                t.identifier('Types'),
                                t.identifier(constant(actionName))
                            )
                        ]
                    ),
                    t.identifier(actionName),
                    true
                )

                const handlers = globals.actionHandlersDefinition.properties
                if (handlers === null) {
                    globals.actionHandlersDefinition.properties = [handler]
                } else if (!handlers.find((prop) => prop.value.name === actionName)) {
                    handlers.push(handler)
                }
            }
        }
    }
}
