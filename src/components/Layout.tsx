import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Sidebar } from './Sidebar'
import { ChatPanel } from './Chat/ChatPanel'
import { ContextPanel } from './Context/ContextPanel'

export function Layout() {
  return (
    <PanelGroup direction="horizontal" className="h-full w-full">
      {/* Left Sidebar */}
      <Panel defaultSize={20} minSize={15} maxSize={30}>
        <Sidebar />
      </Panel>

      <PanelResizeHandle className="pane-divider w-1" />

      {/* Center Chat */}
      <Panel defaultSize={50} minSize={30}>
        <ChatPanel />
      </Panel>

      <PanelResizeHandle className="pane-divider w-1" />

      {/* Right Context */}
      <Panel defaultSize={30} minSize={20} maxSize={40}>
        <ContextPanel />
      </Panel>
    </PanelGroup>
  )
}
