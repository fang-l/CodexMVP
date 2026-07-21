import { useMemo } from 'react'
import { renderSafeMarkdown } from '../lib/markdown'

export function Markdown({ children }: { children: string }) {
  const html = useMemo(() => renderSafeMarkdown(children), [children])
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
