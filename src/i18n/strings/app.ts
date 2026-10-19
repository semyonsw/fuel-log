import { defineStrings } from '../define';

/**
 * Strings for the app area (shell, History and Settings tabs, timeline rows,
 * the map); keys are prefixed "app.". The empty-state text names the form's
 * Trip / Range / Refuel buttons, so it must use the form's own words.
 */
export const app = defineStrings(
  {
    'app.tab.history': 'History',
    'app.tab.summary': 'Summary',
    'app.tab.settings': 'Settings',
    'app.fromGps': 'from GPS',

    'app.settings.language': 'Language',
    'app.settings.consumption': 'Car consumption',
    'app.settings.fromLog': '{n} from log',
    'app.settings.consumptionA11y': 'Consumption, litres per 100 km',
    'app.settings.consumptionUnit': 'L/100 km',
    'app.settings.consumptionHint': 'Leave blank to use the figure worked out from your refuels.',

    'app.log.today': 'Today: {driven} driven · ≈ {cost}',
    'app.log.todayNoCost': 'Today: {driven} driven',
    'app.log.week': 'This week: {driven} driven · {used} range used',
    'app.log.emptyTitle': 'Nothing logged yet',
    'app.log.emptyText':
      'Tap the + button below. Start with Range to note what the dashboard shows now, then log a Trip each time you drive: where from, where to, distance and range left. Log a refuel with the fuel-pump button.',
    'app.log.start': 'Start trip',
    'app.log.startHint': 'records the route with GPS',
    'app.log.startA11y': 'Start trip, record the route with GPS',
    'app.log.recording': 'Recording trip',
    'app.log.stop': 'Stop',
    'app.log.stopA11y': 'Stop trip',
    'app.log.bgTitle': 'Allow location all the time',
    'app.log.bgText':
      'To keep recording with the screen off, set Location to "Allow all the time" for Fuel Log.',
    'app.log.notNow': 'Not now',
    'app.log.openSettings': 'Open settings',
    'app.log.permTitle': 'Location is off for Fuel Log',
    'app.log.permText': 'Allow location to record a trip.',
    'app.log.failTitle': 'Could not start recording',
    'app.log.failText': 'Check that location is turned on, then try again.',

    'app.row.editHint': 'Edit this entry',
    'app.row.left': '{km} left',
    'app.row.used': 'used',

    'app.map.offline': 'Offline: map unavailable, route shown on a grid',
    'app.map.expand': 'Full-screen map',
    'app.map.close': 'Close map',
    'app.map.zoomIn': 'Zoom in',
    'app.map.zoomOut': 'Zoom out',
    'app.map.recenter': 'Show the whole route',
  },
  {
    'app.tab.history': 'Պատմություն',
    'app.tab.summary': 'Ամփոփում',
    'app.tab.settings': 'Կարգավորումներ',
    'app.fromGps': 'GPS-ից',

    'app.settings.language': 'Լեզու',
    'app.settings.consumption': 'Մեքենայի ծախսը',
    'app.settings.fromLog': '{n}՝ ըստ գրառումների',
    'app.settings.consumptionA11y': 'Ծախս, լիտր 100 կմ-ի վրա',
    'app.settings.consumptionUnit': 'լ/100 կմ',
    'app.settings.consumptionHint':
      'Թողեք դատարկ, և կօգտագործվի լիցքավորումներից հաշված ցուցանիշը։',

    'app.log.today': 'Այսօր՝ {driven} ճանապարհ · ≈ {cost}',
    'app.log.todayNoCost': 'Այսօր՝ {driven} ճանապարհ',
    'app.log.week': 'Այս շաբաթ՝ {driven} ճանապարհ · {used} ծախսված պաշար',
    'app.log.emptyTitle': 'Դեռ գրառումներ չկան',
    'app.log.emptyText':
      'Սեղմեք ներքևի + կոճակը։ Սկսեք «Պաշար»-ից՝ նշելու, թե ինչ է ցույց տալիս վահանակը հիմա, իսկ հետո ամեն երթից հետո գրանցեք «Ուղևորություն»՝ որտեղից, ուր, հեռավորությունը և մնացած պաշարը։ Լիցքավորումը գրանցեք վառելիքի պոմպի կոճակով։',
    'app.log.start': 'Սկսել ուղևորություն',
    'app.log.startHint': 'երթուղին կգրանցվի GPS-ով',
    'app.log.startA11y': 'Սկսել ուղևորություն, գրանցել երթուղին GPS-ով',
    'app.log.recording': 'Ուղևորությունը գրանցվում է',
    'app.log.stop': 'Ավարտել',
    'app.log.stopA11y': 'Ավարտել ուղևորությունը',
    'app.log.bgTitle': 'Թույլատրեք տեղորոշումը միշտ',
    'app.log.bgText':
      'Որպեսզի գրանցումը շարունակվի անջատված էկրանով, Fuel Log-ի տեղորոշման թույլտվությունը դրեք «Միշտ թույլատրել»։',
    'app.log.notNow': 'Ոչ հիմա',
    'app.log.openSettings': 'Բացել կարգավորումները',
    'app.log.permTitle': 'Fuel Log-ը տեղորոշման թույլտվություն չունի',
    'app.log.permText': 'Թույլատրեք տեղորոշումը՝ ուղևորությունը գրանցելու համար։',
    'app.log.failTitle': 'Չհաջողվեց սկսել գրանցումը',
    'app.log.failText': 'Ստուգեք, որ տեղորոշումը միացված է, և նորից փորձեք։',

    'app.row.editHint': 'Խմբագրել գրառումը',
    'app.row.left': '{km} մնաց',
    'app.row.used': 'ծախս',

    'app.map.offline': 'Անցանց․ քարտեզը հասանելի չէ, երթուղին ցանցի վրա է',
    'app.map.expand': 'Քարտեզը լիաէկրան',
    'app.map.close': 'Փակել քարտեզը',
    'app.map.zoomIn': 'Մեծացնել',
    'app.map.zoomOut': 'Փոքրացնել',
    'app.map.recenter': 'Ցույց տալ ամբողջ երթուղին',
  },
  {
    'app.tab.history': 'История',
    'app.tab.summary': 'Сводка',
    'app.tab.settings': 'Настройки',
    'app.fromGps': 'по GPS',

    'app.settings.language': 'Язык',
    'app.settings.consumption': 'Расход автомобиля',
    'app.settings.fromLog': '{n} по журналу',
    'app.settings.consumptionA11y': 'Расход, литров на 100 км',
    'app.settings.consumptionUnit': 'л/100 км',
    'app.settings.consumptionHint':
      'Оставьте пустым, чтобы брать расход, рассчитанный по заправкам.',

    'app.log.today': 'Сегодня: проехано {driven} · ≈ {cost}',
    'app.log.todayNoCost': 'Сегодня: проехано {driven}',
    'app.log.week': 'За неделю: проехано {driven} · израсходовано {used} запаса',
    'app.log.emptyTitle': 'Пока нет записей',
    'app.log.emptyText':
      'Нажмите кнопку + внизу. Начните с «Запаса»: отметьте, что сейчас показывает панель, а потом после каждой поездки добавляйте «Поездку»: откуда, куда, расстояние и остаток запаса хода. Заправку добавляйте кнопкой с колонкой.',
    'app.log.start': 'Начать поездку',
    'app.log.startHint': 'маршрут запишется по GPS',
    'app.log.startA11y': 'Начать поездку, записать маршрут по GPS',
    'app.log.recording': 'Идёт запись поездки',
    'app.log.stop': 'Стоп',
    'app.log.stopA11y': 'Остановить поездку',
    'app.log.bgTitle': 'Разрешите геолокацию всегда',
    'app.log.bgText':
      'Чтобы запись шла и с выключенным экраном, выберите для Fuel Log доступ к местоположению «Разрешить в любом режиме».',
    'app.log.notNow': 'Не сейчас',
    'app.log.openSettings': 'Открыть настройки',
    'app.log.permTitle': 'У Fuel Log нет доступа к геолокации',
    'app.log.permText': 'Разрешите доступ к геолокации, чтобы записать поездку.',
    'app.log.failTitle': 'Не удалось начать запись',
    'app.log.failText': 'Проверьте, что геолокация включена, и попробуйте ещё раз.',

    'app.row.editHint': 'Изменить запись',
    'app.row.left': 'осталось {km}',
    'app.row.used': 'расход',

    'app.map.offline': 'Офлайн: карта недоступна, маршрут показан на сетке',
    'app.map.expand': 'Карта на весь экран',
    'app.map.close': 'Закрыть карту',
    'app.map.zoomIn': 'Приблизить',
    'app.map.zoomOut': 'Отдалить',
    'app.map.recenter': 'Показать весь маршрут',
  },
);
