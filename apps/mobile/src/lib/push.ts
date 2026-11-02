/** No push in the app's web preview; a phone loads push.native.ts. */
export const registerPush = async (): Promise<void> => {};
export const forgetPush = async (): Promise<void> => {};
export const onPushOpened = (_fn: () => void): (() => void) => () => {};
