package io.github.ronynn.karui;

import android.Manifest;
import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;

public class MainActivity extends Activity
{
  // ═══════════════════════════════════════════════════════════════
  //  SECTION 1 — CONSTANTS
  // ═══════════════════════════════════════════════════════════════

  public static final String ACTION_NOTE_ADDED = "io.github.ronynn.karui.ACTION_NOTE_ADDED";
  public static final String ACTION_OPEN_FLOATING = "io.github.ronynn.karui.ACTION_OPEN_FLOATING";
  public static final String ACTION_CLOSE_FLOATING = "io.github.ronynn.karui.ACTION_CLOSE_FLOATING";
  public static final String ACTION_FLOATING_OPENED = "io.github.ronynn.karui.ACTION_FLOATING_OPENED";

  static final int CREATE_FILE_REQUEST_CODE = 1;
  static final int IMPORT_FILE_REQUEST_CODE = 2;
  static final int FILECHOOSER_RESULTCODE = 3;
  static final int SYNC_FILE_REQUEST_CODE = 4;
  static final int IMPORT_MD_FILE_REQUEST_CODE = 5;
  static final int NOTIFICATION_PERMISSION_REQUEST = 100;

  private static final int INJECT_RETRY_COUNT = 10;
  private static final long INJECT_RETRY_DELAY_MS = 300L;

  private static final String PREFS_SYNC = "sync_prefs";
  private static final String KEY_SYNC_URI = "sync_file_uri";
  private static final String PREFS_NOTE_QUEUE = "note_queue";
  private static final String KEY_OVERLAY_ACTIVE = "overlay_active";
  private static final String KEY_PENDING_IMPORT = "pending_import_json";
  private static final String KEY_OVERLAY_PROMPTED = "overlay_prompted";

  private static final int WEBVIEW_BG_COLOR = 0xFF000000;

  // ═══════════════════════════════════════════════════════════════
  //  SECTION 2 — FIELDS
  // ═══════════════════════════════════════════════════════════════

  private WebView mWebView;
  private View splashScreen;

  String pendingFileName;
  String pendingFileData;
  String pendingFileType;

  private ValueCallback<Uri[]> mFilePathCallback;

  private boolean isPageLoaded = false;
  private boolean mInjecting = false;
  private boolean mImportingQr = false;
  private boolean mJustClosedFloating = false;
  boolean pendingQuickNoteEnable = false;

