package io.github.ronynn.karui;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;

public class OverlayService extends Service
{
  private static final String PREFS_SYNC = "sync_prefs";
  private static final String KEY_SYNC_URI = "sync_file_uri";
  private static final String PREFS_NOTE_QUEUE = "note_queue";
  private static final String KEY_NOTIFICATION_ENABLED = "notification_enabled";

  private WindowManager mWindowManager;
  private View mOverlayView;
  private WindowManager.LayoutParams mParams;
  private WebView mWebView;

  private int mInitialHeight;
  private int mMinHeight;
  private int mMaxHeight;

  private boolean mPageLoaded = false;

  // Push externally-added notes (from the status-bar reply, from a widget
  // tap, or from another app sharing to Karui) straight into the open
  // overlay without needing to reopen it.
  private final BroadcastReceiver noteReceiver = new BroadcastReceiver()
  {
    @Override
    public void onReceive(Context context, Intent intent)
    {
      if (mPageLoaded && mWebView != null)
      {
        injectPendingNotes();
      }
    }
  };

  @Override
  public void onCreate()
  {
    super.onCreate();
    mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

    IntentFilter filter = new IntentFilter(MainActivity.ACTION_NOTE_ADDED);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
    {
      registerReceiver(noteReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    }
    else
    {
      registerReceiver(noteReceiver, filter);
    }

    createOverlay();
  }

  private void createOverlay()
  {
    // --- 1. Screen dimensions and resize limits ---
    int screenHeight = getResources().getDisplayMetrics().heightPixels;
    mInitialHeight = (int) (screenHeight * 0.75);
    mMinHeight = (int) (screenHeight * 0.25);
    mMaxHeight = screenHeight;

    // --- 2. Programmatic layout ---
    LinearLayout rootLayout = new LinearLayout(this);
    rootLayout.setOrientation(LinearLayout.VERTICAL);
    rootLayout.setBackgroundColor(Color.TRANSPARENT);

    // --- Drag handle ---
    TextView dragHandle = new TextView(this);
    dragHandle.setText("≡");
    dragHandle.setTextSize(24);
    dragHandle.setTextColor(Color.WHITE);
    dragHandle.setGravity(Gravity.CENTER);
    dragHandle.setBackgroundColor(Color.parseColor("#333333"));
    LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, 80);
    dragHandle.setLayoutParams(handleParams);

    // --- WebView ---
    mWebView = new WebView(this);
    mWebView.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, 0, 1.0f));
    WebSettings settings = mWebView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    settings.setAllowFileAccessFromFileURLs(true);
    settings.setAllowUniversalAccessFromFileURLs(true);

    mWebView.setWebViewClient(new WebViewClient()
    {
      @Override
      public void onPageFinished(WebView view, String url)
      {
        mPageLoaded = true;
        // Order matters: pending notes first (so a note captured while the
        // overlay was closed is not lost when the sync file overwrites state),
        // then the full sync file (which is the source of truth for display).
        injectPendingNotes();
        readSyncFileAndInject();
      }
    });

    mWebView.addJavascriptInterface(new OverlayWebAppInterface(), "Android");
    mWebView.loadUrl("file:///android_asset/index.html");

    rootLayout.addView(dragHandle);
    rootLayout.addView(mWebView);

    // --- 3. WindowManager.LayoutParams ---
    mParams = new WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        mInitialHeight,
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE,
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
        PixelFormat.TRANSLUCENT);

    mParams.gravity = Gravity.BOTTOM | Gravity.START;
    mParams.x = 0;
    mParams.y = 0;

    mOverlayView = rootLayout;
    mWindowManager.addView(mOverlayView, mParams);

    // --- 4. Drag-to-resize on the handle ---
    dragHandle.setOnTouchListener(new View.OnTouchListener()
    {
      private int initialHeight;
      private float initialTouchY;

      @Override
      public boolean onTouch(View v, MotionEvent event)
      {
        switch (event.getAction())
        {
          case MotionEvent.ACTION_DOWN:
            initialHeight = mParams.height;
            initialTouchY = event.getRawY();
            return true;
          case MotionEvent.ACTION_MOVE:
            float deltaY = event.getRawY() - initialTouchY;
            int newHeight = (int) (initialHeight - deltaY);
            newHeight = Math.max(mMinHeight, Math.min(mMaxHeight, newHeight));
            mParams.height = newHeight;
            mWindowManager.updateViewLayout(mOverlayView, mParams);
            return true;
          case MotionEvent.ACTION_UP:
            return true;
        }
        return false;
      }
    });

    // --- 5. Tap outside to dismiss ---
    mOverlayView.setOnTouchListener(new View.OnTouchListener()
    {
      @Override
      public boolean onTouch(View v, MotionEvent event)
      {
        if (event.getAction() == MotionEvent.ACTION_OUTSIDE)
        {
          stopSelf();
          return true;
        }
        return false;
      }
    });
  }

  // --- Data injection (mirrors MainActivity) -------------------------

  private void injectPendingNotes()
  {
    if (!mPageLoaded || mWebView == null) return;

    SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    String jsonStr = prefs.getString("pending_notes_json", "[]");
    if (jsonStr.equals("[]") || jsonStr.isEmpty()) return;

    prefs.edit().remove("pending_notes_json").apply();

    String js = "if(window.syncNotesArrayFromAndroid) window.syncNotesArrayFromAndroid("
      + JSONObject.quote(jsonStr) + ");";
    mWebView.evaluateJavascript(js, null);
  }

  private void readSyncFileAndInject()
  {
    if (!mPageLoaded || mWebView == null) return;

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
      String js = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid("
        + JSONObject.quote(mdContent) + ");";
      mWebView.evaluateJavascript(js, null);
    }
    catch (Exception e)
    {
      e.printStackTrace();
    }
  }

  /**
   * Ask the web layer to persist its in-memory state to the sync file.
   * The JS callback fires asynchronously, so the WebView must outlive this
   * call long enough for `Android.saveFileSync(...)` to round-trip.
   */
  private void triggerCloseSync()
  {
    if (mWebView != null && mPageLoaded)
    {
      mWebView.evaluateJavascript(
        "if(window.exportMarkdownSilent) window.exportMarkdownSilent();", null);
      mWebView.evaluateJavascript(
        "if(window.syncCalendarEventsToAndroid) window.syncCalendarEventsToAndroid();", null);
    }
  }

  // --- Lifecycle -----------------------------------------------------

  @Override
  public int onStartCommand(Intent intent, int flags, int startId)
  {
    return START_NOT_STICKY;
  }

  @Override
  public void onDestroy()
  {
    // 1. Ask JS to persist while the WebView is still alive.
    triggerCloseSync();

    // 2. Visually close immediately — the user sees the panel disappear
    //    without waiting for the save round-trip.
    if (mOverlayView != null && mWindowManager != null)
    {
      try
      {
        mWindowManager.removeView(mOverlayView);
      }
      catch (Exception ignored) {}
      mOverlayView = null;
    }

    // 3. Keep the WebView alive briefly so `Android.saveFileSync(...)` can
    //    land, then destroy it. The `Android` bridge object is an inner
    //    class of this service, so `getContentResolver()` still works during
    //    this window.
    final WebView webToDestroy = mWebView;
    mWebView = null;
    mPageLoaded = false;
    if (webToDestroy != null)
    {
      new Handler(Looper.getMainLooper()).postDelayed(new Runnable()
      {
        @Override
        public void run()
        {
          try
          {
            webToDestroy.destroy();
          }
          catch (Exception ignored) {}
        }
      }, 1000);
    }

    try
    {
      unregisterReceiver(noteReceiver);
    }
    catch (Exception ignored) {}

    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent)
  {
    return null;
  }

  // --- JS bridge -----------------------------------------------------

  public class OverlayWebAppInterface
  {
    // ── Core persistence ──────────────────────────────────────────

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
      readSyncFileAndInject();
    }

    @JavascriptInterface
    public void saveNote(final String noteText)
    {
      if (noteText == null || noteText.trim().isEmpty()) return;
      ProcessTextActivity.saveNoteToQueue(OverlayService.this, noteText.trim());
      Intent updateIntent = new Intent(MainActivity.ACTION_NOTE_ADDED);
      updateIntent.setPackage(getPackageName());
      sendBroadcast(updateIntent);
    }

    @JavascriptInterface
    public void closeOverlay()
    {
      stopSelf();
    }

    // ── Settings that work fine from the Service ──────────────────

    @JavascriptInterface
    public void setInboxTabName(String tabName)
    {
      if (tabName == null || tabName.trim().isEmpty()) tabName = "Inbox";
      getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
        .edit().putString("inbox_tab_name", tabName.trim()).apply();
    }

    @JavascriptInterface
    public boolean isNotificationEnabled()
    {
      return getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
        .getBoolean(KEY_NOTIFICATION_ENABLED, false);
    }

    /** Lets the JS layer know it's running in the floating panel and can
     *  hide full-screen-only buttons (settings, import, etc.). */
    @JavascriptInterface
    public boolean isOverlayMode()
    {
      return true;
    }

    // ── Activity-only operations: stub with a guiding toast ───────

    @JavascriptInterface
    public void setupSyncFile(String defaultFileName, String currentContent)
    {
      notifyPickerUnavailable();
    }

    @JavascriptInterface
    public void saveFile(String fileName, String fileData, String fileType)
    {
      notifyPickerUnavailable();
    }

    @JavascriptInterface
    public void importJsonFile()
    {
      notifyPickerUnavailable();
    }

    @JavascriptInterface
    public void importMarkdownFile()
    {
      notifyPickerUnavailable();
    }

    @JavascriptInterface
    public void toggleNotification(boolean enable)
    {
      showToast("Open the full Karui app to change the status-bar toggle.");
    }

    @JavascriptInterface
    public void toggleScreenshots(boolean disable)
    {
      // No Activity window to apply FLAG_SECURE to.
    }

    @JavascriptInterface
    public void updateCalendarEvents(String json)
    {
      // Calendar setup lives in the main app.
    }

    @JavascriptInterface
    public void setCalendarNotificationsEnabled(boolean enabled)
    {
      // Calendar setup lives in the main app.
    }
  }

  private void notifyPickerUnavailable()
  {
    showToast("Open the full Karui app for this.");
  }

  private void showToast(final String msg)
  {
    Toast.makeText(getApplicationContext(), msg, Toast.LENGTH_SHORT).show();
  }
}