plugins {
    id("com.android.application")
}

android {
    namespace = "ru.pavelord.usbaudioroute"
    compileSdk = 35

    defaultConfig {
        applicationId = "ru.pavelord.usbaudioroute"
        minSdk = 31
        targetSdk = 35
        versionCode = 2
        versionName = "1.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    compileOnly("de.robv.android.xposed:api:82")
}