  private final BroadcastReceiver noteReceiver = new BroadcastReceiver()
  {
    @Override
    public void onReceive(Context context, Intent intent)
    {
      if (intent == null) return;
      String action = intent.getAction();

      if (ACTION_FLOATING_OPENED.equals(action))
      {
        finishAndRemoveTask();
        return;
      }
      if (isPageLoaded) injectPendingNotes();
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  SECTION 3 — LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  @Override
  @SuppressLint({"SetJavaScriptEnabled", "AllowFileAccess"})
  protected void onCreate(Bundle savedInstanceState)
  {
    super.onCreate(savedInstanceState);

    Intent launchIntent = getIntent();
    String action = launchIntent != null ? launchIntent.getAction() : null;

    boolean assistLaunch = Intent.ACTION_ASSIST.equals(action);
    boolean tileLaunch = ACTION_OPEN_FLOATING.equals(action);
    boolean floatingTrigger = assistLaunch || tileLaunch;

    // ── Floating-window fast path ─────────────────────────────────
    if (floatingTrigger && canDrawOverlays())
    {
      getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
      try
      {
        startService(new Intent(this, FloatingWindowService.class));
        finishAndRemoveTask();
        overridePendingTransition(0, 0);
        return;
      }
      catch (Exception e)
      {
        Toast.makeText(this,
            "Could not open capture window: " + e.getMessage(),
            Toast.LENGTH_LONG).show();
      }
    }

    // ── Close any running textbox window before showing full UI ──
    if (!floatingTrigger)
    {
      SharedPreferences qp = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
      if (qp.getBoolean(KEY_OVERLAY_ACTIVE, false))
      {
        mJustClosedFloating = true;
        Intent closeIntent = new Intent(ACTION_CLOSE_FLOATING);
        closeIntent.setPackage(getPackageName());
        sendBroadcast(closeIntent);
        stopService(new Intent(this, FloatingWindowService.class));
      }
    }

    // ── Normal / fallback launch ──────────────────────────────────
    setContentView(R.layout.activity_main);
    SystemBarHelper.apply(this);

    mWebView = findViewById(R.id.activity_main_webview);
    splashScreen = findViewById(R.id.splash_screen);
    splashScreen.setVisibility(View.GONE);

    mWebView.setBackgroundColor(WEBVIEW_BG_COLOR);
    mWebView.setOverScrollMode(View.OVER_SCROLL_NEVER);
    mWebView.setVerticalScrollBarEnabled(false);
    mWebView.setHorizontalScrollBarEnabled(false);

    WebSettings ws = mWebView.getSettings();
    ws.setJavaScriptEnabled(true);
    ws.setDomStorageEnabled(true);
    ws.setAllowFileAccess(true);
    ws.setAllowContentAccess(true);
    ws.setAllowFileAccessFromFileURLs(true);
    ws.setAllowUniversalAccessFromFileURLs(true);

    mWebView.addJavascriptInterface(new WebAppInterface(this), "Android");

    mWebView.setWebViewClient(new WebViewClient()
    {
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, String url)
      {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        try { view.getContext().startActivity(intent); }
        catch (ActivityNotFoundException e)
        {
          Toast.makeText(view.getContext(),
              R.string.no_app_to_open_link, Toast.LENGTH_SHORT).show();
        }
        return true;
      }

      @Override
      public void onPageFinished(WebView view, String url)
      {
        isPageLoaded = true;

        Runnable deliver = () ->
        {
          if (!isPageLoaded || mWebView == null) return;
          injectPendingNotes();
          readSyncFileAndInject();
          consumeImportQr();
        };

        if (mJustClosedFloating)
        {
          mJustClosedFloating = false;
          new Handler(Looper.getMainLooper()).postDelayed(deliver, 500);
        }
        else
        {
          deliver.run();
        }

        SystemBarHelper.apply(MainActivity.this);

        splashScreen.animate()
            .alpha(0f)
            .setDuration(150)
            .setListener(new AnimatorListenerAdapter()
            {
              @Override
              public void onAnimationEnd(Animator animation)
              {
                splashScreen.setVisibility(View.GONE);
              }
            })
            .start();
      }
    });

    mWebView.setWebChromeClient(new WebChromeClient()
    {
      @Override
      public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                       FileChooserParams params)
      {
        if (mFilePathCallback != null) mFilePathCallback.onReceiveValue(null);
        mFilePathCallback = cb;
        try
        {
          startActivityForResult(params.createIntent(), FILECHOOSER_RESULTCODE);
        }
        catch (Exception e)
        {
          mFilePathCallback = null;
          return false;
        }
        return true;
      }
    });

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      mWebView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);

    mWebView.loadUrl("file:///android_asset/index.html");

    CookieManager cm = CookieManager.getInstance();
    cm.setAcceptCookie(true);
    cm.setAcceptThirdPartyCookies(mWebView, true);

    NotificationHelper.createChannel(this);

    IntentFilter filter = new IntentFilter();
    filter.addAction(ACTION_NOTE_ADDED);
    filter.addAction(ACTION_FLOATING_OPENED);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
      registerReceiver(noteReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    else
      registerReceiver(noteReceiver, filter);

    mWebView.post(() ->
    {
      SharedPreferences calPrefs = getSharedPreferences(
          CalendarNotificationReceiver.PREFS, MODE_PRIVATE);
      if (calPrefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false))
      {
        CalendarNotificationReceiver.scheduleNext(this);
        CalendarNotificationReceiver.scheduleEventReminders(this);
      }
    });

