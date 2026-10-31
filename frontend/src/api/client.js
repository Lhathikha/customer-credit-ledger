import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

export function getErrorMessage(error) {
  if (error?.response?.data?.details?.length) return error.response.data.details.join(" ");
  return error?.response?.data?.error || error?.message || "Something went wrong. Please try again.";
}

export default api;
