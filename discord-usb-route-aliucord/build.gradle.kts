version = "1.0.1"
description = "Forces Discord voice-call audio to a connected USB headset from inside the Discord process."

aliucord {
    changelog.set(
        """
        # 1.0.1
        * Compatibility cleanup and verified CI build attempt.

        # 1.0.0
        * First experimental build for Galaxy Tab A9+ and USB Audio Device.
        * Automatically retries USB communication routing during a voice call.
        * Adds /usbroute, /usbroutestatus and /usbrouteoff commands.
        """.trimIndent(),
    )

    deploy.set(false)
}
