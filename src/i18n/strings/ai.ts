import { defineStrings } from '../define';

/** Strings for the ai area (the Gemini client, model picker, chat titles, cards). Keys are prefixed "ai.". */
export const ai = defineStrings({
  'ai.err.offline': 'No connection. The AI needs internet; everything else works offline.',
  'ai.err.timeout': 'Gemini took too long to answer. Try again.',
  'ai.err.cancelled': 'Cancelled.',
  'ai.err.badKey': 'Gemini rejected the API key. Check it in Settings → AI chat.',
  'ai.err.quota': 'Gemini quota used up for now. Try again later or pick another model.',
  'ai.err.blocked': 'Gemini refused to read this. Try another photo.',
  'ai.err.model': 'This model is not available for your key. Pick another one.',
  'ai.err.empty': 'Nothing usable came back. Try again, or a sharper photo.',
  'ai.err.server': 'Gemini had a problem. Try again in a moment.',

  'ai.model.fastest': 'Fastest, lowest cost',
  'ai.model.capable': 'Most capable Flash',
  'ai.model.previous': 'Previous Flash',
  'ai.model.olderLite': 'Older Flash-Lite',
  'ai.model.flagship': 'Flagship reasoning, slower',

  'ai.chat.newTitle': 'New chat',
  'ai.chat.photoTitle': 'Dashboard photo',

  'ai.card.gone': 'This entry is no longer in the log.',
  'ai.card.future': 'This date and time are in the future.',
});
