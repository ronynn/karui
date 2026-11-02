package io.github.ronynn.karui;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
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

  // ── Gruvbox Dark palette ──────────────────────────────────────────
  // The panel bg matches the drag-handle family so no seams appear
  // while the WebView is loading, and any space the HTML leaves
  // transparent blends into the same palette.
  private static final String PANEL_BG_COLOR   = "#282828"; // gruvbox bg0 (hard)
  private static final String HANDLE_BG_COLOR  = "#3C3836"; // gruvbox bg1
  private static final String PILL_COLOR       = "#928374"; // gruvbox gray
  private static final String CLOSE_COLOR      = "#EBDBB2"; // gruvbox fg1

  private static final int INJECT_RETRY_COUNT = 10;
  private static final long INJECT_RETRY_DELAY_MS = 300L;

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

  private int navBarHeightPx()
  {
    int navResId = getResources().getIdentifier(
        "navigation_bar_height", "dimen", "android");
    if (navResId > 0)
    {
      return getResources().getDimensionPixelSize(navResId);
    }
    return 0;
  }

  private void createOverlay()
  {
    // Full screen height, INCLUDING status bar and nav bar. Using
    // getRealMetrics (not getMetrics) is what makes the panel extend
    // behind the nav bar when combined with FLAG_LAYOUT_IN_SCREEN.
    DisplayMetrics realMetrics = new DisplayMetrics();
    mWindowManager.getDefaultDisplay().getRealMetrics(realMetrics);
    int screenHeight = realMetrics.heightPixels;

    mInitialHeight = (int) (screenHeight * 0.75);
    mMinHeight = (int) (screenHeight * 0.25);
    mMaxHeight = screenHeight;

    BackInterceptLayout rootLayout = new BackInterceptLayout(this);
    rootLayout.setOnBackPressed(() -> dismissOverlay());
    rootLayout.setOrientation(LinearLayout.VERTICAL);
    rootLayout.setBackgroundColor(Color.parseColor(PANEL_BG_COLOR));
    rootLayout.setFocusableInTouchMode(true);
    rootLayout.requestFocus();
    // NOTE: no padding here. The WebView extends to the physical bottom,
    // so its content flows behind the transparent nav bar. If the HTML
    // needs to keep a bottom input un-occluded, it should use the
    // Android.getNavBarHeight() bridge to add its own bottom padding.

    // --- Drag handle (thin) ---
    FrameLayout handle = new FrameLayout(this);
    handle.setBackgroundColor(Color.parseColor(HANDLE_BG_COLOR));
    handle.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(28)));

    View pill = new View(this);
    GradientDrawable pillShape = new GradientDrawable();
    pillShape.setColor(Color.parseColor(PILL_COLOR));
    pillShape.setCornerRadius(dp(2));
    pill.setBackground(pillShape);
    FrameLayout.LayoutParams pillParams = new FrameLayout.LayoutParams(
        dp(32), dp(3), Gravity.CENTER);
    handle.addView(pill, pillParams);

    TextView closeBtn = new TextView(this);
    closeBtn.setText("×");
    closeBtn.setTextSize(22);
    closeBtn.setTextColor(Color.parseColor(CLOSE_COLOR));
    closeBtn.setGravity(Gravity.CENTER);
    FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(
        dp(36), FrameLayout.LayoutParams.MATCH_PARENT, Gravity.END);
    closeBtn.setLayoutParams(closeParams);
    closeBtn.setOnClickListener(v -> dismissOverlay());
    handle.addView(closeBtn);

    // --- WebView ---
    mWebView = new WebView(this);
    mWebView.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, 0, 1.0f));
    // Matches panel bg so the pre-load paint blends with the handle
    // instead of flashing white.
    mWebView.setBackgroundColor(Color.parseColor(PANEL_BG_COLOR));
    mWebView.setVisibility(View.INVISIBLE);
    mWebView.setVerticalScrollBarEnabled(false);
    mWebView.setHorizontalScrollBarEnabled(false);

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

    rootLayout.addView(handle);
    rootLayout.addView(mWebView);

    // --- LayoutParams ---
    // FLAG_LAYOUT_IN_SCREEN: layout coords are the physical screen, so
    //   gravity=BOTTOM sticks the panel to the physical bottom edge —
    //   behind the nav bar area. With FLAG_NOT_TOUCH_MODAL, touches
    //   outside the panel flow to the app underneath; touches ON the
    //   nav bar always go to the system nav bar regardless.
    mParams = new WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        mInitialHeight,
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE,
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        PixelFormat.TRANSLUCENT);

    mParams.gravity = Gravity.BOTTOM | Gravity.START;
    mParams.x = 0;
    mParams.y = 0;

    mOverlayView = rootLayout;
    mWindowManager.addView(mOverlayView, mParams);

    // Slide-in animation from bottom
    mOverlayView.setTranslationY(mInitialHeight);
    mOverlayView.setAlpha(0f);
    mOverlayView.animate()
        .translationY(0f)
        .alpha(1f)
        .setDuration(260)
        .setInterpolator(new DecelerateInterpolator())
        .start();

    // --- Drag-to-resize on the handle ---
    handle.setOnTouchListener(new View.OnTouchListener()
    {
      private int initialHeight;
      private float initialTouchY;
      private boolean dragging;

      @Override
      public boolean onTouch(View v, MotionEvent event)
      {
        switch (event.getActionMasked())
        {
          case MotionEvent.ACTION_DOWN:
            initialHeight = mParams.height;
            initialTouchY = event.getRawY();
            dragging = false;
            return true;
          case MotionEvent.ACTION_MOVE:
            float deltaY = event.getRawY() - initialTouchY;
            if (Math.abs(deltaY) > dp(2)) dragging = true;
            if (dragging)
            {
              int newHeight = (int) (initialHeight - deltaY);
              newHeight = Math.max(mMinHeight, Math.min(mMaxHeight, newHeight));
              mParams.height = newHeight;
              mWindowManager.updateViewLayout(mOverlayView, mParams);
            }
            return true;
          case MotionEvent.ACTION_UP:
          case MotionEvent.ACTION_CANCEL:
            return true;
        }
        return false;
      }
    });
  }

  private void dismissOverlay()
  {
    try
    {
      InputMethodManager imm =
          (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
      if (imm != null && mWebView != null)
      {
        imm.hideSoftInputFromWindow(mWebView.getWindowToken(), 0);
      }
    }
    catch (Exception ignored) {}
    stopSelf();
  }

  // --- Data injection (note-safe) -------------------------------------

  private void injectPendingNotes()
  {
    injectPendingNotes(0);
  }

  private void injectPendingNotes(final int attempt)
  {
    if (!mPageLoaded || mWebView == null) return;

    final SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    final String jsonStr = prefs.getString("pending_notes_json", "[]");
    if (jsonStr.equals("[]") || jsonStr.isEmpty()) return;

    String js = "(function(){"
        + "if (!window.syncNotesArrayFromAndroid) return 'missing';"
        + "try { window.syncNotesArrayFromAndroid(" + JSONObject.quote(jsonStr) + "); return 'ok'; }"
        + "catch(e) { return 'error'; }"
        + "})()";

    mWebView.evaluateJavascript(js, value ->
    {
      if ("\"ok\"".equals(value))
      {
        String current = prefs.getString("pending_notes_json", "[]");
        if (current.equals(jsonStr))
        {
          prefs.edit().remove("pending_notes_json").apply();
        }
        else
        {
          injectPendingNotes(0);
        }
      }
      else if (attempt < INJECT_RETRY_COUNT)
      {
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> injectPendingNotes(attempt + 1), INJECT_RETRY_DELAY_MS);
      }
    });
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

  private static class BackInterceptLayout extends LinearLayout
  {
    private Runnable mOnBack;

    BackInterceptLayout(Context context)
    {
      super(context);
    }

    void setOnBackPressed(Runnable r)
    {
      mOnBack = r;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event)
    {
      if (event.getKeyCode() == KeyEvent.KEYCODE_BACK)
      {
        if (event.getAction() == KeyEvent.ACTION_UP && mOnBack != null)
        {
          mOnBack.run();
        }
        return true;
      }
      return super.dispatchKeyEvent(event);
    }
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
      dismissOverlay();
    }

    /**
     * Pixel height of the system navigation bar. Exposed so the HTML
     * can add its own bottom padding (e.g. on the text-input row)
     * while letting the note list itself flow behind the nav bar.
     *    document.body.style.paddingBottom = Android.getNavBarHeight() + 'px';
     * Or, safer — pad only the input container:
     *    inputBar.style.paddingBottom = Android.getNavBarHeight() + 'px';
     */
    @JavascriptInterface
    public int getNavBarHeight()
    {
      return navBarHeightPx();
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