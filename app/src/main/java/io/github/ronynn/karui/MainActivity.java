package io.github.ronynn.karui;

import android.Manifest;
import android.animation.ObjectAnimator;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
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
  public static final String ACTION_NOTE_ADDED = "io.github.ronynn.karui.ACTION_NOTE_ADDED";

  private static final int CREATE_FILE_REQUEST_CODE = 1;
  private static final int IMPORT_FILE_REQUEST_CODE = 2;
  private static final int FILECHOOSER_RESULTCODE = 3;
  private static final int SYNC_FILE_REQUEST_CODE = 4;
  private static final int IMPORT_MD_FILE_REQUEST_CODE = 5;
  private static final int NOTIFICATION_PERMISSION_REQUEST = 100;
  private static final int OVERLAY_PERMISSION_REQUEST = 101;

  private static final int INJECT_RETRY_COUNT = 10;
  private static final long INJECT_RETRY_DELAY_MS = 300L;

  private static final String PREFS_SYNC = "sync_prefs";
  private static final String KEY_SYNC_URI = "sync_file_uri";
  private static final String PREFS_NOTE_QUEUE = "note_queue";
  private static final String KEY_OVERLAY_PROMPTED = "overlay_prompted";
  // Mirrors OverlayService.KEY_OVERLAY_ACTIVE ("overlay_active"). Kept
  // as its own constant so MainActivity compiles even against an older
  // OverlayService that doesn't expose the symbol.
  private static final String KEY_OVERLAY_ACTIVE = "overlay_active";

  private WebView mWebView;
  private View splashScreen;

  private String pendingFileName;
  private String pendingFileData;
  private String pendingFileType;

  private ValueCallback<Uri[]> mFilePathCallback;

  private boolean isPageLoaded = false;
  private boolean mInjecting = false;
  private boolean pendingQuickNoteEnable = false;

  private final BroadcastReceiver noteReceiver = new BroadcastReceiver()
  {
    @Override
    public void onReceive(Context context, Intent intent)
    {
      if (isPageLoaded)
      {
        injectPendingNotes();
      }
    }
  };

  @Override
  @SuppressLint({"SetJavaScriptEnabled", "AllowFileAccess"})
  protected void onCreate(Bundle savedInstanceState)
  {
    super.onCreate(savedInstanceState);

    Intent launchIntent = getIntent();
    boolean assistLaunch = launchIntent != null
      && Intent.ACTION_ASSIST.equals(launchIntent.getAction());

    // ── ASSIST fast path ────────────────────────────────────────────
    if (assistLaunch && canDrawOverlays())
    {
      startOverlayAndExit();
      return;
    }

    // ── Full-screen UI setup (normal launch or ASSIST fallback) ─────
    setContentView(R.layout.activity_main);

    mWebView = findViewById(R.id.activity_main_webview);
    splashScreen = findViewById(R.id.splash_screen);

    mWebView.setOverScrollMode(View.OVER_SCROLL_NEVER);

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

    mWebView.setWebViewClient(new WebViewClient()
    {
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, String url)
      {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        try
        {
          view.getContext().startActivity(intent);
        }
        catch (ActivityNotFoundException e)
        {
          Toast.makeText(view.getContext(), R.string.no_app_to_open_link, Toast.LENGTH_SHORT).show();
        }
        return true;
      }

      @Override
      public void onPageFinished(WebView view, String url)
      {
        ObjectAnimator fadeOut = ObjectAnimator.ofFloat(splashScreen, "alpha", 1f, 0f);
        fadeOut.setInterpolator(new DecelerateInterpolator());
        fadeOut.setDuration(500);
        fadeOut.start();

        splashScreen.setVisibility(View.GONE);
        mWebView.setVisibility(View.VISIBLE);

        isPageLoaded = true;
        injectPendingNotes();
        readSyncFileAndInject();

        Intent launch = getIntent();
        if (launch != null && Intent.ACTION_ASSIST.equals(launch.getAction()))
        {
          mWebView.evaluateJavascript(
            "if(window.onAssistantLaunched) window.onAssistantLaunched();", null);
        }
      }
    });

    mWebView.setWebChromeClient(new WebChromeClient()
    {
      @Override
      public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams)
      {
        if (mFilePathCallback != null)
        {
          mFilePathCallback.onReceiveValue(null);
        }
        mFilePathCallback = filePathCallback;
        Intent intent = fileChooserParams.createIntent();
        try
        {
          startActivityForResult(intent, FILECHOOSER_RESULTCODE);
        }
        catch (Exception e)
        {
          mFilePathCallback = null;
          return false;
        }
        return true;
      }
    });

    mWebView.loadUrl("file:///android_asset/index.html");

    NotificationHelper.createChannel(this);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
    {
      registerReceiver(noteReceiver, new IntentFilter(ACTION_NOTE_ADDED), Context.RECEIVER_NOT_EXPORTED);
    }
    else
    {
      registerReceiver(noteReceiver, new IntentFilter(ACTION_NOTE_ADDED));
    }

    SharedPreferences calPrefs = getSharedPreferences(CalendarNotificationReceiver.PREFS, MODE_PRIVATE);
    if (calPrefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false))
    {
      CalendarNotificationReceiver.scheduleNext(this);
      CalendarNotificationReceiver.scheduleEventReminders(this);
    }

    if (assistLaunch && !canDrawOverlays())
    {
      requestOverlayPermissionOnboarding();
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Overlay / ASSIST plumbing
  // ────────────────────────────────────────────────────────────────

  private boolean canDrawOverlays()
  {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
    {
      return Settings.canDrawOverlays(this);
    }
    return true;
  }

  private void startOverlayAndExit()
  {
    try
    {
      Intent serviceIntent = new Intent(this, OverlayService.class);
      startService(serviceIntent);
    }
    catch (Exception e)
    {
      Toast.makeText(this, "Could not open floating window: " + e.getMessage(),
                     Toast.LENGTH_LONG).show();
      return;
    }
    moveTaskToBack(true);
    finish();
  }

  private void requestOverlayPermissionOnboarding()
  {
    SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    boolean alreadyPrompted = prefs.getBoolean(KEY_OVERLAY_PROMPTED, false);

    if (!alreadyPrompted)
    {
      prefs.edit().putBoolean(KEY_OVERLAY_PROMPTED, true).apply();
      Toast.makeText(this,
        "Enable 'Display over other apps' for Karui to open as a floating panel.",
        Toast.LENGTH_LONG).show();
      openOverlaySettings();
    }
    else
    {
      Toast.makeText(this,
        "Floating mode needs 'Display over other apps' permission. "
          + "Grant it from Karui's settings.",
        Toast.LENGTH_LONG).show();
    }
  }

  private void openOverlaySettings()
  {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
    try
    {
      Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                 Uri.parse("package:" + getPackageName()));
      startActivityForResult(intent, OVERLAY_PERMISSION_REQUEST);
    }
    catch (Exception e)
    {
      try
      {
        startActivityForResult(
          new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION),
          OVERLAY_PERMISSION_REQUEST);
      }
      catch (Exception ignored) {}
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Data injection (note-safe, dedupe-aware)
  // ────────────────────────────────────────────────────────────────

  private void injectPendingNotes()
  {
    injectPendingNotes(0);
  }

  private void injectPendingNotes(final int attempt)
  {
    // Guard #1 — when the overlay is active, it is the sole injector.
    // This prevents the same note being consumed by both MainActivity's
    // WebView and the overlay's WebView (the duplication bug).
    SharedPreferences queuePrefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    if (queuePrefs.getBoolean(KEY_OVERLAY_ACTIVE, false))
    {
      return;
    }

    // Guard #2 — no concurrent injections within this instance.
    if (mInjecting) return;
    if (!isPageLoaded || mWebView == null) return;

    final SharedPreferences prefs = queuePrefs;
    final String jsonStr = prefs.getString("pending_notes_json", "[]");
    if (jsonStr.equals("[]") || jsonStr.isEmpty()) return;

    mInjecting = true;

    String js = "(function(){"
        + "if (!window.syncNotesArrayFromAndroid) return 'missing';"
        + "try { window.syncNotesArrayFromAndroid(" + JSONObject.quote(jsonStr) + "); return 'ok'; }"
        + "catch(e) { return 'error'; }"
        + "})()";

    mWebView.evaluateJavascript(js, value ->
    {
      mInjecting = false;
      if ("\"ok\"".equals(value))
      {
        String current = prefs.getString("pending_notes_json", "[]");
        if (current.equals(jsonStr))
        {
          prefs.edit().remove("pending_notes_json").apply();
        }
        else
        {
          // New note arrived mid-delivery. Redeliver augmented queue.
          injectPendingNotes(0);
        }
      }
      else if (attempt < INJECT_RETRY_COUNT)
      {
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> injectPendingNotes(attempt + 1), INJECT_RETRY_DELAY_MS);
      }
      // else: give up for now; queue untouched, next trigger will retry.
    });
  }

  private void readSyncFileAndInject()
  {
    if (!isPageLoaded) return;

    SharedPreferences prefs = getSharedPreferences(PREFS_SYNC, MODE_PRIVATE);
    String uriStr = prefs.getString(KEY_SYNC_URI, null);
    if (uriStr == null || uriStr.isEmpty()) return;

    try
    {
      Uri uri = Uri.parse(uriStr);
      InputStream inputStream = getContentResolver().openInputStream(uri);
      if (inputStream == null) return;

      BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
      StringBuilder sb = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null)
      {
        sb.append(line).append("\n");
      }
      reader.close();

      String mdContent = sb.toString();
      String js = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid(" + JSONObject.quote(mdContent) + ");";
      mWebView.evaluateJavascript(js, null);
    }
    catch (SecurityException se)
    {
      Toast.makeText(this, "Sync file permission lost. Please re-select file.", Toast.LENGTH_LONG).show();
    }
    catch (IOException e)
    {
      e.printStackTrace();
    }
  }

  private void triggerAppCloseSync()
  {
    if (mWebView != null && isPageLoaded)
    {
      mWebView.evaluateJavascript("if(window.exportMarkdownSilent) window.exportMarkdownSilent();", null);
      mWebView.evaluateJavascript("if(window.syncCalendarEventsToAndroid) window.syncCalendarEventsToAndroid();", null);
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Lifecycle
  // ────────────────────────────────────────────────────────────────

  @Override
  protected void onResume()
  {
    super.onResume();

    NotificationHelper.ensureMatchesPreference(this);

    if (isPageLoaded)
    {
      // If the overlay just closed, its WebView wrote the latest state
      // to the sync file — re-read before injecting anything so we don't
      // operate on stale in-memory state and export it back over the
      // overlay's work.
      SharedPreferences queuePrefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
      if (!queuePrefs.getBoolean(KEY_OVERLAY_ACTIVE, false))
      {
        readSyncFileAndInject();
      }
      injectPendingNotes();
    }

    SharedPreferences calPrefs = getSharedPreferences(CalendarNotificationReceiver.PREFS, MODE_PRIVATE);
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

    if (intent != null && Intent.ACTION_ASSIST.equals(intent.getAction()))
    {
      if (canDrawOverlays())
      {
        startOverlayAndExit();
      }
      else
      {
        Toast.makeText(this,
          "Enable 'Display over other apps' for floating mode.",
          Toast.LENGTH_LONG).show();
      }
    }
  }

  @Override
  protected void onStop()
  {
    super.onStop();
    triggerAppCloseSync();
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data)
  {
    super.onActivityResult(requestCode, resultCode, data);

    if (requestCode == OVERLAY_PERMISSION_REQUEST)
    {
      if (canDrawOverlays())
      {
        startOverlayAndExit();
      }
      return;
    }

    if (requestCode == CREATE_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null && pendingFileData != null)
      {
        try
        {
          OutputStream outputStream = getContentResolver().openOutputStream(data.getData());
          if (outputStream != null)
          {
            outputStream.write(pendingFileData.getBytes());
            outputStream.close();
          }
        }
        catch (IOException e)
        {
          e.printStackTrace();
        }
      }
    }
    else if (requestCode == IMPORT_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null)
      {
        try
        {
          InputStream inputStream = getContentResolver().openInputStream(data.getData());
          BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
          StringBuilder sb = new StringBuilder();
          String line;
          while ((line = reader.readLine()) != null)
          {
            sb.append(line);
          }
          reader.close();
          String jsonContent = sb.toString();

          String jsCode = "if(window.setAndroidNotes) window.setAndroidNotes(" + JSONObject.quote(jsonContent) + ");";
          mWebView.evaluateJavascript(jsCode, null);
        }
        catch (IOException e)
        {
          e.printStackTrace();
        }
      }
    }
    else if (requestCode == IMPORT_MD_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null)
      {
        try
        {
          InputStream inputStream = getContentResolver().openInputStream(data.getData());
          BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
          StringBuilder sb = new StringBuilder();
          String line;
          while ((line = reader.readLine()) != null)
          {
            sb.append(line).append("\n");
          }
          reader.close();
          String mdContent = sb.toString();

          String jsCode = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid(" + JSONObject.quote(mdContent) + ");";
          mWebView.evaluateJavascript(jsCode, null);
        }
        catch (IOException e)
        {
          e.printStackTrace();
        }
      }
    }
    else if (requestCode == SYNC_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null)
      {
        Uri uri = data.getData();
        try
        {
          int takeFlags = data.getFlags()
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
          getContentResolver().takePersistableUriPermission(uri, takeFlags);

          SharedPreferences prefs = getSharedPreferences(PREFS_SYNC, MODE_PRIVATE);
          prefs.edit().putString(KEY_SYNC_URI, uri.toString()).apply();

          InputStream inputStream = getContentResolver().openInputStream(uri);
          StringBuilder sb = new StringBuilder();
          if (inputStream != null)
          {
            BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
            String line;
            while ((line = reader.readLine()) != null)
            {
              sb.append(line).append("\n");
            }
            reader.close();
          }

          String existingContent = sb.toString().trim();

          if (!existingContent.isEmpty())
          {
            String jsCode = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid(" + JSONObject.quote(existingContent) + ");";
            mWebView.evaluateJavascript(jsCode, null);
            Toast.makeText(this, "Imported notes from sync file!", Toast.LENGTH_SHORT).show();
          }
          else if (pendingFileData != null && !pendingFileData.isEmpty())
          {
            OutputStream outputStream = getContentResolver().openInputStream(uri) != null ?
              getContentResolver().openOutputStream(uri, "rwt") : getContentResolver().openOutputStream(uri);
            if (outputStream != null)
            {
              outputStream.write(pendingFileData.getBytes());
              outputStream.close();
            }
            Toast.makeText(this, "Sync file connected!", Toast.LENGTH_SHORT).show();
          }

          String jsCode = "if(window.onSyncFileSelected) window.onSyncFileSelected(" + JSONObject.quote(uri.toString()) + ");";
          mWebView.evaluateJavascript(jsCode, null);
        }
        catch (Exception e)
        {
          Toast.makeText(this, "Failed to initialize sync file: " + e.getMessage(), Toast.LENGTH_LONG).show();
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
        String dataString = data.getDataString();
        if (dataString != null)
        {
          results = new Uri[]{Uri.parse(dataString)};
        }
        else if (data.getClipData() != null)
        {
          int count = data.getClipData().getItemCount();
          results = new Uri[count];
          for (int i = 0; i < count; i++)
          {
            results[i] = data.getClipData().getItemAt(i).getUri();
          }
        }
      }
      mFilePathCallback.onReceiveValue(results);
      mFilePathCallback = null;
    }
  }

  @Override
  public void onBackPressed()
  {
    if (mWebView != null && mWebView.canGoBack())
    {
      mWebView.goBack();
    }
    else
    {
      super.onBackPressed();
    }
  }

  @Override
  protected void onDestroy()
  {
    triggerAppCloseSync();
    super.onDestroy();
    try
    {
      unregisterReceiver(noteReceiver);
    }
    catch (Exception ignored) {}

    if (mWebView != null)
    {
      mWebView.destroy();
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  JavaScript bridge
  // ────────────────────────────────────────────────────────────────

  public class WebAppInterface
  {
    @JavascriptInterface
    public void setupSyncFile(String defaultFileName, String currentContent)
    {
      pendingFileName = (defaultFileName != null && !defaultFileName.trim().isEmpty()) ? defaultFileName : "file.md";
      pendingFileData = currentContent != null ? currentContent : "";

      Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType("text/markdown");
      intent.putExtra(Intent.EXTRA_TITLE, pendingFileName);

      try
      {
        startActivityForResult(intent, SYNC_FILE_REQUEST_CODE);
      }
      catch (ActivityNotFoundException e)
      {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, "No document picker found on device.", Toast.LENGTH_SHORT).show());
      }
    }

    @JavascriptInterface
    public void saveFileSync(String filePath, String content)
    {
      if (filePath == null || filePath.trim().isEmpty()) return;

      try
      {
        Uri uri = Uri.parse(filePath);
        OutputStream outputStream = getContentResolver().openOutputStream(uri, "rwt");
        if (outputStream == null)
        {
          outputStream = getContentResolver().openOutputStream(uri);
        }
        if (outputStream != null)
        {
          outputStream.write(content.getBytes());
          outputStream.close();

          Intent updateIntent = new Intent(MainActivity.ACTION_NOTE_ADDED);
          updateIntent.setPackage(getPackageName());
          sendBroadcast(updateIntent);
        }
      }
      catch (Exception e)
      {
        e.printStackTrace();
      }
    }

    @JavascriptInterface
    public void triggerManualReadSync()
    {
      runOnUiThread(() -> readSyncFileAndInject());
    }

    @JavascriptInterface
    public void importMarkdownFile()
    {
      Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);

      String[] mimeTypes = {"text/markdown", "text/plain", "text/x-markdown", "application/octet-stream"};
      intent.setType("*/*");
      intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);

      try
      {
        startActivityForResult(intent, IMPORT_MD_FILE_REQUEST_CODE);
      }
      catch (ActivityNotFoundException e)
      {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, "No document picker found", Toast.LENGTH_SHORT).show());
      }
    }

    @JavascriptInterface
    public void saveFile(String fileName, String fileData, String fileType)
    {
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
    public void importJsonFile()
    {
      Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType("application/json");
      startActivityForResult(intent, IMPORT_FILE_REQUEST_CODE);
    }

    @JavascriptInterface
    public void toggleNotification(boolean enable)
    {
      runOnUiThread(() -> {
        if (enable)
        {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
              && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                 != PackageManager.PERMISSION_GRANTED)
          {
            pendingQuickNoteEnable = true;
            requestPermissions(
              new String[]{Manifest.permission.POST_NOTIFICATIONS},
              NOTIFICATION_PERMISSION_REQUEST);
            return;
          }
          NotificationHelper.setEnabled(MainActivity.this, true);
          NotificationHelper.show(MainActivity.this, false);
        }
        else
        {
          NotificationHelper.setEnabled(MainActivity.this, false);
          NotificationHelper.cancel(MainActivity.this);
        }
      });
    }

    @JavascriptInterface
    public boolean isNotificationEnabled()
    {
      return NotificationHelper.isEnabled(MainActivity.this);
    }

    @JavascriptInterface
    public void setInboxTabName(String tabName)
    {
      if (tabName == null || tabName.trim().isEmpty())
      {
        tabName = "Inbox";
      }
      getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
        .edit().putString("inbox_tab_name", tabName.trim()).apply();
    }

    @JavascriptInterface
    public void toggleScreenshots(boolean disable)
    {
      runOnUiThread(() -> {
        if (disable)
        {
          getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        else
        {
          getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
      });
    }

    // ── Overlay permission bridge ──────────────────────────────────

    @JavascriptInterface
    public boolean isOverlayPermissionGranted()
    {
      return canDrawOverlays();
    }

    @JavascriptInterface
    public void requestOverlayPermission()
    {
      runOnUiThread(() -> openOverlaySettings());
    }

    // ── Calendar-event bridge ──────────────────────────────────────

    @JavascriptInterface
    public void updateCalendarEvents(String json)
    {
      if (json == null) json = "[]";
      SharedPreferences prefs = getSharedPreferences(CalendarNotificationReceiver.PREFS, MODE_PRIVATE);
      String oldJson = prefs.getString(CalendarNotificationReceiver.KEY_EVENTS_JSON, "[]");

      prefs.edit().putString(CalendarNotificationReceiver.KEY_EVENTS_JSON, json).apply();

      try
      {
        JSONArray oldArr = new JSONArray(oldJson);
        JSONArray newArr = new JSONArray(json);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null)
        {
          for (int i = 0; i < oldArr.length(); i++)
          {
            JSONObject oldO = oldArr.getJSONObject(i);
            int oldId = oldO.optInt("id", 0);
            boolean stillActive = false;
            for (int j = 0; j < newArr.length(); j++)
            {
              JSONObject newO = newArr.getJSONObject(j);
              if (newO.optInt("id", 0) == oldId && !newO.optBoolean("completed", false))
              {
                stillActive = true;
                break;
              }
            }
            if (!stillActive)
            {
              nm.cancel(CalendarNotificationReceiver.EVENT_NOTIFICATION_BASE + Math.abs(oldId % 100000));
            }
          }
        }
      }
      catch (Exception ignored) {}

      if (prefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false))
      {
        Intent refresh = new Intent(MainActivity.this, CalendarNotificationReceiver.class);
        refresh.setAction(CalendarNotificationReceiver.ACTION_REFRESH);
        sendBroadcast(refresh);
      }
    }

    @JavascriptInterface
    public void setCalendarNotificationsEnabled(final boolean enabled)
    {
      SharedPreferences prefs = getSharedPreferences(CalendarNotificationReceiver.PREFS, MODE_PRIVATE);
      boolean wasEnabled = prefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false);
      prefs.edit().putBoolean(CalendarNotificationReceiver.KEY_ENABLED, enabled).apply();

      final boolean justEnabled = enabled && !wasEnabled;

      runOnUiThread(() ->
      {
        if (enabled)
        {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
              && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                 != PackageManager.PERMISSION_GRANTED)
          {
            requestPermissions(
              new String[]{Manifest.permission.POST_NOTIFICATIONS},
              NOTIFICATION_PERMISSION_REQUEST);
          }

          if (justEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
          {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am != null && !am.canScheduleExactAlarms())
            {
              Toast.makeText(MainActivity.this,
                "Allow 'Alarms & reminders' so calendar reminders fire on time.",
                Toast.LENGTH_LONG).show();
              Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
              i.setData(Uri.parse("package:" + getPackageName()));
              try { startActivity(i); } catch (Exception ignored) {}
            }
          }

          CalendarNotificationReceiver.scheduleNext(MainActivity.this);
          CalendarNotificationReceiver.scheduleEventReminders(MainActivity.this);

          if (justEnabled)
          {
            Intent show = new Intent(MainActivity.this, CalendarNotificationReceiver.class);
            sendBroadcast(show);
          }
        }
        else
        {
          CalendarNotificationReceiver.cancel(MainActivity.this);
        }
      });
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Permission result routing (quick-note vs calendar)
  // ────────────────────────────────────────────────────────────────

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