package io.github.ronynn.karui;

import android.content.Intent;
import android.speech.RecognitionService;

public class KaruiRecognitionService extends RecognitionService
{
  // Minimal stubs — Android requires these to be present.
  @Override protected void onStartListening(Intent recognizerIntent, Callback listener) {}
  @Override protected void onCancel(Callback listener) {}
  @Override protected void onStopListening(Callback listener) {}
}