export const DEFAULT_CHAT_TITLE = 'New Chat'
export const DEFAULT_CHAT_TITLE_MAX_LENGTH = 80

export function sanitizeGeneratedChatTitle(
  rawTitle: string | null | undefined,
  maxLength = DEFAULT_CHAT_TITLE_MAX_LENGTH
): string | null {
  if (!rawTitle) return null

  const firstLine = rawTitle
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) return null

  let title = firstLine
    .replace(/^title\s*[:-]\s*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/g, '')
    .trim()

  if (!title) return null

  if (title.length > maxLength) {
    title = title.slice(0, maxLength).trim()
  }

  return title.length > 0 ? title : null
}
