import { marked, Renderer, type Tokens } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const safeExternalUrl = (href: string) => {
  try {
    const url = new URL(href)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

export const renderSafeMarkdown = (source: string) => {
  const renderer = new Renderer()

  // Agent output is untrusted. Raw HTML is never needed for Markdown semantics.
  renderer.html = () => ''
  renderer.image = ({ text }: Tokens.Image) => escapeAttribute(text)
  renderer.link = function ({ href, title, tokens }: Tokens.Link) {
    const text = this.parser.parseInline(tokens)
    const safeHref = safeExternalUrl(href)
    if (!safeHref) return text
    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : ''
    return `<a href="${escapeAttribute(safeHref)}"${titleAttribute} target="_blank" rel="noreferrer noopener">${text}</a>`
  }

  return marked.parse(source, { async: false, renderer }) as string
}
