package io.github.ronynn.karui;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;

public class KaruiSessionService extends VoiceInteractionSessionService
{
  @Override
  public VoiceInteractionSession onNewSession(Bundle args)
  {
    return new KaruiSession(this);
  }
}