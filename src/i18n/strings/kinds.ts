import { defineStrings } from '../define';

/**
 * Strings for the service and expense kinds shared by the form, the log, the
 * summary and the chat: kind names, categories, and the fields only these two
 * kinds have. Keys are prefixed "kinds.".
 */
export const kinds = defineStrings(
  {
    'kinds.service': 'Service',
    'kinds.expense': 'Expense',

    'kinds.service.oil': 'Oil change',
    'kinds.service.repair': 'Service / repair',
    'kinds.service.tires': 'Tires',
    'kinds.service.inspection': 'Technical inspection',
    'kinds.service.other': 'Other',

    'kinds.expense.insurance': 'Insurance',
    'kinds.expense.fines': 'Fines',
    'kinds.expense.taxes': 'Taxes / registration',
    'kinds.expense.parking': 'Parking',
    'kinds.expense.wash': 'Car wash',
    'kinds.expense.tolls': 'Tolls',
    'kinds.expense.parts': 'Parts',
    'kinds.expense.accessories': 'Accessories',
    'kinds.expense.other': 'Other',

    'kinds.field.category': 'Category',
    'kinds.field.cost': 'Cost',
    'kinds.field.amount': 'Amount',
    'kinds.field.odometer': 'Odometer',
    'kinds.field.place': 'Workshop / place (optional)',
    'kinds.field.remindKm': 'Remind after (km)',
    'kinds.field.remindMonths': 'Remind after (months)',

    'kinds.err.category': 'Pick a category',
    'kinds.err.cost': 'Enter the cost',
    'kinds.err.amount': 'Enter the amount',
    'kinds.err.remindKmNeedsOdometer': 'A km reminder needs the odometer',
  },
  {
    'kinds.service': 'Սպասարկում',
    'kinds.expense': 'Ծախս',

    'kinds.service.oil': 'Յուղի փոխարինում',
    'kinds.service.repair': 'Սպասարկում / վերանորոգում',
    'kinds.service.tires': 'Անվադողեր',
    'kinds.service.inspection': 'Տեխզննում',
    'kinds.service.other': 'Այլ',

    'kinds.expense.insurance': 'Ապահովագրություն',
    'kinds.expense.fines': 'Տուգանքներ',
    'kinds.expense.taxes': 'Հարկեր / գրանցում',
    'kinds.expense.parking': 'Կայանատեղի',
    'kinds.expense.wash': 'Լվացում',
    'kinds.expense.tolls': 'Ճանապարհավճար',
    'kinds.expense.parts': 'Պահեստամասեր',
    'kinds.expense.accessories': 'Աքսեսուարներ',
    'kinds.expense.other': 'Այլ',

    'kinds.field.category': 'Կատեգորիա',
    'kinds.field.cost': 'Արժեք',
    'kinds.field.amount': 'Գումար',
    'kinds.field.odometer': 'Վազքաչափ',
    'kinds.field.place': 'Արհեստանոց / վայր (ըստ ցանկության)',
    'kinds.field.remindKm': 'Հիշեցնել (կմ հետո)',
    'kinds.field.remindMonths': 'Հիշեցնել (ամիս հետո)',

    'kinds.err.category': 'Ընտրեք կատեգորիան',
    'kinds.err.cost': 'Մուտքագրեք արժեքը',
    'kinds.err.amount': 'Մուտքագրեք գումարը',
    'kinds.err.remindKmNeedsOdometer': 'Կմ հիշեցման համար պետք է վազքաչափը',
  },
  {
    'kinds.service': 'Обслуживание',
    'kinds.expense': 'Расход',

    'kinds.service.oil': 'Замена масла',
    'kinds.service.repair': 'ТО / ремонт',
    'kinds.service.tires': 'Шины',
    'kinds.service.inspection': 'Техосмотр',
    'kinds.service.other': 'Другое',

    'kinds.expense.insurance': 'Страховка',
    'kinds.expense.fines': 'Штрафы',
    'kinds.expense.taxes': 'Налоги / регистрация',
    'kinds.expense.parking': 'Парковка',
    'kinds.expense.wash': 'Мойка',
    'kinds.expense.tolls': 'Платные дороги',
    'kinds.expense.parts': 'Запчасти',
    'kinds.expense.accessories': 'Аксессуары',
    'kinds.expense.other': 'Другое',

    'kinds.field.category': 'Категория',
    'kinds.field.cost': 'Стоимость',
    'kinds.field.amount': 'Сумма',
    'kinds.field.odometer': 'Пробег (одометр)',
    'kinds.field.place': 'Сервис / место (необязательно)',
    'kinds.field.remindKm': 'Напомнить через (км)',
    'kinds.field.remindMonths': 'Напомнить через (мес.)',

    'kinds.err.category': 'Выберите категорию',
    'kinds.err.cost': 'Введите стоимость',
    'kinds.err.amount': 'Введите сумму',
    'kinds.err.remindKmNeedsOdometer': 'Для напоминания по км нужен пробег',
  },
);
