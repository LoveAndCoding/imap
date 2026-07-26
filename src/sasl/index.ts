/**
 * SASL package surface (spec §1.1's future "./sasl" export subpath) + the
 * built-in mechanism REGISTRATION side effect. `mechanism.ts`'s registry is
 * module-level state that starts empty; something has to actually call
 * `registerMechanism()` for each built-in before the selection algorithm's
 * `createMechanism("PLAIN")` (spec §9.3) can find them. Importing this
 * module (directly, or transitively — `client/auth.ts` does) is what runs
 * that registration, exactly once (subsequent imports hit Node's module
 * cache, not a re-run).
 *
 * @module SASL
 */

import { createAnonymousMechanism } from "./anonymous";
import { createCramMd5Mechanism } from "./cram-md5";
import { createExternalMechanism } from "./external";
import { createOAuthBearerMechanism } from "./oauthbearer";
import { createPlainMechanism } from "./plain";
import { registerMechanism } from "./mechanism";
import { createScramSha1Mechanism, createScramSha256Mechanism } from "./scram";
import { createXOAuth2Mechanism } from "./xoauth2";

export * from "./mechanism";
export * from "./anonymous";
export * from "./cram-md5";
export * from "./external";
export * from "./oauthbearer";
export * from "./plain";
export * from "./scram";
export * from "./xoauth2";

registerMechanism(createPlainMechanism);
registerMechanism(createOAuthBearerMechanism);
registerMechanism(createXOAuth2Mechanism);
registerMechanism(createExternalMechanism);
registerMechanism(createCramMd5Mechanism);
registerMechanism(() => createScramSha256Mechanism());
registerMechanism(() => createScramSha1Mechanism());
registerMechanism(createAnonymousMechanism);
