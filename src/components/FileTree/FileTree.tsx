import type { FileNode } from '@/types'
import { FileTreeItem } from './FileTreeItem'

interface FileTreeProps {
  nodes: FileNode[]
  depth?: number
}

export function FileTree({ nodes, depth = 0 }: FileTreeProps) {
  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      {nodes.map((node) => (
        <FileTreeItem key={node.path} node={node} depth={depth} />
      ))}
    </div>
  )
}
