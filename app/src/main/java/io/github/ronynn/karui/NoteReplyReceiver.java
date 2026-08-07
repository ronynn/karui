package io.github.ronynn.karui;

import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;

public class NoteReplyReceiver extends BroadcastReceiver {
    public static final String KEY_TEXT_REPLY = "key_text_reply";

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
        if (remoteInput != null) {
            CharSequence replyText = remoteInput.getCharSequence(KEY_TEXT_REPLY);
            if (replyText != null && replyText.length() > 0) {
                SharedPreferences prefs = context.getSharedPreferences("note_queue", Context.MODE_PRIVATE);
                String existingNotes = prefs.getString("pending_notes", "");
                String existingTabs = prefs.getString("pending_notes_tabs", "");

                // Read the current inbox tab name (default "Inbox")
                String inboxTab = prefs.getString("inbox_tab_name", "Inbox");

                String newNote = replyText.toString();
                String updatedNotes = existingNotes.isEmpty() ? newNote : existingNotes + "\n" + newNote;
                String updatedTabs = existingTabs.isEmpty() ? inboxTab : existingTabs + "\n" + inboxTab;

                prefs.edit()
                    .putString("pending_notes", updatedNotes)
                    .putString("pending_notes_tabs", updatedTabs)
                    .apply();
            }
        }
    }
}
