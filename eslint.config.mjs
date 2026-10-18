import withNuxt from './.nuxt/eslint.config.mjs'

// Emoji and pictographic symbols (incl. ✓ ✕ ★ ⚠ ←) look cheap as UI icons. Use
// <UIcon name="i-lucide-…" /> instead. Plain typography (· – „“) stays allowed.
// Same pattern guards the i18n files in tests/unit/no-emoji.test.ts.
const EMOJI = '/[\\uD83C-\\uD83E\\u2190-\\u21FF\\u2300-\\u23FF\\u2600-\\u27BF\\u2B00-\\u2BFF\\uFE0F]/'
const EMOJI_MESSAGE = 'No emoji or symbol characters as icons, use <UIcon name="i-lucide-…" /> instead.'
const noEmoji = [
  { selector: `Literal[value=${EMOJI}]`, message: EMOJI_MESSAGE },
  { selector: `TemplateElement[value.raw=${EMOJI}]`, message: EMOJI_MESSAGE },
]

export default withNuxt(
  {
    ignores: [
      '.nuxt',
      '.output',
      '.vercel',
      'coverage',
      'node_modules',
      'playwright-report',
      'server/db/migrations',
      'test-results',
    ],
  },
  {
    files: ['app/**/*.{js,ts,vue}', 'server/**/*.{js,ts}', 'scripts/**/*.{js,ts}'],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ['app/**/*.{js,ts,vue}'],
    rules: {
      'no-restricted-syntax': ['error', ...noEmoji],
      'vue/no-restricted-syntax': ['error', ...noEmoji, { selector: `VText[value=${EMOJI}]`, message: EMOJI_MESSAGE }],
    },
  },
)
