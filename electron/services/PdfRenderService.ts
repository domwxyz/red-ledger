import { BrowserWindow } from 'electron'
import { marked } from 'marked'

interface RenderMarkdownPdfOptions {
  title?: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const markdownRenderer = new marked.Renderer()
markdownRenderer.html = () => ''

function buildDocumentHtml(contentHtml: string, title: string): string {
  const escapedTitle = escapeHtml(title)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"
  />
  <title>${escapedTitle}</title>
  <style>
    @page {
      size: A4;
      margin: 24mm 18mm;
    }

    html, body {
      font-family: "Segoe UI", Helvetica, Arial, sans-serif;
      color: #1f2937;
      line-height: 1.5;
      font-size: 12pt;
    }

    h1, h2, h3, h4, h5, h6 {
      color: #111827;
      margin-top: 1.6em;
      margin-bottom: 0.5em;
      page-break-after: avoid;
    }

    p, ul, ol, blockquote, table, pre {
      margin: 0 0 1em 0;
    }

    code {
      background: #f3f4f6;
      padding: 0.1em 0.3em;
      border-radius: 4px;
      font-family: "Consolas", "Courier New", monospace;
      font-size: 0.95em;
    }

    pre code {
      display: block;
      padding: 0.8em;
      overflow-x: auto;
    }

    blockquote {
      border-left: 3px solid #d1d5db;
      padding-left: 1em;
      color: #4b5563;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95em;
    }

    th, td {
      border: 1px solid #d1d5db;
      padding: 0.45em 0.6em;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #f3f4f6;
    }

    a {
      color: #1d4ed8;
      text-decoration: none;
    }
  </style>
</head>
<body>
${contentHtml}
</body>
</html>`
}

/**
 * Render markdown content to a PDF buffer using an offscreen BrowserWindow.
 */
export async function renderMarkdownToPdf(
  markdown: string,
  options: RenderMarkdownPdfOptions = {}
): Promise<Buffer> {
  const title = options.title?.trim() || 'Document'
  const markdownHtml = await Promise.resolve(marked.parse(markdown, {
    gfm: true,
    breaks: true,
    renderer: markdownRenderer
  }))
  const documentHtml = buildDocumentHtml(markdownHtml, title)

  const renderWindow = new BrowserWindow({
    show: false,
    width: 816,
    height: 1056,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  try {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(documentHtml)}`
    await renderWindow.loadURL(dataUrl)
    return await renderWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true
    })
  } finally {
    if (!renderWindow.isDestroyed()) {
      renderWindow.destroy()
    }
  }
}
