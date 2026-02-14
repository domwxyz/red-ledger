import { useState, useCallback } from 'react'
import { Copy, Check, RotateCcw, GitFork } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Action Descriptor ───────────────────────────────────────────────────────

export interface MessageAction {
  /** Unique key for React rendering. */
  key: string
  /** Lucide icon component. */
  icon: LucideIcon
  /** Tooltip text. */
  label: string
  /** Handler invoked on click. */
  onClick: () => void
}

// ─── Pre-built Action Factories ──────────────────────────────────────────────

/** Copy plain text to clipboard. Returns a MessageAction descriptor. */
export function useCopyAction(text: string): MessageAction {
  const [copied, setCopied] = useState(false)

  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be denied by the environment/user permissions.
    }
  }, [text])

  return {
    key: 'copy',
    icon: copied ? Check : Copy,
    label: copied ? 'Copied!' : 'Copy',
    onClick
  }
}

/** Retry action — just wraps a callback. */
export function retryAction(onRetry: () => void): MessageAction {
  return {
    key: 'retry',
    icon: RotateCcw,
    label: 'Retry',
    onClick: onRetry
  }
}

/** Fork action - starts a new chat from this message context. */
export function forkAction(onFork: () => void): MessageAction {
  return {
    key: 'fork',
    icon: GitFork,
    label: 'Fork Chat',
    onClick: onFork
  }
}

// ─── Toolbar Component ───────────────────────────────────────────────────────

interface MessageActionsBarProps {
  actions: MessageAction[]
  /** 'left' for assistant messages, 'right' for user messages. */
  align: 'left' | 'right'
}

/**
 * A small row of icon-only buttons rendered beneath a message bubble.
 * Visibility is controlled by a parent hover state (CSS class `group`).
 */
export function MessageActionsBar({ actions, align }: MessageActionsBarProps) {
  if (actions.length === 0) return null

  return (
    <div
      className={`message-actions flex items-center gap-0.5 mt-0.5 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.key}
            onClick={action.onClick}
            className="message-action-btn"
            title={action.label}
          >
            <Icon size={13} />
          </button>
        )
      })}
    </div>
  )
}
