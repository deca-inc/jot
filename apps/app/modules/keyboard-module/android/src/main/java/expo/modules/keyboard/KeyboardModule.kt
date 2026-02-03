package expo.modules.keyboard

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.inputmethod.InputMethodManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KeyboardModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KeyboardModule")

    Function("showKeyboard") {
      val activity = appContext.currentActivity ?: return@Function false

      Handler(Looper.getMainLooper()).postDelayed({
        val view = activity.currentFocus ?: activity.window.decorView.rootView
        val imm = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager

        view.requestFocus()
        imm.showSoftInput(view, InputMethodManager.SHOW_IMPLICIT)
      }, 100)

      true
    }

    Function("hideKeyboard") {
      val activity = appContext.currentActivity ?: return@Function false

      val view = activity.currentFocus ?: activity.window.decorView.rootView
      val imm = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      imm.hideSoftInputFromWindow(view.windowToken, 0)

      true
    }
  }
}
