import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'webview_page.dart';

// Variabel ini akan disuntik (injected) secara otomatis oleh Node.js Generator
const String targetUrl = "TARGET_URL_PLACEHOLDER";
const String appName = "APP_NAME_PLACEHOLDER";
const String useCustomSplashStr = "USE_CUSTOM_SPLASH_PLACEHOLDER";
const String splashBackgroundColor = "SPLASH_BG_COLOR_PLACEHOLDER";
const String splashTextColor = "SPLASH_TEXT_COLOR_PLACEHOLDER";
const String splashLoadingText = "SPLASH_LOADING_TEXT_PLACEHOLDER";
const String splashProgressBarColor = "SPLASH_PROGRESS_BAR_COLOR_PLACEHOLDER";
const String splashUseLogoBgStr = "SPLASH_USE_LOGO_BG_PLACEHOLDER";
const String splashLogoBgColor = "SPLASH_LOGO_BG_COLOR_PLACEHOLDER";
const String hideBottomNavStr = "HIDE_BOTTOM_NAV_PLACEHOLDER";
const String splashImageType = "SPLASH_IMAGE_TYPE_PLACEHOLDER";
const String splashImageData = "SPLASH_IMAGE_DATA_PLACEHOLDER";
const String splashBgImageType = "SPLASH_BG_IMAGE_TYPE_PLACEHOLDER";
const String splashBgImageData = "SPLASH_BG_IMAGE_DATA_PLACEHOLDER";

// Offline Screen Config
const String useCustomOfflineStr = "USE_CUSTOM_OFFLINE_PLACEHOLDER";
const String offlineTitle = "OFFLINE_TITLE_PLACEHOLDER";
const String offlineDesc = "OFFLINE_DESC_PLACEHOLDER";
const String offlineBtnText = "OFFLINE_BTN_TEXT_PLACEHOLDER";
const String offlineColor = "OFFLINE_COLOR_PLACEHOLDER";
const String offlineIconType = "OFFLINE_ICON_TYPE_PLACEHOLDER";
const String offlineIconData = "OFFLINE_ICON_DATA_PLACEHOLDER";

// Parsed Booleans
bool get useCustomSplash => useCustomSplashStr == "true";
bool get splashUseLogoBg => splashUseLogoBgStr == "true";
bool get hideBottomNav => hideBottomNavStr == "true";
bool get useCustomOffline => useCustomOfflineStr == "true";

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(const WebToApp());
}

class WebToApp extends StatelessWidget {
  const WebToApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: appName,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF6C63FF),
        brightness: Brightness.light,
      ),
      home: const WebViewPage(url: targetUrl),
    );
  }
}