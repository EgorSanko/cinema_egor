package ru.leadseek.kinotv

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PipModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "PipModule"

    @ReactMethod
    fun setPlaying(playing: Boolean) {
        PipState.isPlaying = playing
    }
}
