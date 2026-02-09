/* eslint-disable import/order */
// Install react-native-quick-crypto polyfill before any other imports
// This MUST be called before any other imports to properly polyfill global.crypto
import { install } from "react-native-quick-crypto";
install();

import { registerRootComponent } from "expo";
import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
