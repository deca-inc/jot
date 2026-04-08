// Install react-native-quick-crypto polyfill before any other imports
// This MUST be imported before any code that uses global.crypto
import { install } from "react-native-quick-crypto";
install();
