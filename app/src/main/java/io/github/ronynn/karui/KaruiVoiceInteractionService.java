package io.github.ronynn.karui;

import android.os.Bundle;
import android.service.voice.VoiceInteractionService;

public class KaruiVoiceInteractionService extends VoiceInteractionService
{
  @Override
  public void onReady()
  {
    super.onReady();
  }

  @Override
  public void showSession(Bundle args, int flags)
  {
    // Called by the system when the assist gesture fires.
    // Start the session immediately — no activity involved.
    startSession(args);
  }
}