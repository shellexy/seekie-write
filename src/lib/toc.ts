export interface TocHeading {
  level: number
  text: string
  slug: string
}

export function githubSlug(text: string): string {
  const slug = text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
  return slug || 'section'
}

/** GitHub 风格去重：第一个不加后缀，后续 -1、-2…… */
export function assignTocSlugs(
  headings: Array<{ level: number; text: string }>,
): TocHeading[] {
  const counts = new Map<string, number>()
  const used = new Set<string>()
  return headings.map((heading) => {
    const base = githubSlug(heading.text)
    let count = counts.get(base) ?? 0
    let slug = count === 0 ? base : `${base}-${count}`
    while (used.has(slug)) {
      count += 1
      slug = `${base}-${count}`
    }
    counts.set(base, count + 1)
    used.add(slug)
    return { ...heading, slug }
  })
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

export function tocNavHtml(headings: TocHeading[]): string {
  const items = headings
    .map(
      (heading) =>
        `  <li class="toc-level-${heading.level}"><a href="#user-content-${escapeHtml(heading.slug)}">${escapeHtml(heading.text)}</a></li>`,
    )
    .join('\n')
  return `<nav role="doc-toc" aria-label="目录">\n<ul>\n${items}\n</ul>\n</nav>`
}
