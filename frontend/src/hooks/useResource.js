import { useCallback, useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client.js";

export function useResource(url, refreshKey = 0) {
  const [state, setState] = useState({ requestKey: "", data: null, loading: true, error: "" });
  const [reloadCounter, setReloadCounter] = useState(0);
  const reload = useCallback(() => setReloadCounter((value) => value + 1), []);
  const requestKey = `${url}::${refreshKey}::${reloadCounter}`;

  useEffect(() => {
    let active = true;
    api.get(url)
      .then(({ data }) => {
        if (active) setState({ requestKey, data, loading: false, error: "" });
      })
      .catch((error) => {
        if (active) setState({ requestKey, data: null, loading: false, error: getErrorMessage(error) });
      });
    return () => { active = false; };
  }, [url, refreshKey, reloadCounter, requestKey]);

  if (state.requestKey !== requestKey) return { data: null, loading: true, error: "", reload };
  return { ...state, reload };
}
