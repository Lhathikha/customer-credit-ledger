import { useContext } from "react";
import { ToastContext } from "../context/toastContext.js";

export function useNotify() {
  return useContext(ToastContext);
}
