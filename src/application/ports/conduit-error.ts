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
  | "storage_corrupted"
  | "account_not_found"
  | "pool_empty"
  | "not_a_git_repository"
  | "git_not_found"
  | "service_offline"
  | "context_length_exceeded"
  | "confinement_violation"
  | "token_expired"
  | "token_revoked"

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
      const lowerMessage = error.message.toLowerCase()

      if (lowerMessage.includes("not a git repository")) {
        return new ConduitError(
          "not_a_git_repository",
          "Current directory is not a Git repository. Initialize git or run from a git repository.",
          error,
        )
      }

      if (lowerMessage.includes("econnrefused")) {
        return new ConduitError(
          "service_offline",
          "Connection refused. Verify that the local service (e.g. Ollama) is running.",
          error,
        )
      }

      if (lowerMessage.includes("context length") || lowerMessage.includes("maximum context")) {
        return new ConduitError(
          "context_length_exceeded",
          "The prompt exceeds the model's maximum context length.",
          error,
        )
      }

      if (error.name === "TimeoutError" || lowerMessage.includes("timeout")) {
        return new ConduitError("provider_unavailable", "Request timed out.", error)
      }

      if ("code" in error && (error as { code?: string }).code === "ENOENT") {
        if (lowerMessage.includes("git")) {
          return new ConduitError("git_not_found", "Git executable was not found in system PATH.", error)
        }
        return new ConduitError("storage_not_found", "Configuration file not found.", error)
      }

      return new ConduitError(fallbackCode, error.message, error)
    }

    return new ConduitError(fallbackCode, String(error || "Unexpected error."))
  }
}
