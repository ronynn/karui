package io.github.ronynn.karui;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class ScannerActivity extends Activity
{
  private static final int CAMERA_PERMISSION_REQUEST = 200;
  private static final String PREFS_NOTE_QUEUE = "note_queue";
  private static final String KEY_PENDING_IMPORT = "pending_import_json";
  private static final String PREFIX = "KARUI1";

  private WebView mWebView;

  // Active scan state — one batch at a time
  private String mBatchId = null;
  private int mBatchTotal = 0;
  private final Map<Integer, String> mChunks = new HashMap<>();
  private String mReadyPayload = null;

  @Override
  public void onCreate(Bundle savedInstanceState)
  {
    super.onCreate(savedInstanceState);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
        && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
    {
      if (shouldShowRequestPermissionRationale(Manifest.permission.CAMERA))
        Toast.makeText(this, "Camera is needed to scan QR codes", Toast.LENGTH_LONG).show();
      requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
      return;
    }
    setupWebView();
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results)
  {
    if (requestCode != CAMERA_PERMISSION_REQUEST) return;
    if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
    {
      setupWebView();
    }
    else
    {
      Toast.makeText(this, "Camera permission required. Enable it in Settings.",
          Toast.LENGTH_LONG).show();
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + getPackageName()));
        startActivity(i);
      }
      finish();
    }
  }

  private void setupWebView()
  {
    mWebView = new WebView(this);
    setContentView(mWebView);

    WebSettings ws = mWebView.getSettings();
    ws.setJavaScriptEnabled(true);
    ws.setDomStorageEnabled(true);
    ws.setAllowFileAccess(true);
    ws.setAllowContentAccess(true);
    ws.setMediaPlaybackRequiresUserGesture(false);

    mWebView.setWebViewClient(new WebViewClient()
    {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request)
      {
        String url = request.getUrl().toString();
        if (!url.startsWith("https://karui.local/")) return null;
        String path = url.substring("https://karui.local/".length());
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        try
        {
          InputStream is = getAssets().open(path);
          return new WebResourceResponse(guessMime(path), "UTF-8", is);
        }
        catch (IOException e)
        {
          return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
              Collections.singletonMap("Content-Type", "text/plain"),
              new ByteArrayInputStream("Not found".getBytes()));
        }
      }
    });

    mWebView.setWebChromeClient(new WebChromeClient()
    {
      @Override
      public void onPermissionRequest(final PermissionRequest request)
      {
        for (String res : request.getResources())
        {
          if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res))
          {
            request.grant(new String[]{res});
            return;
          }
        }
        request.deny();
      }

      /**
       * WebView's built-in "custom view" playback mode is what paints the
       * ugly play button on top of a <video> element. If we don't override
       * this, WebView hands the video element to its own media player UI
       * (with play/pause/seek controls) — which looks completely wrong for
       * a live camera preview.
       *
       * Calling onCustomViewHidden() immediately tells WebView "we won't
       * adopt your media view, keep rendering inline." The result: the
       * camera feed shows in the normal <video> element with no play
       * button overlay.
       */
      @Override
      public void onShowCustomView(View view, CustomViewCallback callback)
      {
        try { callback.onCustomViewHidden(); } catch (Exception ignored) {}
      }

      @Override
      public void onHideCustomView()
      {
        // no-op
      }
    });

    mWebView.addJavascriptInterface(new ScannerBridge(), "Android");
    mWebView.loadUrl("https://karui.local/scanner.html");
  }

  private String guessMime(String path)
  {
    if (path.endsWith(".html")) return "text/html";
    if (path.endsWith(".js")) return "application/javascript";
    if (path.endsWith(".css")) return "text/css";
    return "application/octet-stream";
  }

  public class ScannerBridge
  {
    @android.webkit.JavascriptInterface
    public String onScan(String text)
    {
      try { return acceptScan(text); }
      catch (Exception e)
      { return jsonError("Internal error"); }
    }

    @android.webkit.JavascriptInterface
    public String save()
    {
      if (mReadyPayload == null) return jsonError("Nothing to save");
      try
      {
        SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
        String existing = prefs.getString(KEY_PENDING_IMPORT, "[]");
        JSONArray arr = new JSONArray(existing);
        arr.put(mReadyPayload);
        prefs.edit().putString(KEY_PENDING_IMPORT, arr.toString()).apply();

        runOnUiThread(() -> {
          Toast.makeText(ScannerActivity.this, "Saved to Karui", Toast.LENGTH_SHORT).show();
          finish();
        });
        return "{\"ok\":true}";
      }
      catch (Exception e)
      {
        return jsonError("Save failed");
      }
    }

    @android.webkit.JavascriptInterface
    public String copy()
    {
      if (mReadyPayload == null) return jsonError("Nothing to copy");
      try
      {
        runOnUiThread(() -> {
          ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
          cm.setPrimaryClip(ClipData.newPlainText("Karui scan", mReadyPayload));
          Toast.makeText(ScannerActivity.this, "Copied", Toast.LENGTH_SHORT).show();
        });
        return "{\"ok\":true}";
      }
      catch (Exception e) { return jsonError("Copy failed"); }
    }

    @android.webkit.JavascriptInterface
    public void rescan()
    {
      runOnUiThread(() -> {
        mBatchId = null;
        mBatchTotal = 0;
        mChunks.clear();
        mReadyPayload = null;
      });
    }

    @android.webkit.JavascriptInterface
    public void close()
    {
      runOnUiThread(ScannerActivity.this::finish);
    }
  }

  private String acceptScan(String raw) throws Exception
  {
    if (raw == null || raw.trim().isEmpty()) return jsonError("Empty scan");
    raw = raw.trim();

    // ── KARUI1 multi-chunk ─────────────────────────────────────────
    if (raw.startsWith(PREFIX + "/"))
    {
      String[] parts = raw.split("/", 5);
      if (parts.length < 5) return jsonError("Malformed chunk");

      String id = parts[1];
      int seq, total;
      try
      {
        seq = Integer.parseInt(parts[2]);
        total = Integer.parseInt(parts[3]);
      }
      catch (NumberFormatException e) { return jsonError("Malformed chunk"); }

      String data = parts[4];

      if (mBatchId != null && !mBatchId.equals(id))
        return jsonError("Mixing QR batches — tap SCAN AGAIN");

      if (mBatchId == null)
      {
        mBatchId = id;
        mBatchTotal = total;
        mChunks.clear();
      }

      mChunks.put(seq, data);

      if (mChunks.size() == mBatchTotal)
      {
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= mBatchTotal; i++)
        {
          String c = mChunks.get(i);
          if (c == null) return jsonError("Chunk " + i + " missing");
          sb.append(c);
        }
        mReadyPayload = sb.toString();
        return jsonReady(summarize(mReadyPayload));
      }

      return "{\"type\":\"chunk\",\"received\":" + mChunks.size()
          + ",\"total\":" + mBatchTotal + "}";
    }

    // ── Single-frame payload (plaintext or complete JSON) ─────────
    mReadyPayload = raw;
    mBatchId = null;
    mChunks.clear();
    return jsonReady(summarize(raw));
  }

  private String summarize(String payload)
  {
    String trimmed = payload.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("["))
    {
      try
      {
        JSONObject o = new JSONObject(trimmed);
        if (o.has("v") && o.has("t") && o.has("n"))
        {
          String tab = o.optString("t", "?");
          JSONArray notes = o.optJSONArray("n");
          int count = notes != null ? notes.length() : 0;
          return "Tab \"" + tab + "\" — " + count + " note" + (count == 1 ? "" : "s");
        }
      }
      catch (Exception ignored) {}
    }
    String preview = trimmed.length() > 40 ? trimmed.substring(0, 40) + "…" : trimmed;
    return "Note: " + preview;
  }

  private String jsonReady(String summary)
  {
    try
    {
      JSONObject o = new JSONObject();
      o.put("type", "ready");
      o.put("summary", summary);
      return o.toString();
    }
    catch (Exception e) { return "{\"type\":\"ready\",\"summary\":\"Ready\"}"; }
  }

  private String jsonError(String msg)
  {
    try
    {
      JSONObject o = new JSONObject();
      o.put("type", "error");
      o.put("message", msg);
      return o.toString();
    }
    catch (Exception e) { return "{\"type\":\"error\",\"message\":\"Error\"}"; }
  }
}