package io.github.ronynn.karui;

import android.animation.ObjectAnimator;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;

public class MainActivity extends Activity {

    private static final int CREATE_FILE_REQUEST_CODE = 1;
    private static final int IMPORT_FILE_REQUEST_CODE = 2;
    private static final int FILECHOOSER_RESULTCODE = 3;

    private WebView mWebView;
    private View splashScreen;

    private String pendingFileName;
    private String pendingFileData;
    private String pendingFileType;
    
    private ValueCallback<Uri[]> mFilePathCallback;

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

        mWebView.addJavascriptInterface(new WebAppInterface(), "Android");

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                try {
                    view.getContext().startActivity(intent);
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(view.getContext(), R.string.no_app_to_open_link, Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                ObjectAnimator fadeOut = ObjectAnimator.ofFloat(splashScreen, "alpha", 1f, 0f);
                fadeOut.setInterpolator(new DecelerateInterpolator());
                fadeOut.setDuration(500);
                fadeOut.start();

                splashScreen.setVisibility(View.GONE);
                mWebView.setVisibility(View.VISIBLE);
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILECHOOSER_RESULTCODE);
                } catch (Exception e) {
                    mFilePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        mWebView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        
        if (requestCode == CREATE_FILE_REQUEST_CODE && resultCode == RESULT_OK) {
            if (data != null && data.getData() != null && pendingFileData != null) {
                try {
                    OutputStream outputStream = getContentResolver().openOutputStream(data.getData());
                    if (outputStream != null) {
                        outputStream.write(pendingFileData.getBytes());
                        outputStream.close();
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        } else if (requestCode == IMPORT_FILE_REQUEST_CODE && resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                try {
                    InputStream inputStream = getContentResolver().openInputStream(data.getData());
                    BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();
                    String jsonContent = sb.toString();
                    
                    String jsCode = "if(window.setAndroidNotes) window.setAndroidNotes(" + JSONObject.quote(jsonContent) + ");";
                    mWebView.evaluateJavascript(jsCode, null);
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        } else if (requestCode == FILECHOOSER_RESULTCODE) {
            if (mFilePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                } else if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
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

    public class WebAppInterface {
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

        @JavascriptInterface
        public void importJsonFile() {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            startActivityForResult(intent, IMPORT_FILE_REQUEST_CODE);
        }
    }
}