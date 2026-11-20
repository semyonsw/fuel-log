import { defineStrings } from '../define';

/**
 * Strings for the AI chat screen; keys are prefixed "chat.".
 *
 * What goes to Gemini (prompts, the photo stand-ins) stays English on purpose
 * and lives in src/lib; only what the user reads is here.
 */
export const chat = defineStrings({
  'chat.fab': 'AI chat',

  'chat.kind.reading': 'Range reading',
  'chat.kind.trip': 'Trip',
  'chat.kind.refuel': 'Refuel',
  'chat.seg.trip': 'Trip',
  'chat.seg.reading': 'Range',
  'chat.seg.refuel': 'Refuel',

  'chat.cameraDenied': 'Camera permission is off for Fuel Log. Allow it in Android settings.',
  'chat.photoFailed': 'Could not open the photo.',
  'chat.checkAndApprove': 'Check and approve:',

  'chat.close': 'Close chat',
  'chat.titleHistory': 'Chats',
  'chat.titleDefault': 'AI chat',
  'chat.backToChat': 'Back to chat',
  'chat.history': 'Chat history',
  'chat.new': 'New chat',

  'chat.emptyTitle': 'Tell me what happened, or send a dashboard photo',
  'chat.emptyText':
    'For example: “I bought 15 L for 9000 AMD, my fuel was 15 km, now it shows 250 km.” You get the entries to check, then one Approve saves them. You can also ask about your log, or fix and delete entries the same way.',
  'chat.noKey': 'Add your Gemini API key in Settings to start.',
  'chat.thinking': 'Gemini is thinking…',
  'chat.photoReady': 'Photo ready to send',
  'chat.removePhoto': 'Remove photo',
  'chat.takePhoto': 'Take a photo',
  'chat.pickPhoto': 'Pick a photo',
  'chat.message': 'Message',
  'chat.send': 'Send',

  'chat.chips.label': 'Try asking',
  'chat.chip.spent': 'How much did I spend this month?',
  'chat.chip.odd': 'Anything odd in my log?',
  'chat.chip.refuel': 'When should I refuel?',

  'chat.deleteTitle': 'Delete this chat?',
  'chat.deleteBody': 'Its messages and readings are removed. Entries you saved from it stay.',
  'chat.delete': 'Delete',

  'chat.photoGone': '📷 Photo (not kept)',
  'chat.lowConfidence': 'Gemini was not sure about the photo. Check the numbers.',
  'chat.removeKindA11y': 'Remove {kind}',
  'chat.remove': 'Remove',
  'chat.replaced': 'Replaced by the corrected cards below. Approve those instead.',

  'chat.op.update': 'Edit',
  'chat.op.delete': 'Delete',
  'chat.change': '{old} → {new}',

  'chat.saved': '✓ Saved to the log. Edit it there any time.',
  'chat.savedN.one': '✓ Saved to the log ({n} entry). Edit them there any time.',
  'chat.savedN.other': '✓ Saved to the log ({n} entries). Edit them there any time.',
  'chat.approve': 'Approve',
  'chat.approveN.one': 'Approve {n} entry',
  'chat.approveN.other': 'Approve {n} entries',
  'chat.approveFoot': 'Approve saves these to the log exactly as shown.',
  'chat.deleteEntry': 'Delete',
  'chat.deleteEntryN.one': 'Delete {n} entry',
  'chat.deleteEntryN.other': 'Delete {n} entries',
  'chat.deleteFoot': 'Delete removes this from the log. It cannot be undone.',
  'chat.apply': 'Save change',
  'chat.applyN.one': 'Save {n} change',
  'chat.applyN.other': 'Save {n} changes',
  'chat.updateFoot': 'Save replaces the entry in the log with the values shown.',
  'chat.updated': '✓ Updated in the log.',
  'chat.deleted': '✓ Deleted from the log.',
  'chat.savedChanges.one': '✓ {n} change saved to the log.',
  'chat.savedChanges.other': '✓ {n} changes saved to the log.',

  'chat.field.from': 'From',
  'chat.field.to': 'To',
  'chat.field.via': 'via {stops}',
  'chat.field.distance': 'Distance',
  'chat.field.rangeLeft': 'Range left',
  'chat.field.rangeAfter': 'Range after',
  'chat.field.liters': 'Liters',
  'chat.field.totalPaid': 'Total paid',
  'chat.field.perLiter': '{price}/L',
  'chat.field.date': 'Date',
  'chat.field.dateToday': 'today',
  'chat.field.dateA11y': 'Date, YYYY-MM-DD. Empty means today',
  'chat.field.time': 'Time',
  'chat.field.timeNow': 'now',
  'chat.field.timeA11y': 'Time, HH:MM. Empty means now',
  'chat.field.note': 'Note',
  'chat.unit.km': 'km',
  'chat.unit.l': 'L',

  'chat.noChats': 'No chats yet.',
  'chat.messages.one': '{n} message',
  'chat.messages.other': '{n} messages',
  'chat.deleteChatA11y': 'Delete chat {title}',
});
