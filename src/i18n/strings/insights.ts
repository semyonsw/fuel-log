import { defineStrings } from '../define';

/**
 * Strings for the AI chat's newer abilities: editing and deleting entries
 * through cards, past dates, and the suggestion chips. Keys are prefixed
 * "insights.". Plural families carry all four forms in every table, as in
 * chat.ts.
 */
export const insights = defineStrings(
  {
    'insights.chips.label': 'Try asking',
    'insights.chip.spent': 'How much did I spend this month?',
    'insights.chip.odd': 'Anything odd in my log?',
    'insights.chip.refuel': 'When should I refuel?',

    'insights.op.update': 'Edit',
    'insights.op.delete': 'Delete',
    'insights.change': '{old} → {new}',

    'insights.card.gone': 'This entry is no longer in the log.',
    'insights.card.future': 'This date and time are in the future.',

    'insights.field.date': 'Date',
    'insights.field.dateToday': 'today',
    'insights.field.dateA11y': 'Date, YYYY-MM-DD. Empty means today',
    'insights.field.note': 'Note',

    'insights.delete': 'Delete',
    'insights.deleteN.one': 'Delete {n} entry',
    'insights.deleteN.few': 'Delete {n} entries',
    'insights.deleteN.many': 'Delete {n} entries',
    'insights.deleteN.other': 'Delete {n} entries',
    'insights.apply': 'Save change',
    'insights.applyN.one': 'Save {n} change',
    'insights.applyN.few': 'Save {n} changes',
    'insights.applyN.many': 'Save {n} changes',
    'insights.applyN.other': 'Save {n} changes',

    'insights.updated': '✓ Updated in the log.',
    'insights.deleted': '✓ Deleted from the log.',
    'insights.savedChanges.one': '✓ {n} change saved to the log.',
    'insights.savedChanges.few': '✓ {n} changes saved to the log.',
    'insights.savedChanges.many': '✓ {n} changes saved to the log.',
    'insights.savedChanges.other': '✓ {n} changes saved to the log.',

    'insights.deleteFoot': 'Delete removes this from the log. It cannot be undone.',
    'insights.updateFoot': 'Save replaces the entry in the log with the values shown.',
  },
  {
    'insights.chips.label': 'Փորձեք հարցնել',
    'insights.chip.spent': 'Որքա՞ն եմ ծախսել այս ամիս',
    'insights.chip.odd': 'Կա՞ որևէ տարօրինակ բան իմ գրառումներում',
    'insights.chip.refuel': 'Ե՞րբ լիցքավորվեմ',

    'insights.op.update': 'Խմբագրում',
    'insights.op.delete': 'Ջնջում',
    'insights.change': '{old} → {new}',

    'insights.card.gone': 'Այս գրառումն այլևս մատյանում չէ։',
    'insights.card.future': 'Այս ամսաթիվն ու ժամը ապագայում են։',

    'insights.field.date': 'Ամսաթիվ',
    'insights.field.dateToday': 'այսօր',
    'insights.field.dateA11y': 'Ամսաթիվ, ՏՏՏՏ-ԱԱ-ՕՕ։ Դատարկը նշանակում է այսօր',
    'insights.field.note': 'Նշում',

    'insights.delete': 'Ջնջել',
    'insights.deleteN.one': 'Ջնջել {n} գրառում',
    'insights.deleteN.few': 'Ջնջել {n} գրառում',
    'insights.deleteN.many': 'Ջնջել {n} գրառում',
    'insights.deleteN.other': 'Ջնջել {n} գրառում',
    'insights.apply': 'Պահպանել փոփոխությունը',
    'insights.applyN.one': 'Պահպանել {n} փոփոխություն',
    'insights.applyN.few': 'Պահպանել {n} փոփոխություն',
    'insights.applyN.many': 'Պահպանել {n} փոփոխություն',
    'insights.applyN.other': 'Պահպանել {n} փոփոխություն',

    'insights.updated': '✓ Թարմացված է մատյանում։',
    'insights.deleted': '✓ Ջնջված է մատյանից։',
    'insights.savedChanges.one': '✓ {n} փոփոխություն պահպանված է մատյանում։',
    'insights.savedChanges.few': '✓ {n} փոփոխություն պահպանված է մատյանում։',
    'insights.savedChanges.many': '✓ {n} փոփոխություն պահպանված է մատյանում։',
    'insights.savedChanges.other': '✓ {n} փոփոխություն պահպանված է մատյանում։',

    'insights.deleteFoot': 'Ջնջելը այն հեռացնում է մատյանից։ Հնարավոր չէ հետ բերել։',
    'insights.updateFoot': 'Պահպանելը մատյանի գրառումը փոխարինում է ցույց տրված արժեքներով։',
  },
  {
    'insights.chips.label': 'Можно спросить',
    'insights.chip.spent': 'Сколько я потратил в этом месяце?',
    'insights.chip.odd': 'Есть ли что-то странное в журнале?',
    'insights.chip.refuel': 'Когда мне заправиться?',

    'insights.op.update': 'Изменение',
    'insights.op.delete': 'Удаление',
    'insights.change': '{old} → {new}',

    'insights.card.gone': 'Этой записи больше нет в журнале.',
    'insights.card.future': 'Эти дата и время ещё не наступили.',

    'insights.field.date': 'Дата',
    'insights.field.dateToday': 'сегодня',
    'insights.field.dateA11y': 'Дата, ГГГГ-ММ-ДД. Пусто — сегодня',
    'insights.field.note': 'Заметка',

    'insights.delete': 'Удалить',
    'insights.deleteN.one': 'Удалить {n} запись',
    'insights.deleteN.few': 'Удалить {n} записи',
    'insights.deleteN.many': 'Удалить {n} записей',
    'insights.deleteN.other': 'Удалить {n} записи',
    'insights.apply': 'Сохранить изменение',
    'insights.applyN.one': 'Сохранить {n} изменение',
    'insights.applyN.few': 'Сохранить {n} изменения',
    'insights.applyN.many': 'Сохранить {n} изменений',
    'insights.applyN.other': 'Сохранить {n} изменения',

    'insights.updated': '✓ Обновлено в журнале.',
    'insights.deleted': '✓ Удалено из журнала.',
    'insights.savedChanges.one': '✓ {n} изменение сохранено в журнале.',
    'insights.savedChanges.few': '✓ {n} изменения сохранены в журнале.',
    'insights.savedChanges.many': '✓ {n} изменений сохранено в журнале.',
    'insights.savedChanges.other': '✓ {n} изменения сохранены в журнале.',

    'insights.deleteFoot': 'Удаление убирает запись из журнала. Отменить нельзя.',
    'insights.updateFoot': 'Сохранение заменит запись в журнале показанными значениями.',
  },
);
