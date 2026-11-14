/**
 * Every area's table merged into one. Add an area here after creating
 * `strings/<area>.ts`; keys are prefixed with the area so they never collide.
 */

import { app } from './app';
import { common } from './common';
import { components } from './components';
import { form } from './form';
import { lib } from './lib';
import { services } from './services';
import { summary } from './summary';
import { welcome } from './welcome';

const AREAS = [common, welcome, components, services, summary, lib, app, form] as const;

type Merge<T extends readonly object[]> = T extends readonly [
  infer H extends object,
  ...infer R extends readonly object[],
]
  ? H & Merge<R>
  : unknown;

export const STRINGS = Object.assign({}, ...AREAS) as Merge<typeof AREAS>;
