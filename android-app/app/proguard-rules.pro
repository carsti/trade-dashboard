-keepattributes Signature
-keepattributes *Annotation*

# Retrofit + Gson
-keep class com.tradedashboard.data.** { *; }
-keep class retrofit2.** { *; }
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn retrofit2.**
-keep class okhttp3.** { *; }
-keep class com.google.gson.** { *; }