    if (floatingTrigger && !canDrawOverlays()) onboardOverlayPermission();
  }

  @Override
  protected void onResume()
  {
    super.onResume();
    NotificationHelper.ensureMatchesPreference(this);
    SystemBarHelper.apply(this);

    if (isPageLoaded)
    {
      SharedPreferences qp = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
      if (!qp.getBoolean(KEY_OVERLAY_ACTIVE, false)) readSyncFileAndInject();
      injectPendingNotes();
      consumeImportQr();
    }

    SharedPreferences calPrefs = getSharedPreferences(
        CalendarNotificationReceiver.PREFS, MODE_PRIVATE);
    if (calPrefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false))
    {
      Intent refresh = new Intent(this, CalendarNotificationReceiver.class);
      refresh.setAction(CalendarNotificationReceiver.ACTION_REFRESH);
      sendBroadcast(refresh);
    }
  }

  @Override
  protected void onNewIntent(Intent intent)
  {
    super.onNewIntent(intent);
    setIntent(intent);
    if (intent == null) return;

    String action = intent.getAction();
    boolean floatingTrigger = Intent.ACTION_ASSIST.equals(action)
        || ACTION_OPEN_FLOATING.equals(action);

    if (floatingTrigger && canDrawOverlays())
    {
      try
      {
        startService(new Intent(this, FloatingWindowService.class));
        finishAndRemoveTask();
        overridePendingTransition(0, 0);
      }
      catch (Exception e) { e.printStackTrace(); }
    }
    else
    {
      SharedPreferences qp = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
      if (qp.getBoolean(KEY_OVERLAY_ACTIVE, false))
      {
        mJustClosedFloating = true;
        Intent closeIntent = new Intent(ACTION_CLOSE_FLOATING);
        closeIntent.setPackage(getPackageName());
        sendBroadcast(closeIntent);
        stopService(new Intent(this, FloatingWindowService.class));
      }
    }
  }

  @Override
  protected void onStop()
  {
    super.onStop();
    triggerAppCloseSync();

    final WebView wv = mWebView;
    if (wv != null)
    {
      new Handler(Looper.getMainLooper()).postDelayed(() ->
      {
        if (mWebView == wv)
        {
          try
          {
            wv.clearFormData();
            wv.clearCache(false);
            wv.freeMemory();
          }
          catch (Exception ignored) {}
        }
      }, 300);
    }
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data)
  {
    super.onActivityResult(requestCode, resultCode, data);

    if (requestCode == CREATE_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null && pendingFileData != null)
      {
        try
        {
          OutputStream os = getContentResolver().openOutputStream(data.getData());
          if (os != null) { os.write(pendingFileData.getBytes()); os.close(); }
        }
        catch (IOException e) { e.printStackTrace(); }
      }
    }
    else if (requestCode == IMPORT_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null)
      {
        try
        {
          InputStream is = getContentResolver().openInputStream(data.getData());
          BufferedReader r = new BufferedReader(new InputStreamReader(is));
          StringBuilder sb = new StringBuilder();
          String line;
          while ((line = r.readLine()) != null) sb.append(line);
          r.close();
          String js = "if(window.setAndroidNotes) window.setAndroidNotes("
              + JSONObject.quote(sb.toString()) + ");";
          mWebView.evaluateJavascript(js, null);
        }
        catch (IOException e) { e.printStackTrace(); }
      }
    }
    else if (requestCode == IMPORT_MD_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null)
      {
        try
        {
          InputStream is = getContentResolver().openInputStream(data.getData());
          BufferedReader r = new BufferedReader(new InputStreamReader(is));
          StringBuilder sb = new StringBuilder();
          String line;
          while ((line = r.readLine()) != null) sb.append(line).append("\n");
          r.close();
          String js = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid("
              + JSONObject.quote(sb.toString()) + ");";
          mWebView.evaluateJavascript(js, null);
        }
        catch (IOException e) { e.printStackTrace(); }
      }
    }
    else if (requestCode == SYNC_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null)
      {
        Uri uri = data.getData();
        try
        {
          int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION
              | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
          getContentResolver().takePersistableUriPermission(uri, flags);

          SharedPreferences prefs = getSharedPreferences(PREFS_SYNC, MODE_PRIVATE);
          prefs.edit().putString(KEY_SYNC_URI, uri.toString()).apply();

          InputStream is = getContentResolver().openInputStream(uri);
          StringBuilder sb = new StringBuilder();
          if (is != null)
          {
            BufferedReader r = new BufferedReader(new InputStreamReader(is));
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append("\n");
            r.close();
          }
          String existing = sb.toString().trim();

          if (!existing.isEmpty())
          {
            String js = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid("
                + JSONObject.quote(existing) + ");";
            mWebView.evaluateJavascript(js, null);
            Toast.makeText(this, "Imported notes from sync file!", Toast.LENGTH_SHORT).show();
          }
          else if (pendingFileData != null && !pendingFileData.isEmpty())
          {
            OutputStream os = getContentResolver().openInputStream(uri) != null
                ? getContentResolver().openOutputStream(uri, "rwt")
                : getContentResolver().openOutputStream(uri);
            if (os != null) { os.write(pendingFileData.getBytes()); os.close(); }
            Toast.makeText(this, "Sync file connected!", Toast.LENGTH_SHORT).show();
          }

          String js = "if(window.onSyncFileSelected) window.onSyncFileSelected("
              + JSONObject.quote(uri.toString()) + ");";
          mWebView.evaluateJavascript(js, null);
        }
        catch (Exception e)
        {
          Toast.makeText(this, "Failed to initialize sync file: " + e.getMessage(),
              Toast.LENGTH_LONG).show();
          e.printStackTrace();
        }
      }
    }
    else if (requestCode == FILECHOOSER_RESULTCODE)
    {
      if (mFilePathCallback == null) return;
      Uri[] results = null;
      if (resultCode == Activity.RESULT_OK && data != null)
      {
        String ds = data.getDataString();
        if (ds != null) results = new Uri[]{Uri.parse(ds)};
        else if (data.getClipData() != null)
        {
          int n = data.getClipData().getItemCount();
          results = new Uri[n];
          for (int i = 0; i < n; i++)
            results[i] = data.getClipData().getItemAt(i).getUri();
        }
      }
      mFilePathCallback.onReceiveValue(results);
      mFilePathCallback = null;
    }
  }

  @Override
  public void onBackPressed()
  {
    if (mWebView != null && mWebView.canGoBack()) mWebView.goBack();
    else super.onBackPressed();
  }

  @Override
  protected void onDestroy()
  {
    triggerAppCloseSync();
    super.onDestroy();
    try { unregisterReceiver(noteReceiver); } catch (Exception ignored) {}

    if (mWebView != null)
    {
      try
      {
        mWebView.stopLoading();
        mWebView.clearHistory();
        if (mWebView.getParent() instanceof ViewGroup)
          ((ViewGroup) mWebView.getParent()).removeView(mWebView);
        mWebView.destroy();
      }
      catch (Exception ignored) {}
      mWebView = null;
    }
  }

  @Override
  public void onTrimMemory(int level)
  {
    super.onTrimMemory(level);
    if (mWebView == null) return;
    if (level >= TRIM_MEMORY_RUNNING_CRITICAL)
    {
      try { mWebView.clearCache(false); mWebView.freeMemory(); } catch (Exception ignored) {}
    }
    else if (level >= TRIM_MEMORY_RUNNING_LOW)
    {
      try { mWebView.clearCache(false); } catch (Exception ignored) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SECTION 4 — OVERLAY PERMISSION
  // ═══════════════════════════════════════════════════════════════

  boolean canDrawOverlays()
  {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      return Settings.canDrawOverlays(this);
    return true;
  }

  void openOverlaySettings()
  {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
    try
    {
      Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:" + getPackageName()));
      startActivity(i);
    }
    catch (Exception e)
    {
      try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)); }
      catch (Exception ignored) {}
    }
  }

  private void onboardOverlayPermission()
  {
    SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    boolean prompted = prefs.getBoolean(KEY_OVERLAY_PROMPTED, false);
    if (!prompted)
    {
      prefs.edit().putBoolean(KEY_OVERLAY_PROMPTED, true).apply();
      Toast.makeText(this,
          "Enable 'Display over other apps' for Karui to float over other apps.",
          Toast.LENGTH_LONG).show();
      openOverlaySettings();
    }
    else
    {
      Toast.makeText(this,
          "Quick capture needs 'Display over other apps' permission. "
              + "Grant it from Settings → Privacy → Special permissions.",
          Toast.LENGTH_LONG).show();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SECTION 5 — DATA INJECTION & QR IMPORT
  // ═══════════════════════════════════════════════════════════════

  private void injectPendingNotes() { injectPendingNotes(0); }

  private void injectPendingNotes(final int attempt)
  {
    SharedPreferences qp = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    if (qp.getBoolean(KEY_OVERLAY_ACTIVE, false)) return;
    if (mInjecting || !isPageLoaded || mWebView == null) return;

    final String jsonStr = qp.getString("pending_notes_json", "[]");
    if (jsonStr.equals("[]") || jsonStr.isEmpty()) return;

    mInjecting = true;

    String js = "(function(){"
        + "if(!window.syncNotesArrayFromAndroid) return 'missing';"
        + "try{window.syncNotesArrayFromAndroid(" + JSONObject.quote(jsonStr) + ");return 'ok';}"
        + "catch(e){return 'error';}})()";

    mWebView.evaluateJavascript(js, value ->
    {
      mInjecting = false;
      if ("\"ok\"".equals(value))
      {
        String current = qp.getString("pending_notes_json", "[]");
        if (current.equals(jsonStr)) qp.edit().remove("pending_notes_json").apply();
        else injectPendingNotes(0);
      }
      else if (attempt < INJECT_RETRY_COUNT)
      {
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> injectPendingNotes(attempt + 1), INJECT_RETRY_DELAY_MS);
      }
    });
  }

  private void consumeImportQr() { consumeImportQr(0); }

  /**
   * Consumes QR payloads queued by ScannerActivity.
   *
   * Only removes entries from the queue after JS confirms receipt via
   * importQrPayload returning "ok". If JS isn't ready ("missing"), retries
   * briefly; if we still can't deliver, the entries stay in the queue and
   * are retried on the next onResume / onPageFinished.
   */
  private void consumeImportQr(final int attempt)
  {
    if (mImportingQr || !isPageLoaded || mWebView == null) return;

    final SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    final String payloadsJson = prefs.getString(KEY_PENDING_IMPORT, "[]");
    if (payloadsJson.equals("[]") || payloadsJson.isEmpty()) return;

    mImportingQr = true;

    JSONArray arr;
    try { arr = new JSONArray(payloadsJson); }
    catch (Exception e)
    {
      prefs.edit().remove(KEY_PENDING_IMPORT).apply();
      mImportingQr = false;
      return;
    }

    final String[] payloads = new String[arr.length()];
    for (int i = 0; i < arr.length(); i++) payloads[i] = arr.optString(i, "");
    if (payloads.length == 0)
    {
      prefs.edit().remove(KEY_PENDING_IMPORT).apply();
      mImportingQr = false;
      return;
    }

    deliverQrPayload(prefs, payloads, 0, attempt);
  }

  private void deliverQrPayload(final SharedPreferences prefs, final String[] payloads,
                                final int index, final int attempt)
  {
    if (index >= payloads.length)
    {
      // All delivered — clear the queue only if nothing new arrived.
      String current = prefs.getString(KEY_PENDING_IMPORT, "[]");
      try
      {
        JSONArray remaining = new JSONArray(current);
        // The queue still holds the same entries we've been reading from;
        // if the count matches what we just delivered, clear it entirely.
        if (remaining.length() == payloads.length)
          prefs.edit().remove(KEY_PENDING_IMPORT).apply();
      }
      catch (Exception ignored) {}
      mImportingQr = false;
      return;
    }

    String payload = payloads[index];
    if (payload == null || payload.isEmpty())
    {
      deliverQrPayload(prefs, payloads, index + 1, attempt);
      return;
    }

    String js = "(function(){"
        + "if (typeof window.importQrPayload !== 'function') return 'missing';"
        + "try { return window.importQrPayload(" + JSONObject.quote(payload) + "); }"
        + "catch(e) { return 'error'; }"
        + "})()";

    mWebView.evaluateJavascript(js, value ->
    {
      if ("\"ok\"".equals(value) || "\"error\"".equals(value))
      {
        deliverQrPayload(prefs, payloads, index + 1, attempt);
      }
      else if (attempt < INJECT_RETRY_COUNT)
      {
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> deliverQrPayload(prefs, payloads, index, attempt + 1),
            INJECT_RETRY_DELAY_MS);
      }
      else
      {
        // Give up for now — keep queue, retry later.
        mImportingQr = false;
      }
    });
  }

  void readSyncFileAndInject()
  {
    if (!isPageLoaded) return;
    SharedPreferences prefs = getSharedPreferences(PREFS_SYNC, MODE_PRIVATE);
    final String uriStr = prefs.getString(KEY_SYNC_URI, null);
    if (uriStr == null || uriStr.isEmpty()) return;

    new Thread(() ->
    {
      try
      {
        Uri uri = Uri.parse(uriStr);
        InputStream is = getContentResolver().openInputStream(uri);
        if (is == null) return;

        BufferedReader r = new BufferedReader(new InputStreamReader(is));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line).append("\n");
        r.close();

        final String md = sb.toString();
        runOnUiThread(() ->
        {
          if (!isPageLoaded || mWebView == null) return;
          String js = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid("
              + JSONObject.quote(md) + ");";
          mWebView.evaluateJavascript(js, null);
        });
      }
      catch (SecurityException se)
      {
        runOnUiThread(() -> Toast.makeText(this,
            "Sync file permission lost. Please re-select file.", Toast.LENGTH_LONG).show());
      }
      catch (IOException e) { e.printStackTrace(); }
    }).start();
  }

  private void triggerAppCloseSync()
  {
    if (mWebView != null && isPageLoaded)
    {
      mWebView.evaluateJavascript("if(window.exportMarkdownSilent) window.exportMarkdownSilent();", null);
      mWebView.evaluateJavascript("if(window.syncCalendarEventsToAndroid) window.syncCalendarEventsToAndroid();", null);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SECTION 6 — PERMISSION RESULT ROUTING
  // ═══════════════════════════════════════════════════════════════

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults)
  {
    if (requestCode != NOTIFICATION_PERMISSION_REQUEST) return;

    boolean granted = grantResults.length > 0
        && grantResults[0] == PackageManager.PERMISSION_GRANTED;

    boolean wasQuickNote = pendingQuickNoteEnable;
    pendingQuickNoteEnable = false;

    if (wasQuickNote)
    {
      if (granted)
      {
        NotificationHelper.setEnabled(this, true);
        NotificationHelper.show(this, false);
      }
      else
      {
        NotificationHelper.setEnabled(this, false);
        Toast.makeText(this, "Notification permission denied", Toast.LENGTH_SHORT).show();
      }
    }
    else if (!granted)
    {
      Toast.makeText(this, "Notification permission denied", Toast.LENGTH_SHORT).show();
    }
  }
}