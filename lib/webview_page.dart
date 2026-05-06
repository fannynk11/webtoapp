import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'main.dart';
class WebViewPage extends StatefulWidget {
  final String url;

  const WebViewPage({super.key, required this.url});

  @override
  State<WebViewPage> createState() => _WebViewPageState();
}

class _WebViewPageState extends State<WebViewPage> {
  late final WebViewController controller;
  bool isLoading = true;
  bool hasError = false;
  String errorMessage = '';
  String currentUrl = '';
  String pageTitle = '';
  double loadingProgress = 0;

  @override
  void initState() {
    super.initState();
    currentUrl = widget.url;

    // Immersive mode - hide status bar color for full-screen feel
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
      ),
    );

    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            setState(() {
              isLoading = true;
              hasError = false;
              currentUrl = url;
              loadingProgress = 0;
            });
          },
          onProgress: (progress) {
            setState(() {
              loadingProgress = progress / 100.0;
            });
          },
          onPageFinished: (url) {
            controller.getTitle().then((title) {
              if (mounted) {
                setState(() {
                  pageTitle = title ?? '';
                });
              }
            });
            setState(() {
              isLoading = false;
              loadingProgress = 1.0;
            });
          },
          onWebResourceError: (error) {
            // Only show error for main frame navigation failures
            if (error.isForMainFrame ?? false) {
              setState(() {
                hasError = true;
                isLoading = false;
                errorMessage = error.description;
              });
            }
          },
          onNavigationRequest: (request) {
            // Allow all navigation
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  void dispose() {
    // Restore status bar style when leaving
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
    );
    super.dispose();
  }

  Future<bool> _onWillPop() async {
    if (await controller.canGoBack()) {
      await controller.goBack();
      return false; // Don't pop the page
    }
    return true; // Pop the page (go back to input)
  }

  void _reload() {
    setState(() {
      hasError = false;
      isLoading = true;
    });
    controller.reload();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final canGoBack = await controller.canGoBack();
        if (canGoBack) {
          await controller.goBack();
        } else {
          if (context.mounted) {
            Navigator.of(context).pop();
          }
        }
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Column(
            children: [
              // Progress bar at top
              if (isLoading)
                LinearProgressIndicator(
                  value: loadingProgress > 0 ? loadingProgress : null,
                  backgroundColor: Colors.grey.shade200,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    useCustomSplash ? _hexToColor(splashProgressBarColor) : const Color(0xFF6C63FF),
                  ),
                  minHeight: 3,
                ),

              // WebView content
              Expanded(
                child: hasError
                    ? _buildErrorPage()
                    : Stack(
                        children: [
                          WebViewWidget(controller: controller),

                          // Tampilkan splash screen setiap kali halaman sedang memuat (loading)
                          if (isLoading)
                            Container(
                              decoration: BoxDecoration(
                                color: useCustomSplash ? _hexToColor(splashBackgroundColor) : Colors.white,
                                image: (useCustomSplash && splashBgImageType != 'color' && splashBgImageData.isNotEmpty)
                                    ? DecorationImage(
                                        image: splashBgImageType == 'url'
                                            ? NetworkImage(splashBgImageData)
                                            : AssetImage(splashBgImageData) as ImageProvider,
                                        fit: BoxFit.cover,
                                      )
                                    : null,
                              ),
                              child: Center(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    if (!useCustomSplash)
                                      Container(
                                        width: 60,
                                        height: 60,
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(16),
                                          gradient: const LinearGradient(
                                            colors: [
                                              Color(0xFF6C63FF),
                                              Color(0xFFE942F5),
                                            ],
                                          ),
                                        ),
                                        child: const Icon(
                                          Icons.language_rounded,
                                          color: Colors.white,
                                          size: 32,
                                        ),
                                      )
                                    else if (useCustomSplash && splashImageType != 'none')
                                      _buildSplashImage(),
                                    const SizedBox(height: 20),
                                    Text(
                                      useCustomSplash ? splashLoadingText : 'Memuat halaman...',
                                      style: TextStyle(
                                        color: useCustomSplash ? _hexToColor(splashTextColor) : const Color(0xFF6C63FF),
                                        fontSize: 14,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
              ),

              // Bottom navigation bar
              if (!useCustomSplash || !hideBottomNav)
                Container(
                  decoration: BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.06),
                      blurRadius: 10,
                      offset: const Offset(0, -2),
                    ),
                  ],
                ),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildNavButton(
                      icon: Icons.arrow_back_ios_rounded,
                      onTap: () async {
                        if (await controller.canGoBack()) {
                          controller.goBack();
                        }
                      },
                    ),
                    _buildNavButton(
                      icon: Icons.arrow_forward_ios_rounded,
                      onTap: () async {
                        if (await controller.canGoForward()) {
                          controller.goForward();
                        }
                      },
                    ),
                    _buildNavButton(
                      icon: Icons.refresh_rounded,
                      onTap: _reload,
                    ),
                    _buildNavButton(
                      icon: Icons.home_rounded,
                      onTap: () {
                        controller.loadRequest(Uri.parse(widget.url));
                      },
                    ),
                    _buildNavButton(
                      icon: Icons.close_rounded,
                      onTap: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavButton({
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(10),
          child: Icon(
            icon,
            size: 22,
            color: const Color(0xFF302B63),
          ),
        ),
      ),
    );
  }

  Widget _buildErrorPage() {
    return Container(
      color: Colors.white,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  color: Colors.red.shade50,
                ),
                child: Icon(
                  Icons.wifi_off_rounded,
                  size: 40,
                  color: Colors.red.shade400,
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'Gagal Memuat Halaman',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF302B63),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Pastikan koneksi internet kamu aktif\ndan URL yang dimasukkan benar.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey.shade600,
                  height: 1.5,
                ),
              ),
              if (errorMessage.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  errorMessage,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade400,
                  ),
                ),
              ],
              const SizedBox(height: 32),
              SizedBox(
                width: 180,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: _reload,
                  icon: const Icon(Icons.refresh_rounded, size: 20),
                  label: const Text(
                    'Coba Lagi',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF6C63FF),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _hexToColor(String hexString) {
    if (hexString.isEmpty) return Colors.white;
    final buffer = StringBuffer();
    if (hexString.length == 6 || hexString.length == 7) buffer.write('ff');
    buffer.write(hexString.replaceFirst('#', ''));
    try {
      return Color(int.parse(buffer.toString(), radix: 16));
    } catch (e) {
      return Colors.white; // Fallback
    }
  }

  Widget _buildSplashImage() {
    // Default fallback spinner
    Widget spinner = SizedBox(
      width: 45,
      height: 45,
      child: CircularProgressIndicator(
        strokeWidth: 3,
        valueColor: AlwaysStoppedAnimation<Color>(
          useCustomSplash ? _hexToColor(splashProgressBarColor) : const Color(0xFF6C63FF),
        ),
      ),
    );

    if (splashImageType == 'spinner') return spinner;

    Widget imageWidget = const SizedBox.shrink();

    if (splashImageType == 'url' && splashImageData.isNotEmpty) {
      imageWidget = Image.network(
        splashImageData,
        width: 80,
        height: 80,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) => spinner,
        loadingBuilder: (context, child, loadingProgress) {
          if (loadingProgress == null) return child;
          return spinner;
        },
      );
    } else if (splashImageType == 'asset' && splashImageData.isNotEmpty) {
      imageWidget = Image.asset(
        splashImageData,
        width: 80,
        height: 80,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) => spinner,
      );
    }

    if (imageWidget is SizedBox) return imageWidget;

    if (splashUseLogoBg) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: _hexToColor(splashLogoBgColor),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: imageWidget,
      );
    }

    return imageWidget;
  }

}