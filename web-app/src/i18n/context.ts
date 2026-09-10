import { createContext } from "react"
import i18next from "./setup"

// Create context for translations
export const TranslationContext = createContext<{
	t: (key: string, options?: Record<string, unknown>) => string
	i18n: typeof i18next
}>({
	// Decision D18. This used to be `(key) => key`, so any component rendered
	// outside TranslationProvider showed the user a literal key such as
	// `media:asset.reRun` instead of words. context.ts already imports the
	// instance; delegating to it means the default resolves the namespace,
	// falls back to English, honours `defaultValue` and interpolates.
	//
	// Note for tests: several suites deliberately assert on raw keys and mock
	// `@/i18n/react-i18next-compat` to do so. That still works - this is only
	// the CONTEXT default, which those mocks bypass entirely.
	t: (key: string, options?: Record<string, unknown>) => i18next.t(key, options),
	i18n: i18next,
})
