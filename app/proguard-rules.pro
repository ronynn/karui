# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /Applications/Utilities/sdk/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# ZXing — keep only QR code paths
-keep class com.google.zxing.qrcode.** { *; }
-keep class com.google.zxing.common.** { *; }
-keep class com.google.zxing.BinaryBitmap { *; }
-keep class com.google.zxing.LuminanceSource { *; }
-keep class com.google.zxing.Result { *; }
-keep class com.google.zxing.ResultPoint { *; }
-keep class com.google.zxing.PlanarYUVLuminanceSource { *; }
-dontwarn com.google.zxing.**