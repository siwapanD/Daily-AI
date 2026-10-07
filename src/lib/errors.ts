/** An error caused by the request or configuration (HTTP 400), not by a bug or outage. */
export class UserError extends Error {
  name = "UserError";
}
