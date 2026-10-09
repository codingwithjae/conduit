export type ConduitErrorCode =
  | "missing_credentials"
  | "consent_required"
  | "invalid_input"
  | "unknown_provider"
  | "unknown_model"
  | "rate_limited"
  | "provider_rejected"
  | "provider_unavailable"
  | "invalid_response"
  | "redirect_blocked"
  | "storage_not_found"
  | "account_not_found"

export class ConduitError extends Error {
  readonly timestamp: string

  constructor(
    readonly code: ConduitErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = "ConduitError"
    this.timestamp = new Date().toISOString()
  }

  static from(error: unknown, fallbackCode: ConduitErrorCode = "provider_unavailable"): ConduitError {
    if (error instanceof ConduitError) {
      return error
    }

    if (error instanceof Error) {
      if (error.name === "TimeoutError" || error.message.toLowerCase().includes("timeout")) {
        return new ConduitError("provider_unavailable", "Request timed out.", error)
      }
      if ("code" in error && (error as { code?: string }).code === "ENOENT") {
        return new ConduitError("storage_not_found", "Configuration file not found.", error)
      }
      return new ConduitError(fallbackCode, error.message, error)
    }

    return new ConduitError(fallbackCode, String(error || "Unexpected error."))
  }
}
