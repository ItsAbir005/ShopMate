import { logger } from "./logger";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

type FetchOptions = RequestInit & { token?: string };

export async function fetchApi(endpoint: string, options: FetchOptions = {}) {
    const { token: overrideToken, ...fetchOptions } = options;
    const token = overrideToken || (typeof window !== "undefined" ? localStorage.getItem("token") : null);

    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...fetchOptions.headers,
    };

    logger.debug(`API Request: ${fetchOptions.method || "GET"} ${endpoint}`);

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...fetchOptions,
        headers,
    });

    const requestId = response.headers.get("x-request-id") || undefined;

    let data: any = {};
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        data = await response.json().catch(() => ({}));
    } else {
        const text = await response.text();
        data = { message: `Unexpected response format: ${response.status} ${response.statusText}`, text };
    }

    if (!response.ok) {
        const serverReqId = requestId || data.requestId;
        const baseMessage = data.message || "An error occurred";
        const detailedMessage = serverReqId ? `${baseMessage} (Req ID: ${serverReqId})` : baseMessage;

        logger.error(`API Error ${response.status} on ${endpoint}: ${baseMessage}`, {
            status: response.status,
            requestId: serverReqId,
            data,
        });

        // Broadcast global API error so UI toast listener can display it
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("shopmate:api-error", {
                detail: {
                    message: detailedMessage,
                    rawMessage: baseMessage,
                    requestId: serverReqId,
                    status: response.status,
                }
            }));
        }

        if (response.status === 401) {
            const authErr = new Error("Token expired or unauthorized");
            (authErr as any).status = 401;
            (authErr as any).requestId = serverReqId;
            throw authErr;
        }

        const err = new Error(detailedMessage);
        (err as any).status = response.status;
        (err as any).requestId = serverReqId;
        throw err;
    }

    return data;
}
