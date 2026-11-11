package io.github.ronynn.karui;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.provider.Settings;
import android.util.Size;
import android.view.Gravity;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

public class ScannerActivity extends Activity
{
  private static final int CAMERA_PERMISSION_REQUEST = 200;
  private static final String PREFS_NOTE_QUEUE = "note_queue";
  private static final String KEY_PENDING_IMPORT = "pending_import_json";
  private static final String PREFIX = "KARUI1";

  private TextureView mTextureView;
  private TextView mStatusView;
  private TextView mHintView;
  private LinearLayout mControlsLayout;
  private Button mSaveBtn, mCopyBtn, mRescanBtn, mTorchBtn;

  private CameraDevice mCameraDevice;
  private CameraCaptureSession mCaptureSession;
  private CaptureRequest.Builder mPreviewRequestBuilder;
  private ImageReader mImageReader;
  private HandlerThread mBackgroundThread;
  private Handler mBackgroundHandler;
  private String mCameraId;
  private Size mPreviewSize;
  private boolean mTorchOn = false;
  private boolean mFlashAvailable = false;

  private final AtomicBoolean mProcessingFrame = new AtomicBoolean(false);
  private MultiFormatReader mReader;
  private volatile boolean mScanning = true;
  private long mLastScanTime = 0;
  private String mLastScanData = "";

  private String mBatchId = null;
  private int mBatchTotal = 0;
  private final Map<Integer, String> mChunks = new HashMap<>();
  private String mReadyPayload = null;

  @Override
  protected void onCreate(Bundle savedInstanceState)
  {
    super.onCreate(savedInstanceState);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
        && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
    {
      requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
      return;
    }
    setupUi();
    startBackgroundThread();
    openCamera();
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results)
  {
    if (requestCode != CAMERA_PERMISSION_REQUEST) return;
    if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
    {
      setupUi();
      startBackgroundThread();
      openCamera();
    }
    else
    {
      Toast.makeText(this, "Camera permission required", Toast.LENGTH_LONG).show();
      finish();
    }
  }

