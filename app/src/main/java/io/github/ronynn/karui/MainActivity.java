package io.github.ronynn.karui;

import android.animation.ObjectAnimator;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;

public class MainActivity extends Activity {

    private static final int CREATE_FILE_REQUEST_CODE = 1;
    private static final int IMPORT_FILE_REQUEST_CODE = 2;

    private WebView mWebView;
    private View splashScreen;

    // Pending file save data
    private String pendingFileName;
    private String pendingFileData;
    private String pendingFileType;

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

        // Add the JavaScript interface to handle file saving, importing, and dynamic colors.
        mWebView.addJavascriptInterface(new WebAppInterface(), "Android");

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // Fade out the splash screen when WebView is ready.
                ObjectAnimator fadeOut = ObjectAnimator.ofFloat(splashScreen, "alpha", 1f, 0f);
                fadeOut.setInterpolator(new DecelerateInterpolator());
                fadeOut.setDuration(500);
                fadeOut.start();

                // Hide the splash screen and show the WebView.
                splashScreen.setVisibility(View.GONE);
                mWebView.setVisibility(View.VISIBLE);

                // If on Android 12+ (API 31), fetch dynamic Material You colors and pass them to the HTML.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    int color1 = getColor(android.R.color.system_accent1_100);
                    int color2 = getColor(android.R.color.system_accent2_100);
                    int color3 = getColor(android.R.color.system_accent3_100);
                    String hex1 = String.format("#%06X", (0xFFFFFF & color1));
                    String hex2 = String.format("#%06X", (0xFFFFFF & color2));
                    String hex3 = String.format("#%06X", (0xFFFFFF & color3));
                    String jsCode = "setAndroidColors('" + hex1 + "', '" + hex2 + "', '" + hex3 + "')";
                    mWebView.evaluateJavascript(jsCode, null);
                }
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient());
        mWebView.loadUrl("file:///android_asset/index.html");
    }

    // Handle results from file picker intents (both saving and importing).
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CREATE_FILE_REQUEST_CODE && resultCode == RESULT_OK) {
            if (data != null) {
                Uri uri = data.getData();
                if (uri != null && pendingFileData != null) {
                    try {
                        OutputStream outputStream = getContentResolver().openOutputStream(uri);
                        if (outputStream != null) {
                            outputStream.write(pendingFileData.getBytes());
                            outputStream.close();
                        }
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        } else if (requestCode == IMPORT_FILE_REQUEST_CODE && resultCode == RESULT_OK) {
            if (data != null) {
                Uri uri = data.getData();
                if (uri != null) {
                    try {
                        InputStream inputStream = getContentResolver().openInputStream(uri);
                        BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = reader.readLine()) != null) {
                            sb.append(line);
                        }
                        reader.close();
                        String jsonContent = sb.toString();
                        // Call the global JavaScript function "handleImportedJson" with the JSON string.
                        String jsCode = "handleImportedJson(" + JSONObject.quote(jsonContent) + ")";
                        mWebView.evaluateJavascript(jsCode, null);
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
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

    // JavaScript interface for file operations and dynamic colors.
    public class WebAppInterface {
        // Called from JavaScript to save a file (JSON or TXT).
        @JavascriptInterface
        public void saveFile(String fileName, String fileData, String fileType) {
            pendingFileName = fileName;
            pendingFileData = fileData;
            pendingFileType = fileType;

            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(fileType);
            intent.putExtra(Intent.EXTRA_TITLE, fileName);
            startActivityForResult(intent, CREATE_FILE_REQUEST_CODE);
        }

        // Called from JavaScript to import a JSON file via the Android file picker.
        @JavascriptInterface
        public void importJsonFile() {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            startActivityForResult(intent, IMPORT_FILE_REQUEST_CODE);
        }

        // Called from JavaScript to request dynamic colors manually.
        @JavascriptInterface
        public void getDynamicColors() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                int color1 = getColor(android.R.color.system_accent1_100);
                int color2 = getColor(android.R.color.system_accent2_100);
                int color3 = getColor(android.R.color.system_accent3_100);
                String hex1 = String.format("#%06X", (0xFFFFFF & color1));
                String hex2 = String.format("#%06X", (0xFFFFFF & color2));
                String hex3 = String.format("#%06X", (0xFFFFFF & color3));
                final String jsCode = "setAndroidColors('" + hex1 + "', '" + hex2 + "', '" + hex3 + "')";
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        mWebView.evaluateJavascript(jsCode, null);
                    }
                });
            }
        }
    }
}