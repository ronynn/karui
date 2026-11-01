package io.github.ronynn.karui;

import android.service.voice.VoiceInteractionService;

/**
 * Minimal VoiceInteractionService.
 *
 * It exists only so the system recognises Karui as a proper digital
 * assistant (alongside the ACTION_ASSIST intent-filter). When the user
 * long-presses home, the system binds to this service and spawns a
 * VoiceInteractionSession via {@link KaruiSessionService}.
 *
 * We deliberately do NOT implement voice recognition here — the assistant
 * is text/UI-only.
 */
public class KaruiVoiceInteractionService extends VoiceInteractionService
{
}