export const locales = ['zh-CN', 'en'] as const
export type ToolLocale = (typeof locales)[number]
export type Localized<T> = Record<ToolLocale, T>