  private void setupUi()
  {
    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(0xFF000000);

    mTextureView = new TextureView(this);
    root.addView(mTextureView, new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    FrameLayout overlay = new FrameLayout(this);
    root.addView(overlay, new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    // Scan frame
    View frame = new View(this);
    GradientDrawable border = new GradientDrawable();
    border.setColor(Color.TRANSPARENT);
    border.setStroke(2, 0xFFFABD2F);
    border.setCornerRadius(dp(14));
    frame.setBackground(border);

    
    
    
    
    FrameLayout.LayoutParams fp = new FrameLayout.LayoutParams(dp(260), dp(260), Gravity.CENTER);
    overlay.addView(frame, fp);

    mStatusView = new TextView(this);
    mStatusView.setTextColor(0xFFFABD2F);
    mStatusView.setTextSize(18);
    mStatusView.setGravity(Gravity.CENTER);
    FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    sp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
    sp.topMargin = dp(80);
    overlay.addView(mStatusView, sp);

    mHintView = new TextView(this);
    mHintView.setTextColor(0xFFEBDBB2);
    mHintView.setTextSize(13);
    mHintView.setGravity(Gravity.CENTER);
    mHintView.setText("Point at a Karui QR code");
    FrameLayout.LayoutParams hp = new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    hp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
    hp.bottomMargin = dp(140);
    overlay.addView(mHintView, hp);

    // Torch button (top-left)
    mTorchBtn = new Button(this);
    mTorchBtn.setText("T");
    mTorchBtn.setTextSize(16);
    mTorchBtn.setBackgroundColor(0xCC3C3836);
    mTorchBtn.setTextColor(0xFFEBDBB2);
    mTorchBtn.setPadding(0, 0, 0, 0);
    FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(dp(48), dp(48));
    tp.gravity = Gravity.TOP | Gravity.START;
    tp.leftMargin = dp(16);
    tp.topMargin = dp(56);
    mTorchBtn.setLayoutParams(tp);
    mTorchBtn.setOnClickListener(v -> toggleTorch());
    overlay.addView(mTorchBtn);

    // Close button (top-right)
    Button closeBtn = new Button(this);
    closeBtn.setText("×");
    closeBtn.setTextSize(20);
    closeBtn.setBackgroundColor(0xCC3C3836);
    closeBtn.setTextColor(0xFFEBDBB2);
    FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(dp(48), dp(48));
    cp.gravity = Gravity.TOP | Gravity.END;
    cp.rightMargin = dp(16);
    cp.topMargin = dp(56);
    closeBtn.setLayoutParams(cp);
    closeBtn.setOnClickListener(v -> finish());
    overlay.addView(closeBtn);

    // Controls (bottom)
    mControlsLayout = new LinearLayout(this);
    mControlsLayout.setOrientation(LinearLayout.HORIZONTAL);
    mControlsLayout.setGravity(Gravity.CENTER);
    mControlsLayout.setVisibility(View.GONE);

    mSaveBtn = makeButton("SAVE", 0xFFFABD2F, 0xFF282828, v -> onSave());
    mCopyBtn = makeButton("COPY", 0xFF3C3836, 0xFFEBDBB2, v -> onCopy());
    mRescanBtn = makeButton("SCAN AGAIN", 0xFF3C3836, 0xFFEBDBB2, v -> onRescan());

    mControlsLayout.addView(mSaveBtn);
    mControlsLayout.addView(mCopyBtn);
    mControlsLayout.addView(mRescanBtn);

    FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    clp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
    clp.bottomMargin = dp(40);
    overlay.addView(mControlsLayout, clp);

    setContentView(root);
  }

  private Button makeButton(String label, int bg, int fg, View.OnClickListener l)
  {
    Button b = new Button(this);
    b.setText(label);
    b.setTextSize(14);
    b.setTextColor(fg);
    b.setBackgroundColor(bg);
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT, dp(44));
    lp.setMargins(dp(6), 0, dp(6), 0);
    b.setLayoutParams(lp);
    b.setOnClickListener(l);
    return b;
  }

  private int dp(int v)
  {
    return (int) (v * getResources().getDisplayMetrics().density);
  }

  // ── Camera2 pipeline ─────────────────────────────────────────────

  private void startBackgroundThread()
  {
    mBackgroundThread = new HandlerThread("CameraBackground");
    mBackgroundThread.start();
    mBackgroundHandler = new Handler(mBackgroundThread.getLooper());
    mReader = new MultiFormatReader();
  }

  private void openCamera()
  {
    CameraManager manager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
    try
    {
      for (String id : manager.getCameraIdList())
      {
        CameraCharacteristics chars = manager.getCameraCharacteristics(id);
        Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
        if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK)
        {
          mCameraId = id;
          mFlashAvailable = Boolean.TRUE.equals(chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE));
          StreamConfigurationMap map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
          if (map != null)
          {
            Size[] sizes = map.getOutputSizes(ImageFormat.YUV_420_888);
            if (sizes != null && sizes.length > 0)
            {
              Arrays.sort(sizes, (a, b) -> Long.compare((long) b.getWidth() * b.getHeight(),
                                                       (long) a.getWidth() * a.getHeight()));
              mPreviewSize = sizes[0]; // largest available
            }
          }
          break;
        }
      }
      if (mCameraId == null) { Toast.makeText(this, "No back camera", Toast.LENGTH_LONG).show(); finish(); return; }
      if (mPreviewSize == null) { mPreviewSize = new Size(1280, 720); }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
          && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
      {
        return;
      }
      manager.openCamera(mCameraId, mCameraStateCallback, mBackgroundHandler);
    }
    catch (Exception e)
    {
      Toast.makeText(this, "Camera error: " + e.getMessage(), Toast.LENGTH_LONG).show();
      finish();
    }
  }

  private final CameraDevice.StateCallback mCameraStateCallback = new CameraDevice.StateCallback()
  {
    @Override public void onOpened(CameraDevice camera)
    {
      mCameraDevice = camera;
      createCameraSession();
    }
    @Override public void onDisconnected(CameraDevice camera) { camera.close(); mCameraDevice = null; }
    @Override public void onError(CameraDevice camera, int error) { camera.close(); mCameraDevice = null; finish(); }
  };

  private void createCameraSession()
  {
    try
    {
      SurfaceTexture texture = mTextureView.getSurfaceTexture();
      if (texture == null) return;
      texture.setDefaultBufferSize(mPreviewSize.getWidth(), mPreviewSize.getHeight());
      Surface previewSurface = new Surface(texture);

      mImageReader = ImageReader.newInstance(
          mPreviewSize.getWidth(), mPreviewSize.getHeight(), ImageFormat.YUV_420_888, 2);
      mImageReader.setOnImageAvailableListener(this::processImage, mBackgroundHandler);

      mPreviewRequestBuilder = mCameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
      mPreviewRequestBuilder.addTarget(previewSurface);
      mPreviewRequestBuilder.addTarget(mImageReader.getSurface());

      mCameraDevice.createCaptureSession(
          Arrays.asList(previewSurface, mImageReader.getSurface()),
          new CameraCaptureSession.StateCallback()
          {
            @Override public void onConfigured(CameraCaptureSession session)
            {
              if (mCameraDevice == null) return;
              mCaptureSession = session;
              try
              {
                mPreviewRequestBuilder.set(CaptureRequest.CONTROL_AF_MODE,
                    CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                session.setRepeatingRequest(mPreviewRequestBuilder.build(), null, mBackgroundHandler);
              }
              catch (CameraAccessException e) { e.printStackTrace(); }
            }
            @Override public void onConfigureFailed(CameraCaptureSession session)
            {
              Toast.makeText(ScannerActivity.this, "Camera config failed", Toast.LENGTH_SHORT).show();
            }
          }, mBackgroundHandler);
    }
    catch (CameraAccessException e) { e.printStackTrace(); }
  }

  private void processImage(ImageReader reader)
  {
    if (!mScanning) { reader.acquireLatestImage().close(); return; }
    if (!mProcessingFrame.compareAndSet(false, true)) { reader.acquireLatestImage().close(); return; }

    Image image = reader.acquireLatestImage();
    if (image == null) { mProcessingFrame.set(false); return; }

    try
    {
      ByteBuffer yBuffer = image.getPlanes()[0].getBuffer();
      int width = image.getWidth();
      int height = image.getHeight();
      byte[] yData = new byte[yBuffer.remaining()];
      yBuffer.get(yData);

      LuminanceSource source = new PlanarYUVLuminanceSource(
          yData, width, height, 0, 0, width, height, false);
      BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(source));

      Result result = null;
      try { result = mReader.decodeWithState(bitmap); }
      catch (Exception ignored) {}
      finally { mReader.reset(); }

      if (result != null && result.getText() != null)
      {
        String text = result.getText();
        long now = System.currentTimeMillis();
        if (!text.equals(mLastScanData) || now - mLastScanTime > 1500)
        {
          mLastScanData = text;
          mLastScanTime = now;
          final String payload = text;
          runOnUiThread(() -> handleScan(payload));
        }
      }
    }
    catch (Exception e) { e.printStackTrace(); }
    finally
    {
      image.close();
      mProcessingFrame.set(false);
    }
  }

  private void toggleTorch()
  {
    if (!mFlashAvailable || mCameraDevice == null) return;
    try
    {
      mTorchOn = !mTorchOn;
      mPreviewRequestBuilder.set(CaptureRequest.FLASH_MODE,
          mTorchOn ? CaptureRequest.FLASH_MODE_TORCH : CaptureRequest.FLASH_MODE_OFF);
      if (mCaptureSession != null)
        mCaptureSession.setRepeatingRequest(mPreviewRequestBuilder.build(), null, mBackgroundHandler);
      mTorchBtn.setText(mTorchOn ? "T" : "T");
      mTorchBtn.setBackgroundColor(mTorchOn ? 0xFFFABD2F : 0xCC3C3836);
      mTorchBtn.setTextColor(mTorchOn ? 0xFF282828 : 0xFFEBDBB2);
    }
    catch (CameraAccessException ignored) {}
  }

  // ── Scan result handling ─────────────────────────────────────────

  private void handleScan(String text)
  {
    String result = acceptScan(text);
    try
    {
      JSONObject o = new JSONObject(result);
      String type = o.optString("type");
      if ("chunk".equals(type))
      {
        mStatusView.setText("Scanned " + o.optInt("received") + "/" + o.optInt("total"));
        mHintView.setText("Point at the next QR code");
      }
      else if ("ready".equals(type))
      {
        mScanning = false;
        mStatusView.setText("✓ " + o.optString("summary"));
        mHintView.setText("Save, copy, or scan again");
        mControlsLayout.setVisibility(View.VISIBLE);
      }
      else if ("error".equals(type))
      {
        mStatusView.setText("⚠ " + o.optString("message"));
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
          if (mScanning) { mStatusView.setText(""); mHintView.setText("Point at a Karui QR code"); }
        }, 1800);
      }
    }
    catch (Exception ignored) {}
  }

  private String acceptScan(String raw)
  {
    if (raw == null || raw.trim().isEmpty()) return jsonError("Empty scan");
    raw = raw.trim();

    if (raw.startsWith(PREFIX + "/"))
    {
      String[] parts = raw.split("/", 5);
      if (parts.length < 5) return jsonError("Malformed chunk");
      String id = parts[1];
      int seq, total;
      try { seq = Integer.parseInt(parts[2]); total = Integer.parseInt(parts[3]); }
      catch (NumberFormatException e) { return jsonError("Malformed chunk"); }
      String data = parts[4];

      if (mBatchId != null && !mBatchId.equals(id))
        return jsonError("Mixing QR batches — tap SCAN AGAIN");

      if (mBatchId == null) { mBatchId = id; mBatchTotal = total; mChunks.clear(); }
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
      return "{\"type\":\"chunk\",\"received\":" + mChunks.size() + ",\"total\":" + mBatchTotal + "}";
    }

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
    try { JSONObject o = new JSONObject(); o.put("type", "ready"); o.put("summary", summary); return o.toString(); }
    catch (Exception e) { return "{\"type\":\"ready\",\"summary\":\"Ready\"}"; }
  }

  private String jsonError(String msg)
  {
    try { JSONObject o = new JSONObject(); o.put("type", "error"); o.put("message", msg); return o.toString(); }
    catch (Exception e) { return "{\"type\":\"error\",\"message\":\"Error\"}"; }
  }

  // ── Save / Copy / Rescan ─────────────────────────────────────────

  private void onSave()
  {
    if (mReadyPayload == null) return;
    SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    String existing = prefs.getString(KEY_PENDING_IMPORT, "[]");
    try
    {
      JSONArray arr = new JSONArray(existing);
      arr.put(mReadyPayload);
      prefs.edit().putString(KEY_PENDING_IMPORT, arr.toString()).apply();
      Toast.makeText(this, "Saved to Karui", Toast.LENGTH_SHORT).show();
      finish();
    }
    catch (Exception e) { Toast.makeText(this, "Save failed", Toast.LENGTH_SHORT).show(); }
  }

  private void onCopy()
  {
    if (mReadyPayload == null) return;
    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
    cm.setPrimaryClip(ClipData.newPlainText("Karui scan", mReadyPayload));
    Toast.makeText(this, "Copied", Toast.LENGTH_SHORT).show();
  }

  private void onRescan()
  {
    mReadyPayload = null;
    mBatchId = null;
    mBatchTotal = 0;
    mChunks.clear();
    mScanning = true;
    mLastScanData = "";
    mStatusView.setText("");
    mHintView.setText("Point at a Karui QR code");
    mControlsLayout.setVisibility(View.GONE);
  }

  @Override
  protected void onDestroy()
  {
    super.onDestroy();
    mScanning = false;
    try { if (mCaptureSession != null) mCaptureSession.close(); } catch (Exception ignored) {}
    try { if (mCameraDevice != null) mCameraDevice.close(); } catch (Exception ignored) {}
    try { if (mImageReader != null) mImageReader.close(); } catch (Exception ignored) {}
    if (mBackgroundThread != null)
    {
      mBackgroundThread.quitSafely();
      try { mBackgroundThread.join(); } catch (InterruptedException ignored) {}
    }
  }
}