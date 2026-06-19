import { createRequestHandlers } from '../../../../lib/dispatch/dispatch.ts'
import type { AppInvocationContext } from '../types/context.ts'
import {
  createAcceptInvitationHandler,
  createInviteMemberHandler,
  createRejectInvitationHandler
} from './invitations.ts'
import {
  createDeleteTaskHandler,
  createTaskHandler,
  createUpdateTaskHandler
} from './tasks.ts'
import {
  createCreateWorkspaceHandler,
  createLoadAppHandler
} from './workspaces.ts'

const handlerFactories = [
  createLoadAppHandler,
  createCreateWorkspaceHandler,
  createInviteMemberHandler,
  createAcceptInvitationHandler,
  createRejectInvitationHandler,
  createTaskHandler,
  createUpdateTaskHandler,
  createDeleteTaskHandler
]

export const createAppRequestHandlers = (context: AppInvocationContext) => (
  createRequestHandlers(handlerFactories.map((factory) => ({
    identifier: factory.requestIdentifier,
    handler: factory(context)
  })))
)
