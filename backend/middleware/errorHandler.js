export function errorHandler(error, _request, response, _next) {
  const status =
    error.statusCode ??
    (error.code === 11000 ? 409 : error.name === "ValidationError" || error.name === "CastError" ? 400 : 500);

  if (status >= 500) {
    console.error(error);
  }

  response.status(status).json({
    error: status >= 500 ? "Internal server error" : error.message,
    ...(error.name === "ValidationError"
      ? { details: Object.values(error.errors).map((item) => item.message) }
      : {}),
  });
}
