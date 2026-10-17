/**
 * Every area's table merged per language. Add an area here after creating
 * `strings/<area>.ts`; keys are prefixed with the area so they never collide.
 */

import { app } from './app';
import { chat } from './chat';
import { common } from './common';
import { components } from './components';
import { form } from './form';
import { lib } from './lib';
import { services } from './services';
import { summary } from './summary';
import { welcome } from './welcome';

const AREAS = [common, chat, welcome, components, services, summary, lib, app, form] as const;

type Merge<T extends readonly { en: object }[]> = T extends readonly [
  infer H extends { en: object },
  ...infer R extends readonly { en: object }[],
]
  ? H['en'] & Merge<R>
  : unknown;

type En = Merge<typeof AREAS>;

function merge(lang: 'en' | 'hy' | 'ru'): Record<string, string> {
  return Object.assign({}, ...AREAS.map((a) => a[lang]));
}

export const STRINGS = {
  en: merge('en') as En,
  hy: merge('hy') as En,
  ru: merge('ru') as En,
};
