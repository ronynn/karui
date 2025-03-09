package io.github.ronynn.karui;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;



public class MainActivity extends Activity {

    private WebView mWebView;



    @Override
    @SuppressLint({"SetJavaScriptEnabled", "AllowFileAccess"})
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);



        mWebView = findViewById(R.id.activity_main_webview);
        WebSettings webSettings = mWebView.getSettings();

        // Enable JavaScript, DOM Storage and full file/content URI access
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setAllowFileAccessFromFileURLs(true);
        webSettings.setAllowUniversalAccessFromFileURLs(true);



        // Enable cookies
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(mWebView, true);



        // Add the JavaScript interface for dynamic color updating
        mWebView.addJavascriptInterface(new WebAppInterface(), "Android");



        mWebView.setWebViewClient(new WebViewClient());
        mWebView.setWebChromeClient(new WebChromeClient());



        mWebView.loadUrl("file:///android_asset/index.html");
    }



    public class WebAppInterface {

        @JavascriptInterface
        public void setStatusBarColor(String color) {
            runOnUiThread(() -> {
                try {
                    Window window = getWindow();
                    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
                    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                    window.setStatusBarColor(Color.parseColor(color));
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }



        @JavascriptInterface
        public void setNavigationBarColor(String color) {
            runOnUiThread(() -> {
                try {
                    Window window = getWindow();
                    // Requires API 21+
                    window.setNavigationBarColor(Color.parseColor(color));
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
    }



    @Override
    public void onBackPressed() {
        if (mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}