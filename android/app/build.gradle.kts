plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.udaypurgroup.jarvis"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.udaypurgroup.jarvis"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
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
    kotlinOptions {
        jvmTarget = "17"
    }
}

// No third-party libraries on purpose: only the Android framework (WebView, SpeechRecognizer, services).
dependencies {
}
