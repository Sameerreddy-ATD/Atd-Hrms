# Anytime Workforce — Capacitor / Play release R8 rules
# Keep stack traces useful in Play Console crash reports.
-keepattributes SourceFile,LineNumberTable,Signature,InnerClasses,EnclosingMethod,*Annotation*
-renamesourcefileattribute SourceFile

# Capacitor plugins (bridge methods must survive shrinking/obfuscation)
-keep public class * extends com.getcapacitor.Plugin
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

# Cordova compatibility layer used by some Capacitor plugins
-keep class org.apache.cordova.** { *; }
-keep class com.getcapacitor.cordova.** { *; }

# Firebase / FCM (native push)
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# AndroidX / WebView
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**

# Prefer optimize; drop unused logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
}
