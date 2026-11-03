package io.github.ronynn.karui;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
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
import android.view.WindowMetrics;
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
  static final String KEY_OVERLAY_ACTIVE = "overlay_active";

  private static final String PANEL_BG_COLOR   = "#282828";
  private static final String HANDLE_BG_COLOR  = "#3C3836";
  private static final String PILL_COLOR       = "#928374";
  private static final String CLOSE_COLOR      = "#EBDBB2";

  private static final int  INJECT_RETRY_COUNT    = 10;
  private static final long INJECT_RETRY_DELAY_MS = 300L;

  /**
   * Time to keep the WebView warm after the user dismisses the overlay.
   * Next ASSIST within this window is near-instant. After this, the
   * service auto-stops and releases ~100 MB.
   */
  private static final long KEEP_WARM_MS = 5L * 60L * 1000L;

  private final Handler mHandler = new Handler(Looper.getMainLooper());
  private Runnable mStopRunnable;

  private WindowManager mWindowManager;
  private View mOverlayView;
  private WindowManager.LayoutParams mParams;
  private WebView mWebView;

  private int mInitialHeight;
  private int mMinHeight;
  private int mMaxHeight;
  private int mNavBarHeight;

  private boolean mPageLoaded = false;
  private boolean mInjecting = false;
  private boolean mOverlayAttached = false;

  private final BroadcastReceiver noteReceiver = new BroadcastReceiver()
  {
    @Override
    public void onReceive(Context context, Intent intent)
    {
      if (mOverlayAttached && mPageLoaded && mWebView != null)
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
    // NOTE: overlay view is created on first onStartCommand, not here.
  }

  private int dp(float v)
  {
    return (int) TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
  }

  private int navBarHeightPx()
  {
    int id = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
    return id > 0 ? getResources().getDimensionPixelSize(id) : 0;
  }

  private int physicalScreenHeight()
  {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
    {
      WindowMetrics wm = mWindowManager.getMaximumWindowMetrics();
      Rect b = wm.getBounds();
      return b.height();
    }
    DisplayMetrics dm = new DisplayMetrics();
    mWindowManager.getDefaultDisplay().getRealMetrics(dm);
    return dm.heightPixels;
  }

  // ────────────────────────────────────────────────────────────────
  //  Service lifecycle
  // ────────────────────────────────────────────────────────────────

  @Override
  public int onStartCommand(Intent intent, int flags, int startId)
  {
    // Cancel any pending auto-stop — we're being used again.
    if (mStopRunnable != null)
    {
      mHandler.removeCallbacks(mStopRunnable);
      mStopRunnable = null;
    }

    if (mOverlayView == null)
    {
      createOverlayView();   // First-ever show: build WebView, loadUrl
    }

    if (!mOverlayAttached)
    {
      attachOverlay();       // Add to WindowManager + slide in
    }
    // else: already showing; nothing to do.

    return START_NOT_STICKY;
  }

  private void attachOverlay()
  {
    try
    {
      mWindowManager.addView(mOverlayView, mParams);
      mOverlayAttached = true;
    }
    catch (Exception e)
    {
      // Defensive: if a previous add failed halfway, remove and retry.
      try { mWindowManager.removeView(mOverlayView); } catch (Exception ignored) {}
      try
      {
        mWindowManager.addView(mOverlayView, mParams);
        mOverlayAttached = true;
      }
      catch (Exception e2)
      {
        e2.printStackTrace();
        stopSelf();
        return;
      }
    }

    // Mark overlay as the sole note injector.
    getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
      .edit().putBoolean(KEY_OVERLAY_ACTIVE, true).apply();

    // Slide-in animation
    mOverlayView.setTranslationY(mInitialHeight);
    mOverlayView.setAlpha(0f);
    mOverlayView.animate()
        .translationY(0f)
        .alpha(1f)
        .setDuration(260)
        .setInterpolator(new DecelerateInterpolator())
        .start();

    // Refresh content — the WebView may already be loaded from a
    // previous show, so onPageFinished won't fire again.
    if (mPageLoaded && mWebView != null)
    {
      injectPendingNotes();
      readSyncFileAndInject();
    }
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

    // Let the JS layer persist its current state before we detach.
    triggerCloseSync();

    if (mOverlayView != null && mOverlayAttached)
    {
      try { mWindowManager.removeView(mOverlayView); } catch (Exception ignored) {}
      mOverlayAttached = false;
    }

    // Release the injection lock so MainActivity can handle notes.
    getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
      .edit().putBoolean(KEY_OVERLAY_ACTIVE, false).apply();

    // Auto-stop after KEEP_WARM_MS so the WebView isn't held forever.
    scheduleStopTimer();
  }

  private void scheduleStopTimer()
  {
    mStopRunnable = new Runnable()
    {
      @Override
      public void run()
      {
        if (!mOverlayAttached) stopSelf();
      }
    };
    mHandler.postDelayed(mStopRunnable, KEEP_WARM_MS);
  }

  @Override
  public void onDestroy()
  {
    if (mStopRunnable != null)
    {
      mHandler.removeCallbacks(mStopRunnable);
      mStopRunnable = null;
    }

    triggerCloseSync();

    if (mOverlayView != null && mOverlayAttached && mWindowManager != null)
    {
      try { mWindowManager.removeView(mOverlayView); } catch (Exception ignored) {}
      mOverlayAttached = false;
    }
    mOverlayView = null;

    getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
      .edit().putBoolean(KEY_OVERLAY_ACTIVE, false).apply();

    final WebView webToDestroy = mWebView;
    mWebView = null;
    mPageLoaded = false;
    if (webToDestroy != null)
    {
      // 1 s grace so pending evaluateJavascript callbacks (saveFileSync)
      // can fire before the WebView is torn down.
      mHandler.postDelayed(new Runnable()
      {
        @Override
        public void run()
        {
          try { webToDestroy.destroy(); } catch (Exception ignored) {}
        }
      }, 1000);
    }

    try { unregisterReceiver(noteReceiver); } catch (Exception ignored) {}

    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent)
  {
    return null;
  }

  // ────────────────────────────────────────────────────────────────
  //  View construction (runs once per service lifetime)
  // ────────────────────────────────────────────────────────────────

  private void createOverlayView()
  {
    int screenHeight = physicalScreenHeight();
    mNavBarHeight = navBarHeightPx();

    mInitialHeight = (int) (screenHeight * 0.50);
    mMinHeight = (int) (screenHeight * 0.25);
    mMaxHeight = screenHeight;

    BackInterceptLayout rootLayout = new BackInterceptLayout(this);
    rootLayout.setOnBackPressed(() -> dismissOverlay());
    rootLayout.setOrientation(LinearLayout.VERTICAL);
    rootLayout.setBackgroundColor(Color.parseColor(PANEL_BG_COLOR));
    rootLayout.setFocusableInTouchMode(true);
    rootLayout.requestFocus();

    // Drag handle
    FrameLayout handle = new FrameLayout(this);
    handle.setBackgroundColor(Color.parseColor(HANDLE_BG_COLOR));
    handle.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(28)));

    View pill = new View(this);
    GradientDrawable pillShape = new GradientDrawable();
    pillShape.setColor(Color.parseColor(PILL_COLOR));
    pillShape.setCornerRadius(dp(2));
    pill.setBackground(pillShape);
    handle.addView(pill, new FrameLayout.LayoutParams(
        dp(32), dp(3), Gravity.CENTER));

    TextView closeBtn = new TextView(this);
    closeBtn.setText("×");
    closeBtn.setTextSize(22);
    closeBtn.setTextColor(Color.parseColor(CLOSE_COLOR));
    closeBtn.setGravity(Gravity.CENTER);
    closeBtn.setLayoutParams(new FrameLayout.LayoutParams(
        dp(36), FrameLayout.LayoutParams.MATCH_PARENT, Gravity.END));
    closeBtn.setOnClickListener(v -> dismissOverlay());
    handle.addView(closeBtn);

    // WebView container — bottom padding so content stops above nav bar,
    // root's gruvbox colour fills the nav-bar strip itself.
    FrameLayout webContainer = new FrameLayout(this);
    webContainer.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, 0, 1.0f));
    webContainer.setPadding(0, 0, 0, mNavBarHeight);

    mWebView = new WebView(this);
    mWebView.setLayoutParams(new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
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

    webContainer.addView(mWebView);
    rootLayout.addView(handle);
    rootLayout.addView(webContainer);

    int flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
              | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
              | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;

    mParams = new WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        mInitialHeight,
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE,
        flags,
        PixelFormat.TRANSLUCENT);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
    {
      mParams.setFitInsetsTypes(0);
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
    {
      mParams.layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
    }
    // Lift the panel above the keyboard instead of letting it cover us.
    mParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN;

    mParams.gravity = Gravity.BOTTOM | Gravity.START;
    mParams.x = 0;
    mParams.y = 0;

    mOverlayView = rootLayout;

    // Drag-to-resize
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
        }
        return false;
      }
    });
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
    if (!mOverlayAttached) return;
    if (mInjecting) return;
    if (!mPageLoaded || mWebView == null) return;

    final SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
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
          injectPendingNotes(0);
        }
      }
      else if (attempt < INJECT_RETRY_COUNT)
      {
        mHandler.postDelayed(
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
      InputStream in = getContentResolver().openInputStream(uri);
      if (in == null) return;

      BufferedReader reader = new BufferedReader(new InputStreamReader(in));
      StringBuilder sb = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) sb.append(line).append("\n");
      reader.close();

      String md = sb.toString();
      String js = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid("
        + JSONObject.quote(md) + ");";
      mWebView.evaluateJavascript(js, null);
    }
    catch (Exception e) { e.printStackTrace(); }
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

  // ────────────────────────────────────────────────────────────────
  //  BACK interceptor
  // ────────────────────────────────────────────────────────────────

  private static class BackInterceptLayout extends LinearLayout
  {
    private Runnable mOnBack;
    BackInterceptLayout(Context c) { super(c); }
    void setOnBackPressed(Runnable r) { mOnBack = r; }
    @Override
    public boolean dispatchKeyEvent(KeyEvent event)
    {
      if (event.getKeyCode() == KeyEvent.KEYCODE_BACK)
      {
        if (event.getAction() == KeyEvent.ACTION_UP && mOnBack != null) mOnBack.run();
        return true;
      }
      return super.dispatchKeyEvent(event);
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  JS bridge
  // ────────────────────────────────────────────────────────────────

  public class OverlayWebAppInterface
  {
    @JavascriptInterface
    public void saveFileSync(String filePath, String content)
    {
      if (filePath == null || filePath.trim().isEmpty()) return;
      try
      {
        Uri uri = Uri.parse(filePath);
        OutputStream out = getContentResolver().openOutputStream(uri, "rwt");
        if (out == null) out = getContentResolver().openOutputStream(uri);
        if (out != null)
        {
          out.write(content.getBytes());
          out.close();
          Intent updateIntent = new Intent(MainActivity.ACTION_NOTE_ADDED);
          updateIntent.setPackage(getPackageName());
          sendBroadcast(updateIntent);
        }
      }
      catch (Exception e) { e.printStackTrace(); }
    }

    @JavascriptInterface
    public void triggerManualReadSync() { readSyncFileAndInject(); }

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
    public void closeOverlay() { dismissOverlay(); }

    @JavascriptInterface
    public int getNavBarHeight() { return mNavBarHeight; }

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
    public boolean isOverlayMode() { return true; }

    @JavascriptInterface
    public void setupSyncFile(String d, String c) { showToast("Open the full Karui app for this."); }
    @JavascriptInterface
    public void saveFile(String n, String d, String t) { showToast("Open the full Karui app for this."); }
    @JavascriptInterface
    public void importJsonFile() { showToast("Open the full Karui app for this."); }
    @JavascriptInterface
    public void importMarkdownFile() { showToast("Open the full Karui app for this."); }
    @JavascriptInterface
    public void toggleNotification(boolean e) { showToast("Open the full Karui app to change the status-bar toggle."); }
    @JavascriptInterface
    public void toggleScreenshots(boolean d) {}
    @JavascriptInterface
    public void updateCalendarEvents(String j) {}
    @JavascriptInterface
    public void setCalendarNotificationsEnabled(boolean e) {}
  }

  private void showToast(final String msg)
  {
    Toast.makeText(getApplicationContext(), msg, Toast.LENGTH_SHORT).show();
  }
}