// create table data for the hierarchy
import { SimpleTableRow } from '@shared/SimpleTable'
import { useGetFolderListQuery } from '@shared/api'
import type { FolderType, FolderListItem } from '@shared/api'
import { useCallback, useMemo } from 'react'

type Props = {
  projectName: string | null
  folderTypes: FolderType[]
}

const useHierarchyTable = ({ projectName, folderTypes }: Props) => {
  const { data: { folders = [] } = {}, isFetching } = useGetFolderListQuery(
    { projectName: projectName || '', attrib: true },
    { skip: !projectName },
  )

  const getFolderIcon = (type: string) => {
    const folderType = folderTypes.find((folderType) => folderType.name === type)
    return folderType?.icon || 'folder'
  }

  const folderToTableRow = (folder: FolderListItem): Omit<SimpleTableRow, 'subRows'> => ({
    id: folder.id,
    parentId: folder.parentId,
    name: folder.name,
    label: folder.label || folder.name,
    icon: getFolderIcon(folder.folderType),
    img: null,
    data: {
      id: folder.id,
      name: folder.name,
      label: folder.label || folder.name,
      subType: folder.folderType,
    },
  })

  const createDataTree = <T extends FolderListItem>(
    items: T[],
    elementId: keyof T = 'id' as keyof T,
    parentId: keyof T = 'parentId' as keyof T,
  ): SimpleTableRow[] => {
    // Use Map instead of Object.create(null)
    const hashTable = new Map<string, SimpleTableRow>()
    const dataTree: SimpleTableRow[] = []

    // sort folders by name
    const sortedItems = [...items].sort((a, b) =>
      (a.label || a.name).localeCompare(b.label || b.name),
    )

    // Single pass to create base rows and store in Map
    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i]
      const id = item[elementId] as string
      const row: SimpleTableRow = {
        ...folderToTableRow(item),
        subRows: [],
      }
      hashTable.set(id, row)
    }

    // Single pass to build relationships
    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i]
      const id = item[elementId] as string
      const parentValue = item[parentId] as string
      const row = hashTable.get(id)!

      if (parentValue) {
        const parentRow = hashTable.get(parentValue)
        if (parentRow) {
          parentRow.subRows.push(row)
        }
      } else {
        dataTree.push(row)
      }
    }

    return dataTree
  }

  const tableData: SimpleTableRow[] = useMemo(() => {
    if (!folders.length || isFetching) return []

    const rows = createDataTree(folders)

    return rows
  }, [folders, folderTypes, isFetching])

  const getHierarchyData = useCallback(async () => {
    return tableData
  }, [tableData])

  return { data: tableData, getData: getHierarchyData, isFetching: isFetching }
}

export default useHierarchyTable
