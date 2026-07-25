import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderSafeMarkdown, safeExternalUrl } from './markdown'

describe('renderSafeMarkdown', () => {
  it('renders structural Markdown and safe HTTPS links', () => {
    const html = renderSafeMarkdown('# 标题\n- 列表\n[安全链接](https://example.com)')

    assert.match(html, /<h1>标题<\/h1>/)
    assert.match(html, /<li>列表/)
    assert.match(html, /href="https:\/\/example\.com\/"/)
    assert.match(html, /target="_blank"/)
    assert.match(html, /rel="noreferrer noopener"/)
  })

  it('removes raw HTML and strips dangerous link destinations', () => {
    const html = renderSafeMarkdown('<script>alert(1)</script>\n[危险链接](javascript:alert(1))')

    assert.doesNotMatch(html, /script/i)
    assert.doesNotMatch(html, /alert\(1\)/)
    assert.doesNotMatch(html, /javascript:/i)
    assert.match(html, /危险链接/)
  })
})

describe('safeExternalUrl', () => {
  it('only accepts HTTP and HTTPS URLs', () => {
    assert.equal(safeExternalUrl('https://example.com'), 'https://example.com/')
    assert.equal(safeExternalUrl('http://example.com/path'), 'http://example.com/path')
    assert.equal(safeExternalUrl('javascript:alert(1)'), undefined)
    assert.equal(safeExternalUrl('data:text/html,hello'), undefined)
    assert.equal(safeExternalUrl('/relative'), undefined)
  })
})
