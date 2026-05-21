package ru.leadseek.kinotv

/**
 * Singleton flag toggled from JS to gate Picture-in-Picture entry.
 * Set to true while the player screen is active and a video is playing.
 * MainActivity.onUserLeaveHint() reads this to decide whether to enter PiP.
 */
object PipState {
    @Volatile var isPlaying: Boolean = false
}
