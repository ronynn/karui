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

public class FloatingWindowService extends Service
{
  private static final String PREFS_SYNC = "sync_prefs";
  private static final String KEY_SYNC_URI = "sync_file_uri";
  private static final String PREFS_NOTE_QUEUE = "note_queue";
  private static final String KEY_NOTIFICATION_ENABLED = "notification_enabled";
  static final String KEY_OVERLAY_ACTIVE = "overlay_active";

  private static final String PANEL_BG_COLOR  = "#282828";
  private static final String TITLE_BG_COLOR  = "#3C3836";
  private static final String PILL_COLOR      = "#928374";
  private static final String CLOSE_COLOR     = "#EBDBB2";
  private static final String RESIZE_HINT     = "#504945";

  private static final int  INJECT_RETRY_COUNT    = 10;
  private static final long INJECT_RETRY_DELAY_MS = 300L;

  private static final int INITIAL_WIDTH_DP  = 340;
  private static final int INITIAL_HEIGHT_DP = 500;
  private static final int MIN_WIDTH_DP      = 220;
  private static final int MIN_HEIGHT_DP     = 200;

  /** Minimum on-screen strip when window is dragged mostly off-screen. */
  private static final int MIN_VISIBLE_DP = 48;

  /** Pull-up distance for the opening animation. */
  private static final int OPEN_SLIDE_DP = 80;
  private static final long OPEN_SLIDE_MS = 260L;

  private final Handler mHandler = new Handler(Looper.getMainLooper());

  private WindowManager mWindowManager;
  private View mRootView;
  private WindowManager.LayoutParams mParams;
  private BackAwareWebView mWebView;
  private TextView mCloseBtn;

  private int mScreenWidth;
  private int mScreenHeight;

  private boolean mPageLoaded = false;
  private boolean mInjecting = false;

  // Last known "good" (in-screen) position. Restored when the user
  // taps a window that has been dragged mostly off-screen.
  private int mPreOffscreenX, mPreOffscreenY;

  private final BroadcastReceiver noteReceiver = new BroadcastReceiver()
  {
    @Override
    public void onReceive(Context context, Intent intent)
    {
      if (intent == null) return;
      String action = intent.getAction();

      if (MainActivity.ACTION_CLOSE_FLOATING.equals(action))
      {
        dismiss();
        return;
      }
      if (MainActivity.ACTION_NOTE_ADDED.equals(action))
      {
        if (mPageLoaded && mWebView != null) injectPendingNotes();
      }
    }
  };

