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

  // Initial floating window size and minimums (all in dp).
  private static final int INITIAL_WIDTH_DP   = 340;
  private static final int INITIAL_HEIGHT_DP  = 500;
  private static final int MIN_WIDTH_DP       = 220;
  private static final int MIN_HEIGHT_DP      = 200;

  private final Handler mHandler = new Handler(Looper.getMainLooper());

  private WindowManager mWindowManager;
  private View mRootView;
  private WindowManager.LayoutParams mParams;
  private WebView mWebView;

  private int mScreenWidth;
  private int mScreenHeight;

  private boolean mPageLoaded = false;
  private boolean mInjecting = false;

  private final BroadcastReceiver noteReceiver = new BroadcastReceiver()
  {
    @Override
    public void onReceive(Context context, Intent intent)
    {
      if (mPageLoaded && mWebView != null) injectPendingNotes();
    }
  };

  @Override
  public void onCreate()
  {
    super.onCreate();
    mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

    IntentFilter filter = new IntentFilter(MainActivity.ACTION_NOTE_ADDED);
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
      try
      {
        buildFloatingWindow();
      }
      catch (Exception e)
      {
        e.printStackTrace();
        Toast.makeText(this, "Could not open floating window", Toast.LENGTH_LONG).show();
        stopSelf();
        return START_NOT_STICKY;
      }
    }
    return START_NOT_STICKY;
  }

  private void buildFloatingWindow()
  {
    // ── Read screen metrics (safe area, not real metrics) ─────────
    // We deliberately use getMetrics() NOT getRealMetrics(), so the
    // window lives inside the safe inset area and never overlaps the
    // navbar. That's what eliminates resize stutter.
    DisplayMetrics dm = new DisplayMetrics();
    mWindowManager.getDefaultDisplay().getMetrics(dm);
    mScreenWidth = dm.widthPixels;
    mScreenHeight = dm.heightPixels;

    int initialW = dp(INITIAL_WIDTH_DP);
    int initialH = dp(INITIAL_HEIGHT_DP);
    int minW = dp(MIN_WIDTH_DP);
    int minH = dp(MIN_HEIGHT_DP);

    // Clamp initial size to fit on screen.
    initialW = Math.min(initialW, mScreenWidth - dp(16));
    initialH = Math.min(initialH, mScreenHeight - dp(80));

    // ── Root view ─────────────────────────────────────────────────
    FrameLayout rootLayout = new FrameLayout(this);
    rootLayout.setBackgroundColor(Color.parseColor(PANEL_BG_COLOR));

    // ── Inner content (title bar + WebView) ───────────────────────
    LinearLayout contentLayout = new LinearLayout(this);
    contentLayout.setOrientation(LinearLayout.VERTICAL);
    contentLayout.setLayoutParams(new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT));

    // Title bar (draggable)
    FrameLayout titleBar = new FrameLayout(this);
    titleBar.setBackgroundColor(Color.parseColor(TITLE_BG_COLOR));
    titleBar.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(32)));

    View pill = new View(this);
    GradientDrawable pillShape = new GradientDrawable();
    pillShape.setColor(Color.parseColor(PILL_COLOR));
    pillShape.setCornerRadius(dp(2));
    pill.setBackground(pillShape);
    FrameLayout.LayoutParams pillParams = new FrameLayout.LayoutParams(
        dp(32), dp(3), Gravity.CENTER);
    titleBar.addView(pill, pillParams);

    TextView closeBtn = new TextView(this);
    closeBtn.setText("×");
    closeBtn.setTextSize(22);
    closeBtn.setTextColor(Color.parseColor(CLOSE_COLOR));
    closeBtn.setGravity(Gravity.CENTER);
    closeBtn.setLayoutParams(new FrameLayout.LayoutParams(
        dp(36), FrameLayout.LayoutParams.MATCH_PARENT, Gravity.END));
    closeBtn.setOnClickListener(v -> dismiss());
    titleBar.addView(closeBtn);

    // WebView
    mWebView = new WebView(this);
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

    // ── Resize handle (bottom-right corner) ───────────────────────
    // A small triangle-ish square. Purely visual + touch target.
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

    // ── WindowManager.LayoutParams ────────────────────────────────
    // No FLAG_LAYOUT_IN_SCREEN, no LAYOUT_NO_LIMITS, no
    // setFitInsetsTypes(0). The window respects the safe area, so it
    // never touches the navbar. Resizing can't cause navbar stutter.
    int flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
    mParams = new WindowManager.LayoutParams(
        initialW,
        initialH,
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE,
        flags,
        PixelFormat.TRANSLUCENT);

    mParams.gravity = Gravity.TOP | Gravity.START;
    // Center horizontally, sit near the top.
    mParams.x = (mScreenWidth - initialW) / 2;
    mParams.y = dp(80);
    mParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;

    mRootView = rootLayout;
    mWindowManager.addView(mRootView, mParams);

    getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
      .edit().putBoolean(KEY_OVERLAY_ACTIVE, true).apply();

    // ── Drag-to-move on title bar ─────────────────────────────────
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
            return true;
          case MotionEvent.ACTION_MOVE:
            float dx = e.getRawX() - startTouchX;
            float dy = e.getRawY() - startTouchY;
            if (Math.abs(dx) > dp(3) || Math.abs(dy) > dp(3)) moved = true;
            if (moved)
            {
              int newX = startX + (int) dx;
              int newY = startY + (int) dy;
              // Keep a margin so the window can't be dragged fully off-screen.
              newX = Math.max(-mParams.width + dp(60),
                       Math.min(mScreenWidth - dp(60), newX));
              newY = Math.max(0,
                       Math.min(mScreenHeight - dp(60), newY));
              mParams.x = newX;
              mParams.y = newY;
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

    // ── Drag-to-resize on corner handle ───────────────────────────
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
            // Clamp to remaining space on screen from current x/y.
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
      mHandler.postDelayed(() -> {
        try { wv.destroy(); } catch (Exception ignored) {}
      }, 1000);
    }

    try { unregisterReceiver(noteReceiver); } catch (Exception ignored) {}

    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) { return null; }

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