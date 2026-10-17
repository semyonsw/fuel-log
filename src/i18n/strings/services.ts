import { defineStrings } from '../define';

/** Strings for the services area; keys are prefixed "services.". */
export const services = defineStrings(
  {
    'services.backup.writeFailed': 'Could not write to the backup folder. Pick it again.',
    'services.backup.readFailed': 'Could not read that file.',
    'services.tracking.title': 'Recording your trip',
    'services.tracking.body': 'Fuel Log is recording the route. Open the app to stop.',
  },
  {
    'services.backup.writeFailed': 'Չհաջողվեց գրել պահուստային թղթապանակում։ Ընտրեք այն կրկին։',
    'services.backup.readFailed': 'Չհաջողվեց կարդալ այդ ֆայլը։',
    'services.tracking.title': 'Ուղևորությունը գրանցվում է',
    'services.tracking.body': 'Fuel Log-ը գրանցում է երթուղին։ Կանգնեցնելու համար բացեք հավելվածը։',
  },
  {
    'services.backup.writeFailed': 'Не удалось записать в папку копий. Выберите её заново.',
    'services.backup.readFailed': 'Не удалось прочитать файл.',
    'services.tracking.title': 'Записываем поездку',
    'services.tracking.body': 'Fuel Log записывает маршрут. Откройте приложение, чтобы остановить.',
  },
);
