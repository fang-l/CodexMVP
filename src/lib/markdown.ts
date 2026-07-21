import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

export const renderSafeMarkdown = (source: string) => {
  const html = marked.parse(source, { async: false }) as string
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script, style, iframe, object, embed, form').forEach((node) => node.remove())
  document.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on') || name === 'style' || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
        node.removeAttribute(attribute.name)
      }
    }
    if (node instanceof HTMLAnchorElement) {
      node.target = '_blank'
      node.rel = 'noreferrer noopener'
    }
  })
  return document.body.innerHTML
}
