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
    // showSession(Bundle, int) is the PUBLIC API (API 23+). The system
    // calls it when the user long-presses home with this app selected as
    // the digital assistant.
    //
    // Calling super.showSession() requests the system to start
    // KaruiSessionService, which returns a KaruiSession, and the system
    // then calls KaruiSession.onShow(). That method starts
    // FloatingWindowService — no activity is involved anywhere in the chain.
    //
    // Do NOT call startSession(args) — that method is @SystemApi / hidden
    // and is not available in the public SDK. It's what super.showSession()
    // calls internally on the system side; we don't need to call it.
    super.showSession(args, flags);
  }
}