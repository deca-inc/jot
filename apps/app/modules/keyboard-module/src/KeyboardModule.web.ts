/**
 * Web shim for KeyboardModule
 *
 * The native keyboard module is only needed on Android to programmatically
 * show/hide the software keyboard. On web, the browser handles keyboard
 * display automatically.
 */

interface KeyboardModuleType {
  showKeyboard(): boolean;
  hideKeyboard(): boolean;
}

const webModule: KeyboardModuleType = {
  showKeyboard(): boolean {
    return false;
  },
  hideKeyboard(): boolean {
    return false;
  },
};

export default webModule;
