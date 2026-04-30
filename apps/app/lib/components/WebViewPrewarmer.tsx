/**
 * Pre-warms a WebView on app launch so WebKit's process is already running
 * when the user opens a journal entry. Without this, the first WebView
 * (Quill editor) takes ~2 seconds just to boot the WebKit process.
 *
 * This component renders a 0x0 hidden WebView with the same Quill HTML
 * the editor uses, so WebKit's JS engine also JIT-compiles Quill's code.
 *
 * Mounted during app initialization (before providers finish) so the
 * WebKit process boots in parallel with encryption key generation,
 * database setup, etc.
 */

import React from "react";
import { Platform, StyleSheet, View } from "react-native";
// @ts-expect-error -- internal library path, no type declarations
import { createHtml } from "react-native-cn-quill/lib/module/utils/editor-utils";
import { WebView } from "react-native-webview";

// Only pre-warm on native — web doesn't use a WebView for the editor
const isNative = Platform.OS === "ios" || Platform.OS === "android";

// Generate the HTML once at module level so it's ready immediately
const prewarmHtml = isNative
  ? createHtml({
      initialHtml: "",
      placeholder: "",
      toolbar: "false",
      libraries: "local",
      theme: "snow",
      editorId: "editor-container",
      containerId: "standalone-container",
      color: "black",
      backgroundColor: "white",
      placeholderColor: "rgba(0,0,0,0.6)",
      customStyles: [],
      fonts: [],
      customJS: "",
      readonly: true,
      autoSize: false,
    })
  : "";

export function WebViewPrewarmer() {
  if (!isNative) return null;

  return (
    <View
      style={styles.container}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <WebView
        source={{ html: prewarmHtml }}
        style={styles.webview}
        onLoadEnd={() => {
          if (__DEV__) console.log("[WebViewPrewarmer] WebView pre-warmed");
        }}
        javaScriptEnabled={true}
        originWhitelist={["*"]}
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    width: 0,
    height: 0,
    overflow: "hidden",
    opacity: 0,
  },
  webview: {
    width: 1,
    height: 1,
  },
});
