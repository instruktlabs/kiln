// SPDX-License-Identifier: MIT
/** Shared by runtime loading and offline release receipts; no renderer imports. */
export const campusStartupModel = ({ path }: { path: string }) =>
  /^models\/(structures|vehicles|vegetation|freight)\//.test(path);
