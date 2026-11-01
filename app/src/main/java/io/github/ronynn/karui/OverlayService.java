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
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
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

  /**
   * Background colour used to prevent the WebView's white flash on first
   * paint. Change this if your web app uses a different theme colour.
   */
  private static final String PANEL_BG_COLOR = "#1A1A1A";
  private static final String HANDLE_BG_COLOR = "#2A2A2A";
  private static final String PILL_COLOR = "#7A7A7A";

  private WindowManager mWindowManager;
  private View mOverlayView;
  private WindowManager.LayoutParams mParams;
  private WebView mWebView;

  private int mInitialHeight;
  private int mMinHeight;
  private int mMaxHeight;

  private boolean mPageLoaded = false;

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

  private int dp(float value)
  {
    return (int) TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
  }

  private void createOverlay()
  {
    int screenHeight = getResources().getDisplayMetrics().heightPixels;
    mInitialHeight = (int) (screenHeight * 0.75);
    mMinHeight = (int) (screenHeight * 0.25);
    mMaxHeight = screenHeight;

    LinearLayout rootLayout = new LinearLayout(this);
    rootLayout.setOrientation(LinearLayout.VERTICAL);
    // Fill with the eventual panel colour so the very first paint is not
    // the default white that WebView shows before HTML loads.
    rootLayout.setBackgroundColor(Color.parseColor(PANEL_BG_COLOR));

    // --- Drag handle (thin) ---
    FrameLayout dragHandle = new FrameLayout(this);
    dragHandle.setBackgroundColor(Color.parseColor(HANDLE_BG_COLOR));
    LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(28));
    dragHandle.setLayoutParams(handleParams);

    View pill = new View(this);
    FrameLayout.LayoutParams pillParams = new FrameLayout.LayoutParams(
        dp(48), dp(4));
    pillParams.gravity = Gravity.CENTER;
    pill.setLayoutParams(pillParams);
    pill.setBackgroundColor(Color.parseColor(PILL_COLOR));
    dragHandle.addView(pill);

    // --- WebView ---
    mWebView = new WebView(this);
    mWebView.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, 0, 1.0f));
    mWebView.setBackgroundColor(Color.parseColor(PANEL_BG_COLOR));
    // Keep it invisible until the page has actually rendered, so the user
    // sees the panel colour, then the content fades in — no white flash.
    mWebView.setVisibility(View.INVISIBLE);

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
        injectPendingNotes();
        readSyncFileAndInject();

        view.setAlpha(0f);
        view.setVisibility(View.VISIBLE);
        view.animate().alpha(1f).setDuration(150).start();
      }
    });

    mWebView.addJavascriptInterface(new OverlayWebAppInterface(), "Android");
    mWebView.loadUrl("file:///android_asset/index.html");

    rootLayout.addView(dragHandle);
    rootLayout.addView(mWebView);

    // --- LayoutParams ---
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

    // --- Slide-in animation ---
    // Start translated down by the full panel height (fully off-screen),
    // then animate to the natural position.
    mOverlayView.setTranslationY(mInitialHeight);
    mOverlayView.setAlpha(0f);
    mOverlayView.animate()
        .translationY(0f)
        .alpha(1f)
        .setDuration(260)
        .setInterpolator(new DecelerateInterpolator())
        .start();

    // --- Drag-to-resize on the handle ---
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

    // --- Tap outside to dismiss ---
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

  // --- Data injection ---------------------------------------------------

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

  @Override
  public int onStartCommand(Intent intent, int flags, int startId)
  {
    return START_NOT_STICKY;
  }

  @Override
  public void onDestroy()
  {
    triggerCloseSync();

    if (mOverlayView != null && mWindowManager != null)
    {
      try
      {
        mWindowManager.removeView(mOverlayView);
      }
      catch (Exception ignored) {}
      mOverlayView = null;
    }

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

  // --- JS bridge -------------------------------------------------------

  public class OverlayWebAppInterface
  {
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

    @JavascriptInterface
    public boolean isOverlayMode()
    {
      return true;
    }

    @JavascriptInterface
    public void setupSyncFile(String defaultFileName, String currentContent)
    {
      showToast("Open the full Karui app for this.");
    }

    @JavascriptInterface
    public void saveFile(String fileName, String fileData, String fileType)
    {
      showToast("Open the full Karui app for this.");
    }

    @JavascriptInterface
    public void importJsonFile()
    {
      showToast("Open the full Karui app for this.");
    }

    @JavascriptInterface
    public void importMarkdownFile()
    {
      showToast("Open the full Karui app for this.");
    }

    @JavascriptInterface
    public void toggleNotification(boolean enable)
    {
      showToast("Open the full Karui app to change the status-bar toggle.");
    }

    @JavascriptInterface
    public void toggleScreenshots(boolean disable) {}

    @JavascriptInterface
    public void updateCalendarEvents(String json) {}

    @JavascriptInterface
    public void setCalendarNotificationsEnabled(boolean enabled) {}
  }

  private void showToast(final String msg)
  {
    Toast.makeText(getApplicationContext(), msg, Toast.LENGTH_SHORT).show();
  }
}