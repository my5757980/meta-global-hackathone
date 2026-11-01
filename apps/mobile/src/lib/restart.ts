import { createContext, useContext } from "react";

/** Remount the whole app (a new server address): the token and every cache belong to the old server. */
export const RestartCtx = createContext<() => void>(() => {});
export const useRestart = () => useContext(RestartCtx);
