import { defineStrings } from '../define';

/** Strings for service reminders and the log's due banner; keys are prefixed "care.". */
export const care = defineStrings(
  {
    'care.banner.title': 'Car care',
    'care.in': 'in {what}',
    'care.overdueBy': 'overdue by {what}',
    'care.dueNow': 'due now',
    'care.days.one': '{n} day',
    'care.days.few': '{n} days',
    'care.days.many': '{n} days',
    'care.days.other': '{n} days',

    'care.notify.channel': 'Service reminders',
    'care.notify.due': '{label} due',
    'care.notify.week': '{label} in 7 days',
    'care.notify.soon': '{label} soon',
  },
  {
    'care.banner.title': 'Սպասարկում',
    'care.in': '{what} հետո',
    'care.overdueBy': 'ուշացում՝ {what}',
    'care.dueNow': 'ժամանակն է',
    'care.days.one': '{n} օր',
    'care.days.few': '{n} օր',
    'care.days.many': '{n} օր',
    'care.days.other': '{n} օր',

    'care.notify.channel': 'Սպասարկման հիշեցումներ',
    'care.notify.due': '{label}՝ ժամանակն է',
    'care.notify.week': '{label}՝ 7 օրից',
    'care.notify.soon': '{label}՝ շուտով',
  },
  {
    'care.banner.title': 'Обслуживание',
    'care.in': 'через {what}',
    'care.overdueBy': 'просрочено на {what}',
    'care.dueNow': 'пора',
    'care.days.one': '{n} день',
    'care.days.few': '{n} дня',
    'care.days.many': '{n} дней',
    'care.days.other': '{n} дня',

    'care.notify.channel': 'Напоминания об обслуживании',
    'care.notify.due': '{label}: пора',
    'care.notify.week': '{label} через 7 дней',
    'care.notify.soon': '{label}: скоро',
  },
);
