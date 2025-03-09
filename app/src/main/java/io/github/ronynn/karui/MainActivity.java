package io.github.ronynn.karui;


import android.animation.ObjectAnimator;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.webkit.*;

public class MainActivity extends Activity {

    private WebView mWebView;
    private View splashScreen;

    @Override
    @SuppressLint({"SetJavaScriptEnabled", "AllowFileAccess"})
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        mWebView = findViewById(R.id.activity_main_webview);
        splashScreen = findViewById(R.id.splash_screen);

        WebSettings webSettings = mWebView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setAllowFileAccessFromFileURLs(true);
        webSettings.setAllowUniversalAccessFromFileURLs(true);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(mWebView, true);

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // Fade out the splash screen when WebView is ready
                ObjectAnimator fadeOut = ObjectAnimator.ofFloat(splashScreen, "alpha", 1f, 0f);
                fadeOut.setInterpolator(new DecelerateInterpolator());
                fadeOut.setDuration(500);
                fadeOut.start();

                // Hide splash screen and show WebView
                splashScreen.setVisibility(View.GONE);
                mWebView.setVisibility(View.VISIBLE);
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient());
        mWebView.loadUrl("file:///android_asset/index.html");
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