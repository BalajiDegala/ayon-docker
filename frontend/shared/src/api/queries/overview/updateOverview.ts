import {
  foldersQueries,
  detailsPanelQueries,
  operationsApi,
  entityListsQueriesGql,
} from '@shared/api'
import type { OperationsResponseModel, OperationModel, OperationsApiArg } from '@shared/api'
import getOverviewApi from './getOverview'
import { DetailsPanelEntityData, DetailsPanelEntityType } from '@shared/api/queries/entities'
import { FetchBaseQueryError, RootState } from '@reduxjs/toolkit/query'
import { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit'
import { EditorTaskNode } from '@shared/containers/ProjectTreeTable'
// these operations are dedicated to the overview page
// this mean cache updates are custom for the overview page here

// Helper function to update entities with operation data
const updateEntityWithOperation = (entity: any, operationData: any) => {
  const newData = {
    ...entity,
    ...operationData,
    attrib: {
      ...entity.attrib,
      ...(operationData?.attrib || {}),
    },
  }

  // patch data onto the entity
  Object.assign(entity, newData)
}

const getOverviewTaskTags = (tasks: Pick<OperationModel, 'entityId' | 'data'>[]) => {
  return [
    { type: 'overviewTask', id: 'LIST' },
    ...tasks.map((op) => ({ type: 'overviewTask', id: op.entityId })),
    // we also add the projectName so that tasks that do not exist in the cache can still invalidate
    ...tasks
      .filter((op) => op.data?.projectName)
      .map((op) => ({
        type: 'overviewTask',
        id: op.data?.projectName,
      })),
  ]
}

const getOverviewFolderTags = (folders: Pick<OperationModel, 'entityId' | 'data'>[]) => {
  return [
    ...folders.map((op) => ({ type: 'folder', id: op.entityId })),
    // we also add the projectName so that tasks that do not exist in the cache can still invalidate
    ...folders
      .filter((op) => op.data?.projectName)
      .map((op) => ({
        type: 'folder',
        id: op.data?.projectName,
      })),
  ]
}

export type PatchOperation = Pick<OperationModel, 'entityId' | 'entityType' | 'data'> & {
  type?: OperationModel['type']
}

export const patchOverviewTasks = (
  tasks: PatchOperation[],
  {
    state,
    dispatch,
  }: {
    state: RootState<any, any, 'restApi'>
    dispatch: ThunkDispatch<any, any, UnknownAction>
  },
  patches?: any[],
) => {
  const tags = getOverviewTaskTags(tasks)
  const taskEntries = getOverviewApi.util.selectInvalidatedBy(state, tags)

  for (const entry of taskEntries) {
    if (entry.endpointName === 'getTasksListInfinite') {
      // patch getTasksListInfinite
      const tasksPatch = dispatch(
        getOverviewApi.util.updateQueryData('getTasksListInfinite', entry.originalArgs, (draft) => {
          // Apply each change to matching tasks in all pages
          for (const taskOperation of tasks) {
            if (taskOperation.type === 'create' && taskOperation.data) {
              // push operation data to first page
              // @ts-expect-error
              draft.pages[0].tasks.push(taskOperation.data)
            } else {
              // Iterate through all pages in the infinite query
              for (const page of draft.pages) {
                const task = page.tasks.find((task) => task.id === taskOperation.entityId)
                if (task) {
                  updateEntityWithOperation(task, taskOperation.data)
                }
              }
            }
          }
        }),
      )

      // add the patch to the list of patches
      patches?.push(tasksPatch)
    } else {
      // this updates the main overview cache task
      // it also updates any GetTasksByParent caches
      const tasksPatch = dispatch(
        getOverviewApi.util.updateQueryData(
          entry.endpointName as 'getOverviewTasksByFolders' | 'GetTasksByParent' | 'GetTasksList',
          entry.originalArgs,
          (draft) => {
            // Apply each change to matching tasks in the cache
            for (const taskOperation of tasks) {
              if (
                taskOperation.type === 'create' &&
                taskOperation.data &&
                entry.originalArgs.parentIds.includes(taskOperation.data.folderId)
              ) {
                const patchTask = (tasksArrayDraft: EditorTaskNode[]) => {
                  // @ts-expect-error
                  tasksArrayDraft.push(taskOperation.data)
                }

                // Check if draft is an array or an object with a tasks property
                if (Array.isArray(draft)) {
                  patchTask(draft)
                } else if (draft.tasks && Array.isArray(draft.tasks)) {
                  // Handle object with tasks array case (like in GetTasksList)
                  const draftArray = draft.tasks
                  patchTask(draftArray)
                }
              } else {
                const patchTask = (tasksArrayDraft: EditorTaskNode[]) => {
                  const task = tasksArrayDraft.find((task) => task.id === taskOperation.entityId)
                  if (task) {
                    updateEntityWithOperation(task, taskOperation.data)
                  }
                }

                // Check if draft is an array or an object with a tasks property
                if (Array.isArray(draft)) {
                  patchTask(draft)
                } else if (draft.tasks && Array.isArray(draft.tasks)) {
                  // Handle object with tasks array case (like in GetTasksList)
                  const draftArray = draft.tasks
                  patchTask(draftArray)
                }
              }
            }
          },
        ),
      )
      // add the patch to the list of patches
      patches?.push(tasksPatch)
    }
  }
}

const invalidateOverviewTasks = (
  tasks: PatchOperation[],
  {
    dispatch,
  }: {
    dispatch: ThunkDispatch<any, any, UnknownAction>
  },
) => {
  if (!tasks.length) return
  dispatch(getOverviewApi.util.invalidateTags(getOverviewTaskTags(tasks)))
}

export const patchOverviewFolders = (
  folders: PatchOperation[],
  {
    state,
    dispatch,
  }: {
    state: RootState<any, any, 'restApi'>
    dispatch: ThunkDispatch<any, any, UnknownAction>
  },
  patches?: any[],
) => {
  const folderEntries = foldersQueries.util
    .selectInvalidatedBy(state, getOverviewFolderTags(folders))
    .filter((entry) => entry.endpointName === 'getFolderList')
  for (const entry of folderEntries) {
    const folderPatch = dispatch(
      foldersQueries.util.updateQueryData(
        entry.endpointName as 'getFolderList',
        entry.originalArgs,
        (draft) => {
          // Create a Map for O(1) folder lookups
          const folderMap = new Map()
          draft.folders.forEach((folder) => {
            folderMap.set(folder.id, folder)
          })

          for (const folderOperation of folders) {
            if (folderOperation.type === 'create' && folderOperation.data) {
              // push operation data to first page
              // @ts-expect-error
              draft.folders.push(folderOperation.data)
            } else {
              const folder = folderMap.get(folderOperation.entityId)

              if (folder) {
                updateEntityWithOperation(folder, folderOperation.data)
              }
            }
          }
        },
      ),
    )
    //   add the patch to the list of patches
    patches?.push(folderPatch)
  }
}

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T

const operationDataToDetailsData = (
  data: Record<string, any>,
  entityType: DetailsPanelEntityType,
): DeepPartial<DetailsPanelEntityData> => {
  const sharedData: DeepPartial<DetailsPanelEntityData> = {
    name: data.name,
    attrib: data.attrib,
    status: data.status,
    tags: data.tags,
    label: data.label,
    updatedAt: data.updatedAt,
    createdAt: data.createdAt,
    hasReviewables: data.hasReviewables,
    thumbnailId: data.thumbnailId,
  }

  switch (entityType) {
    case 'task':
      return {
        ...sharedData,
        task: {
          assignees: data.assignees,
          label: data.label,
          name: data.name,
          taskType: data.taskType,
        },
      }
    case 'folder':
      return {
        ...sharedData,
        folder: {
          id: data.id,
          name: data.name,
          label: data.label,
          folderType: data.folderType,
        },
      }
    case 'version':
      return {
        ...sharedData,
        version: {
          id: data.id,
          name: data.name,
        },
      }
    case 'representation':
      return {
        ...sharedData,
      }
  }
}

export const patchDetailsPanelEntity = (
  operations: PatchOperation[] = [],
  draft: DetailsPanelEntityData,
) => {
  // find the entity we are updating from the draft
  const operation = operations.find((op) => op.entityId === draft.id)
  const operationData = operation?.data

  if (!operationData || operation.entityType === 'product' || operation.entityType === 'workfile')
    return console.warn('No operation data found or entity type not supported')

  // transform the data to match the details panel entity data
  const detailsPanelData = operationDataToDetailsData(operationData, operation.entityType)

  // helper to deep‐clean undefined values
  function cleanUndefined(obj: any): void {
    Object.entries(obj).forEach(([key, val]) => {
      if (val === undefined) {
        delete obj[key]
      } else if (val !== null && typeof val === 'object') {
        cleanUndefined(val)
      }
    })
  }

  // remove all undefineds at root and nested levels
  cleanUndefined(detailsPanelData as Record<string, any>)

  const newData: DeepPartial<DetailsPanelEntityData> = {
    ...draft,
    ...detailsPanelData,
    attrib: {
      ...(draft?.attrib || {}),
      ...detailsPanelData.attrib,
    },
    folder: {
      ...(draft?.folder || {}),
      ...detailsPanelData.folder,
    },
    task: {
      ...(draft?.task || {}),
      ...detailsPanelData.task,
    },
    version: {
      ...(draft?.version || {}),
      ...detailsPanelData.version,
    },
  }

  // patch data onto the entity
  Object.assign(draft, newData)
}

const patchListItems = (
  entities: PatchOperation[],
  {
    state,
    dispatch,
  }: {
    state: RootState<any, any, 'restApi'>
    dispatch: ThunkDispatch<any, any, UnknownAction>
  },
  patches?: any[],
) => {
  const tags = entities.map((op) => ({ type: 'entityListItem', id: op.entityId }))
  const entries = entityListsQueriesGql.util.selectInvalidatedBy(state, tags)

  for (const entry of entries) {
    if (entry.endpointName === 'getListItemsInfinite') {
      const listItemsPatch = dispatch(
        entityListsQueriesGql.util.updateQueryData(
          'getListItemsInfinite',
          entry.originalArgs,
          (draft) => {
            // Apply each change to matching tasks in all pages
            for (const listOperation of entities) {
              if (listOperation.type === 'update' && listOperation.data) {
                // Iterate through all pages in the infinite query
                for (const page of draft.pages) {
                  const item = page.items.find((item) => item.entityId === listOperation.entityId)
                  if (item) {
                    updateEntityWithOperation(item, listOperation.data)
                  }
                }
              }
            }
          },
        ),
      )

      // add the patch to the list of patches
      patches?.push(listItemsPatch)
    }
  }
}

const splitByOpType = (operations: OperationModel[]) => {
  return operations.reduce(
    (acc: Record<OperationModel['type'], OperationModel[]>, operation) => {
      acc[operation.type].push(operation)
      return acc
    },
    {
      create: [],
      update: [],
      delete: [],
    },
  )
}

const operationsEnhanced = operationsApi.enhanceEndpoints({
  endpoints: {
    operations: {},
  },
})

// enhance the argument type to include some extra fields
interface UpdateOverviewEntitiesArg extends OperationsApiArg {
  patchOperations?: PatchOperation[] // extra entities to patch
}

const operationsApiEnhancedInjected = operationsEnhanced.injectEndpoints({
  endpoints: (build) => ({
    updateOverviewEntities: build.mutation<
      OperationsResponseModel | undefined,
      UpdateOverviewEntitiesArg
    >({
      async queryFn(arg, { dispatch }) {
        try {
          const result = await dispatch(operationsEnhanced.endpoints.operations.initiate(arg))

          const data = result.data
          // check for any errors in the result
          const uniqueErrors = new Set()
          const uniqueErrorCodes = new Set()
          for (const op of data?.operations || []) {
            if (op.success === false && op.detail) {
              if (!uniqueErrors.has(op.detail)) {
                uniqueErrors.add(op.detail)
              }
              if (!uniqueErrorCodes.has(op.errorCode)) {
                uniqueErrorCodes.add(op.errorCode)
              }
            }
          }

          if (uniqueErrors.size > 0) {
            const error = {
              status: 'FETCH_ERROR',
              error: Array.from(uniqueErrors).join(', '),
              errorCodes: Array.from(uniqueErrorCodes),
            } as FetchBaseQueryError
            return { error }
          } else {
            return { data }
          }
        } catch (e: any) {
          console.error(e)
          const error = { status: 'FETCH_ERROR', error: e.message } as FetchBaseQueryError
          return { error }
        }
      },
      async onQueryStarted(
        { operationsRequestModel, patchOperations = [] },
        { dispatch, queryFulfilled, getState },
      ) {
        if (!operationsRequestModel.operations?.length) return
        const { operations } = operationsRequestModel
        // we need to split the operations by entity type
        const operationsByType = operations.reduce(
          (acc: Record<OperationModel['entityType'], OperationModel[]>, operation) => {
            acc[operation.entityType].push(operation)
            return acc
          },
          {
            task: [],
            folder: [],
            product: [],
            version: [],
            representation: [],
            workfile: [],
          },
        )

        // collect patches incase we need to undo them
        const state = getState()
        const patches: any[] = []

        // patch the overview tasks
        if (operationsByType.task?.length) {
          // split operations by operation type
          const { delete: deleteOps, update } = splitByOpType(operationsByType.task)
          // filter out updates that are in updateToPatch as we patch them later on
          const updatesToPatch = update.filter(
            (op) => !patchOperations.some((dep) => dep.entityId === op.entityId),
          )
          // update existing tasks
          patchOverviewTasks(updatesToPatch, { state, dispatch }, patches)
          // invalidate the caches for tasks being created and deleted
          invalidateOverviewTasks([...deleteOps], {
            dispatch,
          })
        }

        // patch the overview folders (any other folders from foldersList)
        if (operationsByType.folder?.length) {
          // split operations by operation type
          const { delete: deleteOps, update } = splitByOpType(operationsByType.folder)
          // filter out updates that are in updateToPatch as we patch them later on
          const updatesToPatch = update.filter(
            (op) => !patchOperations.some((dep) => dep.entityId === op.entityId),
          )
          // update existing folders
          patchOverviewFolders(updatesToPatch, { state, dispatch }, patches)
          // invalidate the caches for folders being created and deleted
          if (deleteOps.length) {
            dispatch(foldersQueries.util.invalidateTags([{ type: 'folder', id: 'LIST' }]))
          }
        }

        const patchExtraTasks = patchOperations.filter((op) => op.entityType === 'task')
        const patchExtraFolders = patchOperations.filter((op) => op.entityType === 'folder')

        if (patchExtraTasks.length) {
          // often used for updating inherited dependents
          patchOverviewTasks(patchExtraTasks, { state, dispatch }, patches)
        }

        if (patchExtraFolders.length) {
          // often used for updating inherited dependents
          patchOverviewFolders(patchExtraFolders, { state, dispatch }, patches)
        }

        // patch the list items
        patchListItems([...operations, ...patchOperations], { state, dispatch }, patches)

        // try to patch any details panels
        // first we patch the individual entities
        // then we patch the details panel cache
        const entityTags = operations.map((op) => ({
          id: op.entityId,
          type: op.entityType,
        }))
        const entitiesTags = entityTags.map((tag) => ({
          type: 'entities',
          id: tag.id,
        }))

        // invalidates the details panel cache so that it fetches all individual entities again (using it's updated cache)
        const invalidateEntryPanel = () =>
          dispatch(detailsPanelQueries.util.invalidateTags(entitiesTags))

        // the individual entities that are patched for the details panel
        // remember the details panel cache is made up of individual entity caches
        const detailsPanelEntityCaches = detailsPanelQueries.util.selectInvalidatedBy(
          state,
          entityTags,
        )

        // the cache for the whole details panel
        const detailsPanelEntitiesCaches = detailsPanelQueries.util.selectInvalidatedBy(
          state,
          entitiesTags,
        )

        for (const entry of detailsPanelEntitiesCaches) {
          if (entry.endpointName !== 'getEntitiesDetailsPanel') continue
          const entitiesDetailsResult = dispatch(
            detailsPanelQueries.util.updateQueryData(
              entry.endpointName as 'getEntitiesDetailsPanel',
              entry.originalArgs,
              (draft) => {
                for (const entity of draft) {
                  patchDetailsPanelEntity(operations, entity)
                }
              },
            ),
          )

          // add the patch to the list of patches
          patches.push(entitiesDetailsResult)
        }

        try {
          await queryFulfilled
        } catch (error) {
          // undo all patches if there is an error
          for (const patch of patches) {
            patch.undo()
          }

          if (detailsPanelEntityCaches.length) {
            // we invalidate the tags for the detailsPanelEntityCaches that were patched
            // invalidate the details panel cache
            invalidateEntryPanel()
          }
        }
      },
    }),
  }),
})

export const { useUpdateOverviewEntitiesMutation } = operationsApiEnhancedInjected
export { operationsApiEnhancedInjected as overviewQueries }
