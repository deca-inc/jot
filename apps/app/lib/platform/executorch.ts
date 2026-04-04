/**
 * Platform abstraction for react-native-executorch (native implementation)
 *
 * Re-exports the ExecuTorch LLM and STT modules for native platforms.
 * On web, the .web.ts version is loaded instead.
 */

export {
  LLMModule,
  SpeechToTextModule,
  type Message,
} from "react-native-executorch";
export type { SpeechToTextModelConfig as RNESpeechToTextModelConfig } from "react-native-executorch";
