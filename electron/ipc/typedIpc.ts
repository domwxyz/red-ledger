/**
 * Type-safe wrappers around Electron's IPC.
 * Ensures main-process handlers and preload callers agree on types
 * via the central IpcContract.
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcChannel, IpcParams, IpcResult } from './contract'

/**
 * Register a typed ipcMain.handle handler.
 * The channel, parameter types, and return type are all enforced
 * by the IpcContract definition.
 */
export function handleIpc<C extends IpcChannel>(
  channel: C,
  handler: (event: IpcMainInvokeEvent, ...args: IpcParams<C>) => Promise<IpcResult<C>> | IpcResult<C>
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ipcMain.handle(channel, handler as any)
}
