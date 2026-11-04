import { checkDatabaseConfig } from '../utils/middleware';

import { fileContentSecurity } from './contentSecurity.js';

export const onRequest = [fileContentSecurity, checkDatabaseConfig];