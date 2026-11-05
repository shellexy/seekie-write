declare module 'gfm-escape' {
  export interface GfmEscapeOptions {
    table?: boolean
    strikethrough?: boolean | Record<string, unknown>
    [key: string]: unknown
  }

  export default class GfmEscape {
    constructor(options?: GfmEscapeOptions, syntax?: unknown)
    escape(input: string, context?: unknown, metadata?: unknown): string
    static Syntax: {
      text: unknown
      linkDestination: unknown
      linkTitle: unknown
      cmAutolink: unknown
      codeSpan: unknown
    }
  }
}
