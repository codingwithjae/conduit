import { ConduitError, type ConduitErrorCode } from "../../../application/ports/conduit-error.js"

export type Fetcher = typeof fetch
export type JsonObject = Record<string, unknown>

export const asObject = (value: unknown): JsonObject | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  return value as JsonObject
}

const statusError = (status: number): { code: ConduitErrorCode; message: string } => {
  if (status === 429) return { code: "rate_limited", message: "Provider rate limit exceeded." }
  if (status === 401 || status === 403) {
    return { code: "provider_rejected", message: "Provider rejected the credential or request." }
  }
  if (status >= 500) return { code: "provider_unavailable", message: "Provider is currently unavailable." }
  return { code: "provider_rejected", message: "Provider rejected the request." }
}

export const requestJson = async (
  provider: string,
  fetcher: Fetcher,
  url: URL,
  init: Omit<RequestInit, "redirect" | "signal">,
): Promise<JsonObject> => {
  let response: Response
  try {
    response = await fetcher(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    throw new ConduitError("provider_unavailable", `${provider} request timed out.`)
  }

  if (response.status >= 300 && response.status < 400) {
    throw new ConduitError("redirect_blocked", `Conduit blocked a redirect from provider ${provider}.`)
  }
  if (!response.ok) {
    const error = statusError(response.status)
    throw new ConduitError(error.code, `${error.message} (HTTP ${response.status})`)
  }

  try {
    const result = asObject(await response.json())
    if (!result) throw new Error("not an object")
    return result
  } catch {
    throw new ConduitError("invalid_response", `${provider} returned an invalid response.`)
  }
}

export const textParts = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((part) => {
    const object = asObject(part)
    return typeof object?.text === "string" ? [object.text] : []
  })
}
