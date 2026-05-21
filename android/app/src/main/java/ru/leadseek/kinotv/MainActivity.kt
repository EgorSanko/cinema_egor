package ru.leadseek.kinotv

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Rational

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.DeviceEventManagerModule

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  /**
   * Picture-in-Picture trigger. Android fires `onUserLeaveHint` when the user
   * presses Home / swipes up to recent-apps. We hop the activity into PiP so
   * the video keeps playing in a small floating window — same UX as YouTube.
   *
   * Gated by PipState.isPlaying, which JS sets via NativeModules.PipModule
   * when entering the player screen with a playing video.
   */
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && PipState.isPlaying) {
      try {
        val params = PictureInPictureParams.Builder()
          .setAspectRatio(Rational(16, 9))
          .build()
        enterPictureInPictureMode(params)
      } catch (e: Exception) {
        // PiP not supported on this device or activity in wrong state — silent
      }
    }
  }

  /**
   * Fires when the activity enters/exits PiP mode. We bridge this to JS so
   * PlayerScreen can:
   *   - keep the video playing on PiP enter (default expo-av pauses on
   *     background — we override it with audio mode + react to this event)
   *   - hide chrome (translator panel, etc.) so only video shows in window
   *   - resume normal controls on PiP exit
   */
  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    try {
      val params = Arguments.createMap().apply {
        putBoolean("isInPip", isInPictureInPictureMode)
      }
      reactInstanceManager
        ?.currentReactContext
        ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("pip:modeChanged", params)
    } catch (e: Exception) {
      // ReactContext not ready — silent
    }

    // CRITICAL: when PiP exits, Android leaves the activity in STOPPED state
    // without destroying it. expo-av's audio session stays alive → user
    // hears audio bleed even though the floating window is gone. Force the
    // activity to finish properly so React unmount fires its cleanup
    // (pauseAsync, unloadAsync, audio mode release).
    //
    // We can't finish() immediately — if user maximized PiP back to
    // fullscreen, the activity needs to keep running. Delay 600ms and check
    // hasWindowFocus(): in foreground = true (keep alive), in stopped
    // background = false (kill it).
    if (!isInPictureInPictureMode) {
      Handler(Looper.getMainLooper()).postDelayed({
        if (!hasWindowFocus() && !isInPictureInPictureMode) {
          finishAndRemoveTask()
        }
      }, 600)
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
