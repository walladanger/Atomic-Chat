import { createContext } from "react"
import i18next from "./setup"

// Create context for translations
export const TranslationContext = createContext<{
	t: (key: string, options?: Record<string, unknown>) => string
	i18n: typeof i18next
}>({
	// D18, settled during the v2.0.35 sync.
	//
	// This honours an explicit `defaultValue` and otherwise returns the raw
	// key. That satisfies both conventions at once, which neither of the
	// obvious options did:
	//
	//  - returning the key always (the original) showed users literal text
	//    like `media:asset.reRun` in any component rendered outside
	//    TranslationProvider;
	//  - resolving real translations broke every test that asserts on raw
	//    keys, and the v2.0.35 sync alone brought twelve more of those, so
	//    keeping it would mean rewriting upstream's tests on every sync.
	//
	// Callers that pass a defaultValue (the media surfaces do, everywhere)
	// get readable English; callers that do not (upstream's, almost
	// everywhere) get the key their tests expect. No interpolation here on
	// purpose - a component that needs it belongs inside the provider.
	t: (key: string, options?: Record<string, unknown>) =>
		typeof options?.defaultValue === 'string' ? options.defaultValue : key,
	i18n: i18next,
})
