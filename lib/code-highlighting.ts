import typescript from "highlight.js/lib/languages/typescript";
import { createLowlight } from "lowlight";

export const DEFAULT_CODE_LANGUAGE = "typescript";
export const CODE_HIGHLIGHT_LANGUAGES = { typescript };
export const CODE_HIGHLIGHT_ALIASES = { typescript: ["ts"] };

export const codeLowlight = createLowlight(CODE_HIGHLIGHT_LANGUAGES);
codeLowlight.registerAlias(CODE_HIGHLIGHT_ALIASES);
