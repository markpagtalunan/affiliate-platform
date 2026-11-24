import type { Config } from '../config/env.js';
import type { TokenVerifier } from '../config/firebase.js';
import type { Cache } from '../config/valkey.js';
import type { Repo } from '../repo/index.js';
import { AnalyticsService } from './analytics.js';
import { CoreService } from './core.js';
import { Notifier, type Mailer } from './email.js';
import { PackagesService } from './packages.js';

export interface Deps {
  config: Config;
  repo: Repo;
  cache: Cache;
  mailer: Mailer;
  verifier: TokenVerifier;
  fetchImpl?: typeof fetch;
}

export interface Services {
  core: CoreService;
  analytics: AnalyticsService;
  packages: PackagesService;
}

export function buildServices(d: Deps): Services {
  const notifier = new Notifier(d.mailer, [...d.config.adminEmails], d.config.frontendOrigins[0] ?? '');
  const core = new CoreService(d.config, d.repo, d.cache, notifier);
  return {
    core,
    analytics: new AnalyticsService(d.config, d.repo, d.cache, core),
    packages: new PackagesService(d.config, d.cache, d.fetchImpl),
  };
}