  @Override
  public void onCreate()
  {
    super.onCreate();
    mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

    IntentFilter filter = new IntentFilter();
    filter.addAction(MainActivity.ACTION_NOTE_ADDED);
    filter.addAction(MainActivity.ACTION_CLOSE_FLOATING);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
      registerReceiver(noteReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    else
      registerReceiver(noteReceiver, filter);
  }

  private int dp(float v)
  {
    return (int) TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId)
  {
    if (mRootView == null)
    {
      try { buildFloatingWindow(); }
      catch (Exception e)
      {
        e.printStackTrace();
        Toast.makeText(this, "Could not open floating window", Toast.LENGTH_LONG).show();
        stopSelf();
        return START_NOT_STICKY;
      }
    }
    else if (isMostlyOffscreen())
    {
      // Warm start while the window is off-screen — bring it back into
      // view so the user actually sees it when they tap the tile again.
      mParams.x = mPreOffscreenX;
      mParams.y = mPreOffscreenY;
      try { mWindowManager.updateViewLayout(mRootView, mParams); } catch (Exception ignored) {}
      updateCloseVisibility();
    }
    return START_NOT_STICKY;
  }

  private void buildFloatingWindow()
  {
    DisplayMetrics dm = new DisplayMetrics();
    mWindowManager.getDefaultDisplay().getMetrics(dm);
    mScreenWidth = dm.widthPixels;
    mScreenHeight = dm.heightPixels;

    int initialW = Math.min(dp(INITIAL_WIDTH_DP), mScreenWidth - dp(16));
    int initialH = Math.min(dp(INITIAL_HEIGHT_DP), mScreenHeight - dp(80));
    final int minW = dp(MIN_WIDTH_DP);
    final int minH = dp(MIN_HEIGHT_DP);
    final int minVisible = dp(MIN_VISIBLE_DP);

    FrameLayout rootLayout = new FrameLayout(this);
    rootLayout.setBackgroundColor(Color.parseColor(PANEL_BG_COLOR));

    LinearLayout contentLayout = new LinearLayout(this);
    contentLayout.setOrientation(LinearLayout.VERTICAL);
    contentLayout.setLayoutParams(new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

    FrameLayout titleBar = new FrameLayout(this);
    titleBar.setBackgroundColor(Color.parseColor(TITLE_BG_COLOR));
    titleBar.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(24)));

    View pill = new View(this);
    GradientDrawable pillShape = new GradientDrawable();
    pillShape.setColor(Color.parseColor(PILL_COLOR));
    pillShape.setCornerRadius(dp(1));
    pill.setBackground(pillShape);
    titleBar.addView(pill, new FrameLayout.LayoutParams(
        dp(24), dp(2), Gravity.CENTER));

    mCloseBtn = new TextView(this);
    mCloseBtn.setText("×");
    mCloseBtn.setTextSize(20);
    mCloseBtn.setTextColor(Color.parseColor(CLOSE_COLOR));
    mCloseBtn.setGravity(Gravity.CENTER);
    mCloseBtn.setLayoutParams(new FrameLayout.LayoutParams(
        dp(32), FrameLayout.LayoutParams.MATCH_PARENT, Gravity.END));
    mCloseBtn.setOnClickListener(v -> dismiss());
    titleBar.addView(mCloseBtn);

    mWebView = new BackAwareWebView(this);
    mWebView.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, 0, 1.0f));
    mWebView.setBackgroundColor(Color.parseColor(PANEL_BG_COLOR));
    mWebView.setVerticalScrollBarEnabled(false);
    mWebView.setHorizontalScrollBarEnabled(false);

    WebSettings ws = mWebView.getSettings();
    ws.setJavaScriptEnabled(true);
    ws.setDomStorageEnabled(true);
    ws.setAllowFileAccess(true);
    ws.setAllowContentAccess(true);
    ws.setAllowFileAccessFromFileURLs(true);
    ws.setAllowUniversalAccessFromFileURLs(true);

    mWebView.setWebViewClient(new WebViewClient()
    {
      @Override
      public void onPageFinished(WebView view, String url)
      {
        mPageLoaded = true;
        injectPendingNotes();
        readSyncFileAndInject();
      }
    });

    mWebView.addJavascriptInterface(new FloatingWebAppInterface(), "Android");
    mWebView.loadUrl("file:///android_asset/index.html");

    contentLayout.addView(titleBar);
    contentLayout.addView(mWebView);
    rootLayout.addView(contentLayout);

    View resizeHandle = new View(this);
    GradientDrawable resizeShape = new GradientDrawable();
    resizeShape.setColor(Color.parseColor(RESIZE_HINT));
    resizeShape.setCornerRadius(dp(4));
    resizeHandle.setBackground(resizeShape);
    FrameLayout.LayoutParams rhParams = new FrameLayout.LayoutParams(
        dp(22), dp(22), Gravity.BOTTOM | Gravity.END);
    rhParams.setMargins(0, 0, dp(4), dp(4));
    resizeHandle.setLayoutParams(rhParams);
    rootLayout.addView(resizeHandle);

    // FLAG_LAYOUT_NO_LIMITS lets the window be positioned outside the
    // screen bounds. Without it, MIUI/POCO's WindowManager clamps the
    // window to stay fully on-screen — that was the "can't go under
    // the screen on left/right" behaviour. Because our window sits
    // near the top and never overlaps the navbar, this flag doesn't
    // cause the resize stutter we saw with the old bottom-anchored
    // overlay. FLAG_NOT_TOUCH_MODAL lets taps outside the window
    // reach the app underneath.
    int flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
              | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;

    mParams = new WindowManager.LayoutParams(
        initialW, initialH,
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE,
        flags, PixelFormat.TRANSLUCENT);

    mParams.gravity = Gravity.TOP | Gravity.START;

    int targetX = (mScreenWidth - initialW) / 2;
    int targetY = dp(80);
    // Start below the final Y so we can slide up. The slide happens
    // inside the safe area, so nothing crosses the navbar.
    mParams.x = targetX;
    mParams.y = targetY + dp(OPEN_SLIDE_DP);
    mParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;

    mRootView = rootLayout;
    mWindowManager.addView(mRootView, mParams);

    mPreOffscreenX = targetX;
    mPreOffscreenY = targetY;

    getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
      .edit().putBoolean(KEY_OVERLAY_ACTIVE, true).apply();

    // Tell MainActivity (if alive) to close itself now that we're up.
    Intent opened = new Intent(MainActivity.ACTION_FLOATING_OPENED);
    opened.setPackage(getPackageName());
    sendBroadcast(opened);

    // ── Pull-up opening animation ─────────────────────────────────
    mRootView.setAlpha(0.9f);
    mRootView.animate()
        .y(targetY)
        .alpha(1f)
        .setDuration(OPEN_SLIDE_MS)
        .setInterpolator(new DecelerateInterpolator())
        .withEndAction(() ->
        {
          if (mParams != null && mRootView != null)
          {
            mParams.y = targetY;
            try { mWindowManager.updateViewLayout(mRootView, mParams); }
            catch (Exception ignored) {}
          }
        })
        .start();

    // ── Drag-to-move + tap-to-restore ─────────────────────────────
    titleBar.setOnTouchListener(new View.OnTouchListener()
    {
      private int startX, startY;
      private float startTouchX, startTouchY;
      private boolean moved;

      @Override
      public boolean onTouch(View v, MotionEvent e)
      {
        switch (e.getActionMasked())
        {
          case MotionEvent.ACTION_DOWN:
            startX = mParams.x;
            startY = mParams.y;
            startTouchX = e.getRawX();
            startTouchY = e.getRawY();
            moved = false;
            // Do NOT auto-restore here. The user may want to push the
            // window further off-screen with another drag.
            return true;

          case MotionEvent.ACTION_MOVE:
            float dx = e.getRawX() - startTouchX;
            float dy = e.getRawY() - startTouchY;
            if (Math.abs(dx) > dp(3) || Math.abs(dy) > dp(3)) moved = true;
            if (moved)
            {
              int newX = Math.max(-mParams.width + minVisible,
                       Math.min(mScreenWidth - minVisible, startX + (int) dx));
              int newY = Math.max(0,
                       Math.min(mScreenHeight - dp(60), startY + (int) dy));
              mParams.x = newX;
              mParams.y = newY;
              mWindowManager.updateViewLayout(mRootView, mParams);
              updateCloseVisibility();
            }
            return true;

          case MotionEvent.ACTION_UP:
          case MotionEvent.ACTION_CANCEL:
            if (!moved && isMostlyOffscreen())
            {
              // Tap on the visible strip → restore.
              mParams.x = mPreOffscreenX;
              mParams.y = mPreOffscreenY;
              try { mWindowManager.updateViewLayout(mRootView, mParams); }
              catch (Exception ignored) {}
              updateCloseVisibility();
            }
            else if (!isMostlyOffscreen())
            {
              mPreOffscreenX = mParams.x;
              mPreOffscreenY = mParams.y;
            }
            return true;
        }
        return false;
      }
    });

    // ── Drag-to-resize ────────────────────────────────────────────
    resizeHandle.setOnTouchListener(new View.OnTouchListener()
    {
      private int startW, startH;
      private float startTouchX, startTouchY;

      @Override
      public boolean onTouch(View v, MotionEvent e)
      {
        switch (e.getActionMasked())
        {
          case MotionEvent.ACTION_DOWN:
            startW = mParams.width;
            startH = mParams.height;
            startTouchX = e.getRawX();
            startTouchY = e.getRawY();
            return true;
          case MotionEvent.ACTION_MOVE:
            int newW = startW + (int) (e.getRawX() - startTouchX);
            int newH = startH + (int) (e.getRawY() - startTouchY);
            newW = Math.max(minW, Math.min(mScreenWidth - mParams.x, newW));
            newH = Math.max(minH, Math.min(mScreenHeight - mParams.y, newH));
            if (newW != mParams.width || newH != mParams.height)
            {
              mParams.width = newW;
              mParams.height = newH;
              mWindowManager.updateViewLayout(mRootView, mParams);
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

  private boolean isMostlyOffscreen()
  {
    if (mParams == null) return false;
    int visLeft = Math.max(0, mParams.x);
    int visRight = Math.min(mScreenWidth, mParams.x + mParams.width);
    return (visRight - visLeft) < mParams.width / 2;
  }

  private void updateCloseVisibility()
  {
    if (mCloseBtn == null) return;
    mCloseBtn.setVisibility(isMostlyOffscreen() ? View.INVISIBLE : View.VISIBLE);
  }

  // ── Back-aware WebView ──────────────────────────────────────────

  private class BackAwareWebView extends WebView
  {
    BackAwareWebView(Context c) { super(c); }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event)
    {
      if (event.getKeyCode() == KeyEvent.KEYCODE_BACK
          && event.getAction() == KeyEvent.ACTION_UP)
      {
        if (isMostlyOffscreen())
        {
          mParams.x = mPreOffscreenX;
          mParams.y = mPreOffscreenY;
          try { mWindowManager.updateViewLayout(mRootView, mParams); }
          catch (Exception ignored) {}
          updateCloseVisibility();
        }
        else if (canGoBack())
        {
          goBack();
        }
        else
        {
          post(() -> dismiss());
        }
        return true;
      }
      return super.dispatchKeyEvent(event);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  private void dismiss()
  {
    try
    {
      InputMethodManager imm =
          (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
      if (imm != null && mWebView != null)
        imm.hideSoftInputFromWindow(mWebView.getWindowToken(), 0);
    }
    catch (Exception ignored) {}

    triggerCloseSync();

    if (mRootView != null && mWindowManager != null)
    {
      try { mWindowManager.removeView(mRootView); } catch (Exception ignored) {}
      mRootView = null;
    }

    getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
      .edit().putBoolean(KEY_OVERLAY_ACTIVE, false).apply();

    stopSelf();
  }

  @Override
  public void onDestroy()
  {
    triggerCloseSync();

    if (mRootView != null && mWindowManager != null)
    {
      try { mWindowManager.removeView(mRootView); } catch (Exception ignored) {}
      mRootView = null;
    }

    getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
      .edit().putBoolean(KEY_OVERLAY_ACTIVE, false).apply();

    final WebView wv = mWebView;
    mWebView = null;
    mPageLoaded = false;
    if (wv != null)
    {
      mHandler.postDelayed(() -> { try { wv.destroy(); } catch (Exception ignored) {} }, 1000);
    }

    try { unregisterReceiver(noteReceiver); } catch (Exception ignored) {}

    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) { return null; }

  // ── Data injection ─────────────────────────────────────────────

  private void injectPendingNotes() { injectPendingNotes(0); }

  private void injectPendingNotes(final int attempt)
  {
    if (mInjecting || !mPageLoaded || mWebView == null) return;

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
          prefs.edit().remove("pending_notes_json").apply();
        else
          injectPendingNotes(0);
      }
      else if (attempt < INJECT_RETRY_COUNT)
      {
        mHandler.postDelayed(() -> injectPendingNotes(attempt + 1), INJECT_RETRY_DELAY_MS);
      }
    });
  }

  private void readSyncFileAndInject()
  {
    if (!mPageLoaded || mWebView == null) return;

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
        mHandler.post(() ->
        {
          if (mPageLoaded && mWebView != null)
          {
            String js = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid("
                + JSONObject.quote(md) + ");";
            mWebView.evaluateJavascript(js, null);
          }
        });
      }
      catch (Exception ignored) {}
    }).start();
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

  // ── JS bridge ──────────────────────────────────────────────────

  public class FloatingWebAppInterface
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
      ProcessTextActivity.saveNoteToQueue(FloatingWindowService.this, noteText.trim());
      Intent u = new Intent(MainActivity.ACTION_NOTE_ADDED);
      u.setPackage(getPackageName());
      sendBroadcast(u);
    }

    @JavascriptInterface
    public void closeOverlay() { dismiss(); }

    @JavascriptInterface
    public int getNavBarHeight()
    {
      int id = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
      return id > 0 ? getResources().getDimensionPixelSize(id) : 0;
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
    public boolean isOverlayMode() { return true; }

    @JavascriptInterface
    public String getDynamicWallpaperTheme()
    {
      return DynamicTheme.getWallpaperTheme(FloatingWindowService.this);
    }

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